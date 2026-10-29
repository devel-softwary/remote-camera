import { loadConfig, wsUrl, queryParam, setStatus, formatBytes } from './common.js';
import { addRemoteIceCandidate, flushRemoteIceCandidates, webRtcFailureMessage } from './webrtc-ice.js';
import { capturePhoto, captureVideoFrame } from './photo-capture.js';
import { cameraDiagnostics, normalizeCameraControls, normalizedVideoPoint } from './camera-capabilities.js';
import { canRetryConnection, reconnectDelay } from './reconnect-policy.js';
import { createQueuedPhoto, deleteQueuedPhoto, listQueuedPhotos, listQueuedPhotosForProject, queuedPhotoSummary, queuePhoto } from './photo-upload-queue.js';

const video = document.querySelector('#localVideo');
const statusEl = document.querySelector('#status');
const infoEl = document.querySelector('#info');
const secureWarning = document.querySelector('#secureWarning');
const permissionCard = document.querySelector('#permissionCard');
const startBtn = document.querySelector('#start');
const controlsInfo = document.querySelector('#controlsInfo');
const localCameraSelect = document.querySelector('#localCameraSelect');
const cameraHint = document.querySelector('#cameraHint');
const localControls = document.querySelector('#localControls');
const localAreaSelect = document.querySelector('#localAreaSelect');
const localZoom = document.querySelector('#localZoom');
const localZoomGroup = document.querySelector('#localZoomGroup');
const localZoomValue = document.querySelector('#localZoomValue');
const localTorchBtn = document.querySelector('#localTorch');
const localFocusBtn = document.querySelector('#localFocus');
const localFocusDistance = document.querySelector('#localFocusDistance');
const localFocusDistanceGroup = document.querySelector('#localFocusDistanceGroup');
const localFocusDistanceValue = document.querySelector('#localFocusDistanceValue');
const localFlashMode = document.querySelector('#localFlashMode');
const localDiagnostics = document.querySelector('#localDiagnostics');
const localCaptureBtn = document.querySelector('#localCapture');
const uploadImmediately = document.querySelector('#uploadImmediately');
const syncLocalPhotosBtn = document.querySelector('#syncLocalPhotos');
const localQueueInfo = document.querySelector('#localQueueInfo');
const preferredCameraKey = 'remote-camera.preferredDeviceId';

const room = queryParam('room').toUpperCase();
const authToken = queryParam('token');
const localMode = queryParam('local') === '1';
document.body?.classList.toggle('local-mode', localMode);
localControls.hidden = !localMode;
if (localMode) infoEl.textContent = 'Avvia la fotocamera per iniziare il rilievo locale.';
if (!window.isSecureContext) secureWarning.classList.remove('hidden');

let config, ws, pc, dc, mobilePc, mobileDc, stream, currentTrack, sender, mobileSender;
let cameras = [];
let currentDeviceId = '';
let photoBusy = false;
let cameraBusy = false;
let centralOfferSent = false;
let pendingCentralIceCandidates = [];
let pendingMobileIceCandidates = [];
let reconnectAttempt = 0;
let reconnectTimer;
let peerDisconnectTimer;
let localProject = '';
let localActiveArea = '';
let localTorchOn = false;
let localSyncBusy = false;
let photoCapabilities = {};
let flashMode = 'off';
let localSessionReady;

function savedCamera() {
  try { return localStorage.getItem(preferredCameraKey) || ''; } catch { return ''; }
}

function renderCameraSelect() {
  localCameraSelect.replaceChildren();
  const available = [...cameras];
  if (currentTrack && !available.some(cam => cam.deviceId === currentDeviceId)) {
    available.unshift({ deviceId: currentDeviceId, label: currentTrack.label || 'Camera attiva' });
  }
  available.forEach((cam, index) => {
    const option = document.createElement('option');
    option.value = cam.deviceId;
    option.textContent = `${index + 1}. ${cam.label}`;
    option.selected = cam.deviceId === currentDeviceId;
    localCameraSelect.append(option);
  });
  localCameraSelect.disabled = cameraBusy || !currentTrack || available.length < 2;
  cameraHint.textContent = available.length < 2
    ? 'Il browser espone una sola fotocamera o non rende disponibile la lista. Se il video è in bianco e nero, prova ad aprire il link in un altro browser: questa pagina può scegliere solo i sensori esposti dal browser.'
    : 'Video in bianco e nero? Prova le altre fotocamere e scegli quella a colori. La scelta viene ricordata su questo browser.';
}

