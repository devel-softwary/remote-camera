import { loadConfig, wsUrl, queryParam, setStatus, formatBytes } from './common.js';
import { addRemoteIceCandidate, flushRemoteIceCandidates } from './webrtc-ice.js';

const video = document.querySelector('#localVideo');
const statusEl = document.querySelector('#status');
const infoEl = document.querySelector('#info');
const secureWarning = document.querySelector('#secureWarning');
const permissionCard = document.querySelector('#permissionCard');
const startBtn = document.querySelector('#start');
const controlsInfo = document.querySelector('#controlsInfo');
const localCameraSelect = document.querySelector('#localCameraSelect');
const cameraHint = document.querySelector('#cameraHint');
const preferredCameraKey = 'remote-camera.preferredDeviceId';

const room = queryParam('room').toUpperCase();
const authToken = queryParam('token');
if (!window.isSecureContext) secureWarning.classList.remove('hidden');

let config, ws, pc, dc, mobilePc, mobileDc, stream, currentTrack, sender, mobileSender;
let cameras = [];
let currentDeviceId = '';
let photoBusy = false;
let cameraBusy = false;
let centralOfferSent = false;
let pendingCentralIceCandidates = [];
let pendingMobileIceCandidates = [];

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
    controls: {
      zoom: cap.zoom ? { min: cap.zoom.min, max: cap.zoom.max, step: cap.zoom.step || 0.1, value: settings.zoom ?? cap.zoom.min } : null,
      torch: Array.isArray(cap.torch) ? cap.torch.includes(true) : Boolean(cap.torch),
      focusModes: cap.focusMode || [],
      focusDistance: cap.focusDistance ? { min: cap.focusDistance.min, max: cap.focusDistance.max, step: cap.focusDistance.step || 0.01 } : null
    }
  };
}

function publishCameraInfo() {
  renderCameraSelect();
  const payload = capabilitiesPayload();
  sendData({ type: 'camera-info', ...payload });
  sendMobileData({ type: 'camera-info', ...payload });
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
  if (pc) pc.close();
  pendingCentralIceCandidates = [];
  pc = new RTCPeerConnection({ iceServers: config.iceServers });
  sender = pc.addTrack(currentTrack, stream);
  dc = pc.createDataChannel('remote-control', { ordered: true });
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

  pc.onicecandidate = e => e.candidate && sendSignal({ type: 'ice-candidate', candidate: e.candidate });
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'connected') setStatus(statusEl, 'Video collegato', 'ok');
    else if (['failed', 'disconnected'].includes(s)) setStatus(statusEl, `WebRTC ${s}`, 'warn');
  };
}

function createMobilePeer() {
  if (mobilePc) mobilePc.close();
  pendingMobileIceCandidates = [];
  mobilePc = new RTCPeerConnection({ iceServers: config.iceServers });
  mobileSender = mobilePc.addTrack(currentTrack, stream);
  mobileDc = mobilePc.createDataChannel('remote-control', { ordered: true });
  mobileDc.binaryType = 'arraybuffer';
  mobileDc.onopen = () => publishCameraInfo();
  mobileDc.onmessage = async e => {
    if (typeof e.data !== 'string') return;
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    try { await handleCommand(msg); sendMobileData({ type: 'command-complete', command: msg.type, requestId: msg.requestId }); }
    catch (err) { sendMobileData({ type: 'command-error', command: msg.type, requestId: msg.requestId, message: err.message }); }
  };
  mobilePc.onicecandidate = e => e.candidate && sendSignal({ type: 'ice-candidate', candidate: e.candidate, targetRole: 'controller-mobile' });
  mobilePc.onconnectionstatechange = () => {
    if (['failed', 'closed'].includes(mobilePc.connectionState)) { mobilePc = mobileDc = mobileSender = undefined; }
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

async function captureBlob() {
  if (!currentTrack) throw new Error('Camera non attiva');
  if ('ImageCapture' in window) {
    try {
      const ic = new ImageCapture(currentTrack);
      return await ic.takePhoto();
    } catch (e) { console.warn('takePhoto fallback', e); }
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || currentTrack.getSettings().width || 1920;
  canvas.height = video.videoHeight || currentTrack.getSettings().height || 1080;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Impossibile creare JPEG')), 'image/jpeg', 0.97));
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
    const blob = await captureBlob();
    const buffer = await blob.arrayBuffer();
    const chunkSize = 64 * 1024;
    const chunks = Math.ceil(buffer.byteLength / chunkSize);
    sendData({
      type: 'photo-start', requestId, mime: blob.type || 'image/jpeg', size: buffer.byteLength,
      chunks, createdAt: new Date().toISOString(), width: currentTrack.getSettings().width, height: currentTrack.getSettings().height
    });
    for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
      await waitForBuffer();
      dc.send(buffer.slice(offset, Math.min(offset + chunkSize, buffer.byteLength)));
    }
    sendData({ type: 'photo-end', requestId });
    infoEl.textContent = `Foto inviata • ${formatBytes(buffer.byteLength)}`;
  } finally { photoBusy = false; }
}

async function handleCommand(msg) {
  switch (msg.type) {
    case 'capture': return sendPhoto(msg.requestId);
    case 'set-zoom': return applyAdvanced({ zoom: Number(msg.value) });
    case 'set-torch': return applyAdvanced({ torch: Boolean(msg.value) });
    case 'autofocus': return autofocus();
    case 'switch-camera': await switchCamera(String(msg.deviceId || '')); return;
    case 'get-camera-info': return publishCameraInfo();
  }
}

function connectWs() {
  ws = new WebSocket(wsUrl());
  ws.onopen = () => sendSignal({ type: 'join', room, role: 'camera', token: authToken });
  ws.onclose = e => setStatus(statusEl, e.code === 4003 ? 'Pairing non valido/scaduto' : 'Server disconnesso', 'warn');
  ws.onerror = () => setStatus(statusEl, 'Errore WebSocket', 'warn');
  ws.onmessage = async event => {
    const msg = JSON.parse(event.data);
    try {
      if (msg.type === 'error') throw new Error(msg.message);
      if (msg.type === 'joined') setStatus(statusEl, `Pairing ${msg.room} riuscito`, 'ok');
      else if (msg.type === 'session-status') {
        if (msg.controller && !centralOfferSent) { await sendOffer('controller-central'); centralOfferSent = true; }
        if (!msg.controller) centralOfferSent = false;
        if (msg.mobileController && !mobilePc) { createMobilePeer(); await sendOffer('controller-mobile'); }
        if (!msg.mobileController && mobilePc) { mobilePc.close(); mobilePc = mobileDc = mobileSender = undefined; }
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
  config = await loadConfig();
  createPeer();
  connectWs();
  permissionCard.classList.add('hidden');
  infoEl.textContent = 'Camera avviata. In attesa del controller.';
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
