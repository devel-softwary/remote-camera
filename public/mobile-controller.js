import { loadConfig, queryParam, setStatus, wsUrl } from './common.js';
import { freezeVideoPreview } from './capture-preview.js';
import { cameraDiagnostics, normalizedVideoPoint } from './camera-capabilities.js';

const room = queryParam('room').toUpperCase();
const token = queryParam('token');
const video = document.querySelector('#remoteVideo');
const statusEl = document.querySelector('#status');
const areaEl = document.querySelector('#area');
const infoEl = document.querySelector('#info');
const captureBtn = document.querySelector('#capture');
const capturePreview = document.querySelector('#capturePreview');
const capturePreviewCanvas = document.querySelector('#capturePreviewCanvas');
const closeCapturePreviewBtn = document.querySelector('#closeCapturePreview');
const zoom = document.querySelector('#zoom');
const zoomValue = document.querySelector('#zoomValue');
const torchBtn = document.querySelector('#torch');
const focusBtn = document.querySelector('#focus');
const focusDistance = document.querySelector('#focusDistance');
const focusDistanceValue = document.querySelector('#focusDistanceValue');
const flashMode = document.querySelector('#flashMode');
const capabilitiesEl = document.querySelector('#capabilities');
let cameraInfo = null;
let config, ws, pc, dc, torchOn = false, sequence = 0;

function signal(message) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); }
function command(type, payload = {}) {
  if (ws?.readyState !== WebSocket.OPEN) return;
  const requestId = `${Date.now()}-${++sequence}`;
  signal({ type: 'controller-command', command: { type, requestId, ...payload } });
  infoEl.textContent = type === 'capture' ? 'Scatto in corso…' : 'Comando inviato…';
  if (type === 'capture') captureBtn.disabled = true;
}
function renderCameraInfo(message) {
  cameraInfo = message;
  const controls = message.controls || {};
  const z = controls.zoom;
  if (z) { zoom.min = z.min; zoom.max = z.max; zoom.step = z.step || .1; zoom.value = z.value ?? z.min; zoomValue.textContent = `${Number(zoom.value).toFixed(1)}×`; zoom.disabled = false; }
  torchBtn.disabled = !controls.torch;
  focusBtn.disabled = !(controls.focusModes || []).length;
  const distance = controls.focusDistance;
  const manualFocus = distance && controls.focusModes?.includes('manual');
  if (manualFocus) { focusDistance.min = distance.min; focusDistance.max = distance.max; focusDistance.step = distance.step; focusDistance.value = distance.value; focusDistanceValue.textContent = Number(distance.value).toFixed(2); }
  else focusDistanceValue.textContent = 'N/D';
  focusDistance.disabled = !manualFocus;
  flashMode.replaceChildren(...(controls.flashModes || []).map(mode => new Option(mode, mode)));
  flashMode.value = controls.flashMode || controls.flashModes?.[0] || '';
  flashMode.disabled = !(controls.flashModes || []).length;
  video.classList.toggle('touch-focus', Boolean(controls.pointsOfInterest));
  capabilitiesEl.textContent = cameraDiagnostics(message);
  captureBtn.disabled = false;
  infoEl.textContent = `${message.label || 'Camera'} collegata.`;
}
function createPeer() {
  pc = new RTCPeerConnection({ iceServers: config.iceServers });
  pc.ontrack = event => { video.srcObject = event.streams[0]; };
  pc.ondatachannel = event => {
    dc = event.channel;
    dc.onopen = () => { setStatus(statusEl, 'Camera collegata', 'ok'); dc.send(JSON.stringify({ type: 'get-camera-info' })); };
    dc.onclose = () => { setStatus(statusEl, 'Canale controlli chiuso', 'warn'); captureBtn.disabled = true; };
    dc.onmessage = event => {
      if (typeof event.data !== 'string') return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'camera-info') renderCameraInfo(message);
      else if (message.type === 'photo-captured') infoEl.textContent = 'Foto scattata. Invio in corso…';
      else if (message.type === 'command-error') { infoEl.textContent = `Errore: ${message.message}`; captureBtn.disabled = false; }
    };
  };
  pc.onicecandidate = event => event.candidate && signal({ type: 'ice-candidate', candidate: event.candidate });
}
async function connect() {
  if (!room || !token) throw new Error('Link controller incompleto. Genera un nuovo QR dal laptop.');
  config = await loadConfig();
  createPeer();
  ws = new WebSocket(wsUrl());
  ws.onopen = () => signal({ type: 'join', room, role: 'controller-mobile', token });
  ws.onclose = () => setStatus(statusEl, 'Server disconnesso', 'warn');
  ws.onmessage = async event => {
    const message = JSON.parse(event.data);
    if (message.type === 'error') { setStatus(statusEl, message.message, 'warn'); return; }
    if (message.type === 'joined') setStatus(statusEl, `Sessione ${message.room}`, 'ok');
    else if (message.type === 'session-status') areaEl.textContent = message.activeArea ? `Punto foto attivo: ${message.activeArea}` : 'Il laptop deve selezionare un punto foto.';
    else if (message.type === 'photo-saved') infoEl.textContent = message.area ? `Foto archiviata in “${message.area}”.` : 'Foto archiviata.';
    else if (message.type === 'command-result') { infoEl.textContent = message.ok ? (message.command === 'capture' ? 'Foto inviata al controller centrale.' : 'Comando completato.') : `Errore: ${message.message || 'comando non riuscito'}`; captureBtn.disabled = false; }
    else if (message.type === 'webrtc-offer') { await pc.setRemoteDescription(message.sdp); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); signal({ type: 'webrtc-answer', sdp: pc.localDescription }); }
    else if (message.type === 'ice-candidate' && message.candidate) await pc.addIceCandidate(message.candidate);
  };
}
captureBtn.addEventListener('click', () => {
  if (freezeVideoPreview(video, capturePreviewCanvas)) capturePreview.hidden = false;
  command('capture');
});
closeCapturePreviewBtn.addEventListener('click', () => { capturePreview.hidden = true; });
zoom.addEventListener('input', () => { zoomValue.textContent = `${Number(zoom.value).toFixed(1)}×`; command('set-zoom', { value: Number(zoom.value) }); });
torchBtn.addEventListener('click', () => { torchOn = !torchOn; torchBtn.textContent = torchOn ? '🔦 Torcia ON' : '🔦 Torcia OFF'; command('set-torch', { value: torchOn }); });
focusBtn.addEventListener('click', () => command('autofocus'));
focusDistance.addEventListener('change', () => command('set-focus-distance', { value: Number(focusDistance.value) }));
focusDistance.addEventListener('input', () => { focusDistanceValue.textContent = Number(focusDistance.value).toFixed(2); });
flashMode.addEventListener('change', () => command('set-flash-mode', { value: flashMode.value }));
video.addEventListener('click', event => {
  if (!cameraInfo?.controls?.pointsOfInterest) return;
  const point = normalizedVideoPoint(event.clientX, event.clientY, video.getBoundingClientRect(), video.videoWidth, video.videoHeight);
  if (point) command('focus-at-point', point);
});
connect().catch(error => { setStatus(statusEl, 'Errore collegamento', 'warn'); infoEl.textContent = error.message; });