function sendSignal(msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function sendData(msg) {
  if (dc?.readyState === 'open') dc.send(JSON.stringify(msg));
}
function sendMobileData(msg) {
  if (mobileDc?.readyState === 'open') mobileDc.send(JSON.stringify(msg));
}

async function enumerateCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  cameras = devices.filter(d => d.kind === 'videoinput').map((d, i) => ({
    deviceId: d.deviceId,
    label: d.label || `Camera ${i + 1}`
  }));
}

function capabilitiesPayload() {
  if (!currentTrack) return {};
  const cap = currentTrack.getCapabilities?.() || {};
  const settings = currentTrack.getSettings?.() || {};
  return {
    cameras,
    activeDeviceId: settings.deviceId || currentDeviceId,
    label: currentTrack.label,
    settings,
    controls: { ...normalizeCameraControls(cap, settings, navigator.mediaDevices.getSupportedConstraints?.() || {}, photoCapabilities), flashMode }
  };
}

function renderLocalCameraInfo(payload) {
  if (!localMode) return;
  const controls = payload.controls || {};
  const cameraZoom = controls.zoom;
  if (cameraZoom) {
    localZoom.min = cameraZoom.min; localZoom.max = cameraZoom.max; localZoom.step = cameraZoom.step || 0.1; localZoom.value = cameraZoom.value ?? cameraZoom.min;
    localZoomValue.textContent = `${Number(localZoom.value).toFixed(1)}×`;
    localZoom.disabled = false; localZoomGroup.classList.remove('disabled-control');
  } else {
    localZoom.disabled = true; localZoomGroup.classList.add('disabled-control'); localZoomValue.textContent = 'N/D';
  }
  localTorchBtn.disabled = !controls.torch;
  localFocusBtn.disabled = !(controls.focusModes || []).length;
  const focusDistance = controls.focusDistance;
  const manualFocus = focusDistance && controls.focusModes?.includes('manual');
  if (manualFocus) {
    localFocusDistance.min = focusDistance.min; localFocusDistance.max = focusDistance.max; localFocusDistance.step = focusDistance.step; localFocusDistance.value = focusDistance.value;
    localFocusDistanceValue.textContent = Number(focusDistance.value).toFixed(2);
  }
  localFocusDistance.disabled = !manualFocus;
  localFocusDistanceGroup.hidden = !manualFocus;
  localFocusDistanceGroup.classList.toggle('disabled-control', !manualFocus);
  localFlashMode.replaceChildren(...(controls.flashModes || []).map(mode => new Option(mode, mode)));
  localFlashMode.value = controls.flashModes?.includes(flashMode) ? flashMode : (controls.flashModes?.[0] || '');
  localFlashMode.disabled = !(controls.flashModes || []).length;
  localDiagnostics.textContent = cameraDiagnostics(payload);
  video.classList.toggle('touch-focus', Boolean(controls.pointsOfInterest));
  localCaptureBtn.disabled = !currentTrack || !localActiveArea || photoBusy;
}

function publishCameraInfo() {
  renderCameraSelect();
  const payload = capabilitiesPayload();
  sendData({ type: 'camera-info', ...payload });
  sendMobileData({ type: 'camera-info', ...payload });
  renderLocalCameraInfo(payload);
  const s = payload.settings || {};
  controlsInfo.textContent = `${payload.label || 'Camera'} • ${s.width || '?'}×${s.height || '?'}${s.frameRate ? ` • ${Math.round(s.frameRate)} fps` : ''}`;
}

