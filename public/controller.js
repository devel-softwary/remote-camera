import { loadConfig, wsUrl, setStatus, formatBytes } from './common.js';

const roomCode = document.querySelector('#roomCode');
const cameraUrlEl = document.querySelector('#cameraUrl');
const qr = document.querySelector('#qr');
const newSessionBtn = document.querySelector('#newSession');
const copyLinkBtn = document.querySelector('#copyLink');
const video = document.querySelector('#remoteVideo');
const statusEl = document.querySelector('#status');
const connectionInfo = document.querySelector('#connectionInfo');
const captureBtn = document.querySelector('#capture');
const captureState = document.querySelector('#captureState');
const gallery = document.querySelector('#gallery');
const cameraSelect = document.querySelector('#cameraSelect');
const zoomGroup = document.querySelector('#zoomGroup');
const zoom = document.querySelector('#zoom');
const zoomValue = document.querySelector('#zoomValue');
const torchBtn = document.querySelector('#torch');
const focusBtn = document.querySelector('#focus');
const capabilitiesEl = document.querySelector('#capabilities');
const expiryEl = document.querySelector('#expiry');

let config, session, ws, pc, dc;
let captureSeq = 0;
let pendingPhoto = null;
let torchOn = false;
let cameraInfo = null;

function sendSignal(msg) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function sendData(msg) { if (dc?.readyState === 'open') dc.send(JSON.stringify(msg)); }

async function createSession() {
  const r = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!r.ok) throw new Error('Impossibile creare la sessione');
  session = await r.json();
  updateSessionUi();
  connectWs();
}

function updateSessionUi() {
  roomCode.textContent = session.room;
  const cameraUrl = `${config.baseUrl}/camera.html?room=${encodeURIComponent(session.room)}&token=${encodeURIComponent(session.cameraToken)}`;
  cameraUrlEl.textContent = cameraUrl;
  qr.src = `/api/qr?text=${encodeURIComponent(cameraUrl)}`;
  expiryEl.textContent = `QR valido fino alle ${new Date(session.expiresAt).toLocaleTimeString()}; il token camera è utilizzabile una sola volta.`;
}

function resetControls() {
  captureBtn.disabled = true;
  cameraSelect.disabled = true;
  zoom.disabled = true;
  torchBtn.disabled = true;
  focusBtn.disabled = true;
  capabilitiesEl.textContent = 'In attesa delle capacità della camera.';
}

function createPeer() {
  if (pc) pc.close();
  pc = new RTCPeerConnection({ iceServers: config.iceServers });
  pc.ontrack = e => { video.srcObject = e.streams[0]; };
  pc.ondatachannel = e => {
    dc = e.channel;
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => {
      captureBtn.disabled = false;
      connectionInfo.textContent = 'Video + canale dati collegati.';
      sendData({ type: 'get-camera-info' });
    };
    dc.onclose = () => { connectionInfo.textContent = 'Canale dati chiuso.'; resetControls(); };
    dc.onmessage = handleDataChannel;
  };
  pc.onicecandidate = e => e.candidate && sendSignal({ type: 'ice-candidate', candidate: e.candidate });
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'connected') setStatus(statusEl, 'Collegato', 'ok');
    else if (['failed', 'disconnected', 'closed'].includes(s)) { setStatus(statusEl, `WebRTC ${s}`, 'warn'); resetControls(); }
    else connectionInfo.textContent = `WebRTC: ${s}`;
  };
}

function connectWs() {
  if (ws) ws.close();
  resetControls();
  createPeer();
  ws = new WebSocket(wsUrl());
  ws.onopen = () => sendSignal({ type: 'join', room: session.room, role: 'controller', token: session.controllerToken });
  ws.onclose = () => { setStatus(statusEl, 'Server disconnesso', 'warn'); resetControls(); };
  ws.onerror = () => setStatus(statusEl, 'Errore WebSocket', 'warn');
  ws.onmessage = async event => {
    const msg = JSON.parse(event.data);
    try {
      if (msg.type === 'error') throw new Error(msg.message);
      if (msg.type === 'joined') setStatus(statusEl, `Sessione ${msg.room}`, 'ok');
      else if (msg.type === 'session-status' && !msg.camera) {
        setStatus(statusEl, 'In attesa del telefono', 'warn');
        connectionInfo.textContent = 'Scansiona il QR dal telefono camera.';
      } else if (msg.type === 'webrtc-offer') {
        await pc.setRemoteDescription(msg.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: 'webrtc-answer', sdp: pc.localDescription });
      } else if (msg.type === 'ice-candidate' && msg.candidate) await pc.addIceCandidate(msg.candidate);
    } catch (err) { setStatus(statusEl, err.message, 'warn'); }
  };
}