async function openCamera(deviceId = '') {
  const oldStream = stream;
  const previousSettings = currentTrack?.getSettings() || {};
  const resolution = sender
    ? { width: { ideal: previousSettings.width || 1280 }, height: { ideal: previousSettings.height || 720 }, frameRate: { ideal: previousSettings.frameRate || 30, max: 30 } }
    : { width: { ideal: 3840 }, height: { ideal: 2160 } };
  const constraints = {
    audio: false,
    video: deviceId
      ? { deviceId: { exact: deviceId }, ...resolution }
      : { facingMode: { ideal: 'environment' }, ...resolution }
  };
  let nextStream;
  try {
    nextStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    if (!cameraBusy || !['NotReadableError', 'AbortError'].includes(err.name)) throw err;
    // Release only when required, and allow the mobile camera driver to close.
    oldStream?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    await new Promise(resolve => setTimeout(resolve, 300));
    nextStream = await navigator.mediaDevices.getUserMedia(constraints);
  }
  const nextTrack = nextStream.getVideoTracks()[0];

  try {
    if (sender) await sender.replaceTrack(nextTrack);
    if (mobileSender) await mobileSender.replaceTrack(nextTrack);
  } catch (err) {
    nextStream.getTracks().forEach(track => track.stop());
    throw err;
  }
  stream = nextStream;
  currentTrack = nextTrack;
  photoCapabilities = {};
  if (typeof window.ImageCapture === 'function') {
    try { photoCapabilities = await new window.ImageCapture(currentTrack).getPhotoCapabilities(); } catch { photoCapabilities = {}; }
  }
  const availableFlashModes = Array.isArray(photoCapabilities.fillLightMode) ? photoCapabilities.fillLightMode : [];
  flashMode = availableFlashModes.includes(flashMode) ? flashMode : (availableFlashModes[0] || '');
  currentDeviceId = nextTrack.getSettings().deviceId || deviceId;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  if (oldStream) oldStream.getTracks().forEach(t => t.stop());
  await video.play();
  // Device enumeration is optional: an unavailable list must not block pairing.
  try { await enumerateCameras(); } catch { cameras = []; }
  publishCameraInfo();
}

async function switchCamera(deviceId) {
  if (cameraBusy || photoBusy) throw new Error('Operazione in corso. Riprova tra poco.');
  if (!deviceId || deviceId === currentDeviceId) return;
  const previousDeviceId = currentDeviceId;
  cameraBusy = true;
  renderCameraSelect();
  try {
    await openCamera(deviceId);
    try { localStorage.setItem(preferredCameraKey, currentDeviceId); } catch { /* Storage is optional. */ }
  } catch (err) {
    // A failed acquisition leaves the original live track usable.
    try {
      if (currentDeviceId !== previousDeviceId || currentTrack?.readyState !== 'live') {
        stream?.getTracks().forEach(track => track.stop());
        await openCamera(previousDeviceId);
      }
      publishCameraInfo();
    }
    catch {
      stream?.getTracks().forEach(track => track.stop());
      stream = currentTrack = undefined;
      video.srcObject = null;
      controlsInfo.textContent = 'Camera non attiva. Genera una nuova sessione e riapri il link.';
    }
    throw err;
  } finally {
    cameraBusy = false;
    renderCameraSelect();
  }
}

localCameraSelect.addEventListener('change', async () => {
  infoEl.textContent = 'Cambio fotocamera in corso…';
  try {
    await switchCamera(localCameraSelect.value);
    infoEl.textContent = 'Fotocamera selezionata. Controlla i colori nell’anteprima.';
  } catch (err) {
    infoEl.textContent = `Cambio non riuscito: ${startupErrorMessage(err)}`;
  }
});

function createPeer() {
  if (pc) { pc.onconnectionstatechange = null; pc.close(); }
  pendingCentralIceCandidates = [];
  const peer = pc = new RTCPeerConnection({ iceServers: config.iceServers });
  sender = peer.addTrack(currentTrack, stream);
  dc = peer.createDataChannel('remote-control', { ordered: true });
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = 256 * 1024;

  dc.onopen = () => {
    setStatus(statusEl, 'Controller collegato', 'ok');
    publishCameraInfo();
    sendData({ type: 'camera-ready' });
  };
  dc.onclose = () => setStatus(statusEl, 'Canale controlli chiuso', 'warn');
  dc.onmessage = async e => {
    if (typeof e.data !== 'string') return;
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    try { await handleCommand(msg); }
    catch (err) { sendData({ type: 'command-error', command: msg.type, requestId: msg.requestId, message: err.message }); }
  };

  peer.onicecandidate = e => e.candidate && sendSignal({ type: 'ice-candidate', candidate: e.candidate });
  peer.onconnectionstatechange = () => {
    if (peer !== pc) return;
    const s = peer.connectionState;
    if (s === 'connected') {
      if (peerDisconnectTimer) clearTimeout(peerDisconnectTimer);
      peerDisconnectTimer = undefined;
      setStatus(statusEl, 'Video collegato', 'ok');
    } else if (s === 'failed') {
      setStatus(statusEl, webRtcFailureMessage(s), 'warn');
      infoEl.textContent = webRtcFailureMessage(s);
      requestReconnect();
    } else if (s === 'disconnected' && !peerDisconnectTimer) {
      setStatus(statusEl, webRtcFailureMessage(s), 'warn');
      infoEl.textContent = webRtcFailureMessage(s);
      peerDisconnectTimer = setTimeout(() => {
        peerDisconnectTimer = undefined;
        if (peer === pc && peer.connectionState === 'disconnected') requestReconnect();
      }, 5000);
    }
  };
}

function createMobilePeer() {
  if (mobilePc) { mobilePc.onconnectionstatechange = null; mobilePc.close(); }
  pendingMobileIceCandidates = [];
  const peer = mobilePc = new RTCPeerConnection({ iceServers: config.iceServers });
  mobileSender = peer.addTrack(currentTrack, stream);
  mobileDc = peer.createDataChannel('remote-control', { ordered: true });
  mobileDc.binaryType = 'arraybuffer';
  mobileDc.onopen = () => publishCameraInfo();
  mobileDc.onmessage = async e => {
    if (typeof e.data !== 'string') return;
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    try { await handleCommand(msg); sendMobileData({ type: 'command-complete', command: msg.type, requestId: msg.requestId }); }
    catch (err) { sendMobileData({ type: 'command-error', command: msg.type, requestId: msg.requestId, message: err.message }); }
  };
  peer.onicecandidate = e => e.candidate && sendSignal({ type: 'ice-candidate', candidate: e.candidate, targetRole: 'controller-mobile' });
  peer.onconnectionstatechange = () => {
    if (peer === mobilePc && ['failed', 'closed'].includes(peer.connectionState)) { mobilePc = mobileDc = mobileSender = undefined; }
  };
}

async function sendOffer(targetRole = 'controller-central') {
  const peer = targetRole === 'controller-mobile' ? mobilePc : pc;
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  sendSignal({ type: 'webrtc-offer', sdp: peer.localDescription, targetRole });
}

async function applyAdvanced(obj) {
  if (!currentTrack) throw new Error('Camera non attiva');
  await currentTrack.applyConstraints({ advanced: [obj] });
  publishCameraInfo();
}

async function autofocus() {
  const cap = currentTrack.getCapabilities?.() || {};
  const modes = cap.focusMode || [];
  if (modes.includes('single-shot')) {
    await applyAdvanced({ focusMode: 'single-shot' });
  } else if (modes.includes('continuous')) {
    await applyAdvanced({ focusMode: 'continuous' });
  } else {
    throw new Error('Autofocus remoto non supportato da questa camera/browser');
  }
}

async function setFocusDistance(value) {
  const cap = currentTrack?.getCapabilities?.() || {};
  if (!cap.focusMode?.includes('manual') || !cap.focusDistance) throw new Error('Messa a fuoco manuale non supportata');
  const distance = Number(value);
  if (!Number.isFinite(distance) || distance < cap.focusDistance.min || distance > cap.focusDistance.max) throw new Error('Distanza di messa a fuoco non valida');
  await applyAdvanced({ focusMode: 'manual', focusDistance: distance });
}

async function focusAtPoint(x, y) {
  const controls = capabilitiesPayload().controls;
  if (!controls.pointsOfInterest) throw new Error('Touch-to-focus non supportato');
  const point = { x: Math.min(1, Math.max(0, Number(x))), y: Math.min(1, Math.max(0, Number(y))) };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Punto di messa a fuoco non valido');
  const focusMode = controls.focusModes.includes('single-shot') ? 'single-shot' : 'continuous';
  await applyAdvanced({ pointsOfInterest: [point], focusMode });
}