function renderCameraInfo(msg) {
  cameraInfo = msg;
  cameraSelect.innerHTML = '';
  for (const cam of msg.cameras || []) {
    const option = document.createElement('option');
    option.value = cam.deviceId;
    option.textContent = cam.label;
    option.selected = cam.deviceId === msg.activeDeviceId;
    cameraSelect.appendChild(option);
  }
  cameraSelect.disabled = !(msg.cameras?.length > 1);

  const z = msg.controls?.zoom;
  if (z) {
    zoom.min = z.min; zoom.max = z.max; zoom.step = z.step || 0.1; zoom.value = z.value ?? z.min;
    zoomValue.textContent = `${Number(zoom.value).toFixed(1)}×`;
    zoom.disabled = false; zoomGroup.classList.remove('disabled-control');
  } else { zoom.disabled = true; zoomGroup.classList.add('disabled-control'); zoomValue.textContent = 'N/D'; }

  torchBtn.disabled = !msg.controls?.torch;
  focusBtn.disabled = !(msg.controls?.focusModes?.length);
  const s = msg.settings || {};
  capabilitiesEl.textContent = `${msg.label || 'Camera'} • ${s.width || '?'}×${s.height || '?'} • zoom ${z ? 'sì' : 'no'} • torcia ${msg.controls?.torch ? 'sì' : 'no'} • focus ${(msg.controls?.focusModes || []).join(', ') || 'N/D'}`;
}

function handleDataChannel(e) {
  if (typeof e.data === 'string') {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'camera-info') {
      renderCameraInfo(msg);
      connectionInfo.textContent = `Camera attiva: ${msg.label || 'Camera'}`;
    }
    else if (msg.type === 'photo-start') {
      pendingPhoto = { meta: msg, chunks: [], received: 0 };
      captureState.textContent = `Ricezione foto ${formatBytes(msg.size)}…`;
    } else if (msg.type === 'photo-end') {
      if (pendingPhoto && pendingPhoto.meta.requestId === msg.requestId) finishPhoto();
    } else if (msg.type === 'command-error') {
      if (msg.command === 'switch-camera') {
        connectionInfo.textContent = `Cambio camera non riuscito: ${msg.message}`;
        if (cameraInfo) renderCameraInfo(cameraInfo);
        return;
      }
      captureState.textContent = `Errore: ${msg.message}`;
      captureBtn.disabled = false;
    }
    return;
  }
  if (e.data instanceof ArrayBuffer && pendingPhoto) {
    pendingPhoto.chunks.push(e.data);
    pendingPhoto.received += e.data.byteLength;
    const pct = Math.min(100, Math.round((pendingPhoto.received / pendingPhoto.meta.size) * 100));
    captureState.textContent = `Ricezione foto… ${pct}%`;
  }
}

function finishPhoto() {
  const p = pendingPhoto;
  pendingPhoto = null;
  const blob = new Blob(p.chunks, { type: p.meta.mime || 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  if (gallery.querySelector('p')) gallery.innerHTML = '';
  const figure = document.createElement('figure');
  const img = document.createElement('img');
  img.src = url; img.alt = `Foto ${new Date(p.meta.createdAt).toLocaleString()}`;
  const meta = document.createElement('figcaption');
  meta.textContent = `${p.meta.width || '?'}×${p.meta.height || '?'} • ${formatBytes(blob.size)}`;
  const a = document.createElement('a');
  a.href = url; a.download = `remote-photo-${Date.now()}.${(p.meta.mime || '').includes('png') ? 'png' : 'jpg'}`;
  a.textContent = 'Scarica originale';
  figure.append(img, meta, a); gallery.prepend(figure);
  captureState.textContent = `Foto ricevuta: ${formatBytes(blob.size)}.`;
  captureBtn.disabled = false;
}

captureBtn.addEventListener('click', () => {
  if (dc?.readyState !== 'open') return;
  captureBtn.disabled = true;
  const requestId = `${Date.now()}-${++captureSeq}`;
  captureState.textContent = 'Scatto full-resolution in corso…';
  sendData({ type: 'capture', requestId });
});

let zoomTimer;
zoom.addEventListener('input', () => {
  zoomValue.textContent = `${Number(zoom.value).toFixed(1)}×`;
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => sendData({ type: 'set-zoom', value: Number(zoom.value) }), 80);
});

torchBtn.addEventListener('click', () => {
  torchOn = !torchOn;
  sendData({ type: 'set-torch', value: torchOn });
  torchBtn.textContent = torchOn ? '🔦 Torcia ON' : '🔦 Torcia OFF';
  torchBtn.classList.toggle('active', torchOn);
});

focusBtn.addEventListener('click', () => {
  sendData({ type: 'autofocus', requestId: `focus-${Date.now()}` });
  captureState.textContent = 'Autofocus richiesto.';
});

cameraSelect.addEventListener('change', () => {
  if (dc?.readyState !== 'open') return;
  sendData({ type: 'switch-camera', deviceId: cameraSelect.value });
  connectionInfo.textContent = 'Cambio camera…';
});

newSessionBtn.addEventListener('click', async () => {
  newSessionBtn.disabled = true;
  try { await createSession(); } finally { newSessionBtn.disabled = false; }
});

copyLinkBtn.addEventListener('click', async () => {
  const text = cameraUrlEl.textContent;
  try { await navigator.clipboard.writeText(text); copyLinkBtn.textContent = 'Link copiato'; setTimeout(() => copyLinkBtn.textContent = 'Copia link camera', 1500); }
  catch { window.prompt('Copia questo link:', text); }
});

config = await loadConfig();
await createSession();