async function waitForBuffer() {
  if (dc.bufferedAmount < 1024 * 1024) return;
  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 5000);
    const handler = () => { clearTimeout(timeout); dc.removeEventListener('bufferedamountlow', handler); resolve(); };
    dc.addEventListener('bufferedamountlow', handler, { once: true });
  });
}

async function sendPhoto(requestId) {
  if (cameraBusy) throw new Error('Cambio fotocamera in corso. Riprova tra poco.');
  if (photoBusy) throw new Error('Scatto già in corso');
  photoBusy = true;
  try {
    const frame = captureVideoFrame(video, currentTrack);
    sendData({ type: 'photo-captured', requestId, createdAt: frame.createdAt });
    sendMobileData({ type: 'photo-captured', requestId, createdAt: frame.createdAt });
    infoEl.textContent = 'Foto scattata. Preparazione invio…';
    const { blob } = await capturePhoto(frame, currentTrack, flashMode ? { fillLightMode: flashMode } : {}, window.ImageCapture);
    const buffer = await blob.arrayBuffer();
    const chunkSize = 64 * 1024;
    const chunks = Math.ceil(buffer.byteLength / chunkSize);
    sendData({
      type: 'photo-start', requestId, mime: blob.type || 'image/jpeg', size: buffer.byteLength,
      chunks, createdAt: frame.createdAt, width: frame.width, height: frame.height
    });
    for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
      await waitForBuffer();
      dc.send(buffer.slice(offset, Math.min(offset + chunkSize, buffer.byteLength)));
    }
    sendData({ type: 'photo-end', requestId });
    infoEl.textContent = `Foto inviata • ${formatBytes(buffer.byteLength)}`;
  } finally { photoBusy = false; }
}

async function refreshLocalQueue() {
  if (!localMode) return;
  try {
    const records = localProject ? await listQueuedPhotosForProject(localProject) : await listQueuedPhotos(room);
    const summary = queuedPhotoSummary(records);
    localQueueInfo.textContent = summary.count
      ? `${summary.count} foto in attesa • ${formatBytes(summary.bytes)}`
      : 'Nessuna foto in attesa.';
    syncLocalPhotosBtn.disabled = localSyncBusy || !summary.count;
  } catch {
    localQueueInfo.textContent = 'Archivio locale non disponibile.';
    syncLocalPhotosBtn.disabled = true;
  }
}

async function uploadLocalPhoto(record) {
  const response = await fetch('/api/photos', {
    method: 'POST',
    headers: {
      'content-type': record.blob.type || 'image/jpeg', 'x-room': room, 'x-camera-token': authToken,
      'x-project': localProject, 'x-area': record.area, 'x-capture-id': record.id
    },
    body: record.blob
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Upload non riuscito.');
  await deleteQueuedPhoto(record.id);
  return response.json();
}

async function syncLocalPhotos() {
  if (!localMode || localSyncBusy) return;
  let records;
  try { records = localProject ? await listQueuedPhotosForProject(localProject) : await listQueuedPhotos(room); }
  catch { infoEl.textContent = 'Archivio locale non disponibile.'; return; }
  const summary = queuedPhotoSummary(records);
  if (!records.length) return refreshLocalQueue();
  if (!window.confirm(`Sincronizzare ${summary.count} foto (${formatBytes(summary.bytes)}) usando la connessione attuale?`)) return;
  localSyncBusy = true;
  syncLocalPhotosBtn.disabled = true;
  try {
    for (const record of records) {
      infoEl.textContent = `Invio ${record.area} • ${formatBytes(record.size)}…`;
      await uploadLocalPhoto(record);
    }
    infoEl.textContent = records.length ? `${records.length} foto sincronizzate.` : 'Nessuna foto da sincronizzare.';
  } catch (error) {
    infoEl.textContent = `Foto conservate sul telefono: ${error.message}`;
  } finally {
    localSyncBusy = false;
    await refreshLocalQueue();
  }
}

async function captureLocalPhoto() {
  if (!localMode || photoBusy || cameraBusy || !localProject || !localActiveArea) return;
  photoBusy = true;
  localCaptureBtn.disabled = true;
  try {
    const frame = captureVideoFrame(video, currentTrack);
    infoEl.textContent = 'Foto scattata. Salvataggio locale…';
    const { blob } = await capturePhoto(frame, currentTrack, flashMode ? { fillLightMode: flashMode } : {}, window.ImageCapture);
    const record = createQueuedPhoto({
      id: crypto.randomUUID(), room, project: localProject, area: localActiveArea,
      blob, createdAt: frame.createdAt, width: frame.width, height: frame.height
    });
    await queuePhoto(record);
    infoEl.textContent = `Foto salvata sul telefono • ${formatBytes(blob.size)}`;
    await refreshLocalQueue();
    if (uploadImmediately.checked) {
      infoEl.textContent = 'Caricamento foto…';
      await uploadLocalPhoto(record);
      infoEl.textContent = `Foto caricata in “${record.area}”.`;
      await refreshLocalQueue();
    }
  } catch (error) {
    infoEl.textContent = `Errore scatto: ${error.message}`;
  } finally {
    photoBusy = false;
    localCaptureBtn.disabled = !currentTrack || !localActiveArea;
  }
}

function renderLocalSession(message) {
  if (!localMode) return;
  localProject = message.project || localProject;
  const areas = Array.isArray(message.areas) ? message.areas : [];
  const selectedBeforeRender = localAreaSelect.value;
  if (areas.length) {
    localAreaSelect.replaceChildren(...areas.map(area => new Option(area.name, area.name)));
    localAreaSelect.disabled = false;
  }
  localActiveArea = areas.some(area => area.name === selectedBeforeRender)
    ? selectedBeforeRender
    : (areas.some(area => area.name === message.activeArea) ? message.activeArea : (areas[0]?.name || localActiveArea));
  localAreaSelect.value = localActiveArea;
  if (message.activeArea && message.activeArea !== localActiveArea) sendSignal({ type: 'session-area', area: localActiveArea });
  localCaptureBtn.disabled = !currentTrack || !localActiveArea || photoBusy;
  void refreshLocalQueue();
}

function ensureLocalSession() {
  if (!localMode) return Promise.resolve();
  if (!localSessionReady) {
    localSessionReady = fetch('/api/field-session', { headers: { 'x-room': room, 'x-camera-token': authToken } })
      .then(async response => {
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Sessione locale non disponibile.');
        const message = await response.json();
        renderLocalSession(message);
        return message;
      })
      .catch(error => { localSessionReady = undefined; throw error; });
  }
  return localSessionReady;
}

async function handleCommand(msg) {
  switch (msg.type) {
    case 'capture': return sendPhoto(msg.requestId);
    case 'set-zoom': return applyAdvanced({ zoom: Number(msg.value) });
    case 'set-torch': return applyAdvanced({ torch: Boolean(msg.value) });
    case 'autofocus': return autofocus();
    case 'set-focus-distance': return setFocusDistance(msg.value);
    case 'focus-at-point': return focusAtPoint(msg.x, msg.y);
    case 'set-flash-mode': {
      const modes = capabilitiesPayload().controls.flashModes || [];
      if (!modes.includes(msg.value)) throw new Error('Modalità flash non supportata');
      flashMode = msg.value;
      return publishCameraInfo();
    }
    case 'switch-camera': await switchCamera(String(msg.deviceId || '')); return;
    case 'get-camera-info': return publishCameraInfo();
  }
}

function resetPeerConnections() {
  if (peerDisconnectTimer) clearTimeout(peerDisconnectTimer);
  peerDisconnectTimer = undefined;
  if (mobilePc) { mobilePc.onconnectionstatechange = null; mobilePc.close(); }
  mobilePc = mobileDc = mobileSender = undefined;
  centralOfferSent = false;
  if (!localMode) createPeer();
}

function requestReconnect() {
  if (ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(ws.readyState)) ws.close(4000, 'Riconnessione trasporto');
  else scheduleReconnect(0);
}

function scheduleReconnect(closeCode) {
  if (!canRetryConnection(closeCode) || reconnectTimer) return;
  const delay = reconnectDelay(reconnectAttempt++);
  setStatus(statusEl, `Connessione persa. Nuovo tentativo tra ${Math.ceil(delay / 1000)} s`, 'warn');
  infoEl.textContent = 'La camera resta attiva e si ricollegherà automaticamente.';
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connectWs();
  }, delay);
}

function connectWs() {
  resetPeerConnections();
  const socket = ws = new WebSocket(wsUrl());
  let terminalConnectionMessage = '';
  socket.onopen = () => sendSignal({ type: 'join', room, role: 'camera', token: authToken, localMode });
  socket.onclose = e => {
    if (socket !== ws) return;
    ws = undefined;
    if (!canRetryConnection(e.code)) {
      setStatus(statusEl, terminalConnectionMessage || (e.code === 4001 ? 'Camera sostituita da un altro dispositivo' : 'Pairing non valido/scaduto'), 'warn');
      return;
    }
    scheduleReconnect(e.code);
  };
  socket.onerror = () => setStatus(statusEl, 'Errore WebSocket', 'warn');
  socket.onmessage = async event => {
    if (socket !== ws) return;
    const msg = JSON.parse(event.data);
    try {
      if (msg.type === 'error') { terminalConnectionMessage = msg.message; throw new Error(msg.message); }
      if (msg.type === 'joined') {
        reconnectAttempt = 0;
        setStatus(statusEl, `Pairing ${msg.room} riuscito`, 'ok');
        infoEl.textContent = localMode ? 'Modalità locale pronta.' : 'Camera collegata. Pronta per lo scatto.';
      }
      else if (msg.type === 'session-status') {
        renderLocalSession(msg);
        if (!localMode) {
          if (msg.controller && !centralOfferSent) { await sendOffer('controller-central'); centralOfferSent = true; }
          if (!msg.controller) centralOfferSent = false;
          if (msg.mobileController && !mobilePc) { createMobilePeer(); await sendOffer('controller-mobile'); }
          if (!msg.mobileController && mobilePc) { mobilePc.close(); mobilePc = mobileDc = mobileSender = undefined; }
        }
      } else if (msg.type === 'webrtc-answer') {
        const peer = msg.from === 'controller-mobile' ? mobilePc : pc;
        const pendingCandidates = msg.from === 'controller-mobile' ? pendingMobileIceCandidates : pendingCentralIceCandidates;
        if (peer) {
          await peer.setRemoteDescription(msg.sdp);
          await flushRemoteIceCandidates(peer, pendingCandidates);
        }
      } else if (msg.type === 'ice-candidate' && msg.candidate) {
        const peer = msg.from === 'controller-mobile' ? mobilePc : pc;
        const pendingCandidates = msg.from === 'controller-mobile' ? pendingMobileIceCandidates : pendingCentralIceCandidates;
        if (peer) await addRemoteIceCandidate(peer, pendingCandidates, msg.candidate);
      } else if (msg.type === 'camera-command') {
        try {
          await handleCommand(msg.command || {});
          sendSignal({ type: 'camera-command-result', result: { ok: true, command: msg.command?.type, requestId: msg.command?.requestId } });
        } catch (err) {
          sendSignal({ type: 'camera-command-result', result: { ok: false, command: msg.command?.type, requestId: msg.command?.requestId, message: err.message } });
        }
      }
    } catch (err) {
      infoEl.textContent = `Errore: ${err.message}`;
      setStatus(statusEl, err.message, 'warn');
    }
  };
}

async function start() {
  if (!room || !authToken) throw new Error('Link di pairing incompleto. Scansiona il QR del controller.');
  if (localMode) await ensureLocalSession();
  if (!window.isSecureContext) throw new Error('La fotocamera richiede un link HTTPS con certificato attendibile sul telefono. Apri il controller tramite HTTPS e genera un nuovo QR.');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Fotocamera non disponibile in questo browser. Apri il link in Safari su iPhone o Chrome su Android, fuori dal lettore QR o dalle app di messaggistica.');
  setStatus(statusEl, 'Autorizza la fotocamera', 'warn');
  infoEl.textContent = 'Consenti l’accesso alla fotocamera nella richiesta del browser.';
  const preferredDeviceId = savedCamera();
  try { await openCamera(preferredDeviceId); }
  catch (err) {
    if (!preferredDeviceId || !['NotFoundError', 'OverconstrainedError'].includes(err.name)) throw err;
    await openCamera();
  }
  setStatus(statusEl, 'Camera attiva, collegamento in corso', 'warn');
  config = localMode ? { iceServers: [] } : await loadConfig();
  connectWs();
  permissionCard.classList.add('hidden');
  if (localMode) {
    void navigator.storage?.persist?.();
    await refreshLocalQueue();
  }
  infoEl.textContent = localMode ? 'Camera avviata. Connessione al lavoro…' : 'Camera avviata. In attesa del controller.';
}

function startupErrorMessage(err) {
  switch (err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Accesso alla fotocamera negato. Consenti la fotocamera nelle impostazioni del sito e del browser, poi riprova. Se il link è aperto dentro un’altra app, aprilo in Safari o Chrome.';
    case 'NotFoundError':
      return 'Nessuna fotocamera disponibile sul dispositivo.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Impossibile avviare la fotocamera. Chiudi le altre app che la usano e riprova.';
    default:
      return err.message || 'Avvio non riuscito. Riprova.';
  }
}

localAreaSelect.addEventListener('change', () => {
  localActiveArea = localAreaSelect.value;
  localCaptureBtn.disabled = !currentTrack || !localActiveArea || photoBusy;
  sendSignal({ type: 'session-area', area: localActiveArea });
});
localZoom.addEventListener('input', async () => {
  localZoomValue.textContent = `${Number(localZoom.value).toFixed(1)}×`;
  try { await applyAdvanced({ zoom: Number(localZoom.value) }); }
  catch (error) { infoEl.textContent = `Zoom non disponibile: ${error.message}`; }
});
localTorchBtn.addEventListener('click', async () => {
  localTorchOn = !localTorchOn;
  try {
    await applyAdvanced({ torch: localTorchOn });
    localTorchBtn.textContent = localTorchOn ? '🔦 Torcia ON' : '🔦 Torcia OFF';
  } catch (error) {
    localTorchOn = !localTorchOn;
    infoEl.textContent = `Torcia non disponibile: ${error.message}`;
  }
});
localFocusBtn.addEventListener('click', async () => {
  try { await autofocus(); infoEl.textContent = 'Autofocus richiesto.'; }
  catch (error) { infoEl.textContent = error.message; }
});
localFocusDistance.addEventListener('input', () => {
  localFocusDistanceValue.textContent = Number(localFocusDistance.value).toFixed(2);
});
localFocusDistance.addEventListener('change', async () => {
  try { await setFocusDistance(localFocusDistance.value); }
  catch (error) { infoEl.textContent = error.message; }
});
localFlashMode.addEventListener('change', () => { flashMode = localFlashMode.value; publishCameraInfo(); });
video.addEventListener('click', async event => {
  if (!localMode || !capabilitiesPayload().controls.pointsOfInterest) return;
  const point = normalizedVideoPoint(event.clientX, event.clientY, video.getBoundingClientRect(), video.videoWidth, video.videoHeight);
  if (!point) return;
  try { await focusAtPoint(point.x, point.y); infoEl.textContent = 'Messa a fuoco sul punto richiesta.'; }
  catch (error) { infoEl.textContent = error.message; }
});
localCaptureBtn.addEventListener('click', captureLocalPhoto);
syncLocalPhotosBtn.addEventListener('click', syncLocalPhotos);

if (localMode) {
  void ensureLocalSession()
    .then(() => { infoEl.textContent = 'Punti caricati. Scegli il punto e avvia la fotocamera.'; })
    .catch(error => { infoEl.textContent = error.message; setStatus(statusEl, 'Sessione locale non disponibile', 'warn'); });
}

startBtn.addEventListener('click', async () => {
  if (startBtn.disabled) return;
  startBtn.disabled = true;
  startBtn.textContent = 'Avvio in corso…';
  try { await start(); }
  catch (err) {
    ws?.close();
    pc?.close();
    stream?.getTracks().forEach(track => track.stop());
    ws = pc = dc = mobilePc = mobileDc = stream = currentTrack = sender = mobileSender = undefined;
    localCameraSelect.disabled = true;
    video.srcObject = null;
    controlsInfo.textContent = 'Camera non avviata.';
    setStatus(statusEl, 'Errore avvio', 'warn');
    infoEl.textContent = startupErrorMessage(err);
    permissionCard.classList.remove('hidden');
    startBtn.disabled = false;
    startBtn.textContent = 'Riprova: consenti camera e collega';
  }
});
