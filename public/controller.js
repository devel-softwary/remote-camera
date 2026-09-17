import { loadConfig, wsUrl, setStatus, formatBytes } from './common.js';
import { addRemoteIceCandidate, flushRemoteIceCandidates, webRtcFailureMessage } from './webrtc-ice.js';
import { cadValidationError, canCaptureArea, canCreateMappedArea, canDownloadProject, canManageAreas, createInterventionArea, createMappedInterventionArea, isProjectSelected, nextAreaName, nextProjectName, openAreaForProject, reopenInterventionArea } from './controller-model.js';
import { createPhotoPoint, drawingBounds, parseDxf } from './cad-viewer.js';
import { HELP_STEPS } from './help-content.js';
import { cameraSessionLink } from './session-links.js';
import { createThumbnail, loadThumbnail, saveThumbnail, thumbnailStorageKey } from './photo-thumbnails.js';
import { clampPhotoZoom, photoZoomRange } from './photo-viewer.js';

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
const projectSelect = document.querySelector('#projectSelect');
const newProjectBtn = document.querySelector('#newProject');
const renameProjectBtn = document.querySelector('#renameProject');
const downloadProjectBtn = document.querySelector('#downloadProject');
const deleteProjectBtn = document.querySelector('#deleteProject');
const cadFile = document.querySelector('#cadFile');
const uploadCadBtn = document.querySelector('#uploadCad');
const deleteCadBtn = document.querySelector('#deleteCad');
const cadFileName = document.querySelector('#cadFileName');
const dwgState = document.querySelector('#dwgState');
const tokenModeInfo = document.querySelector('#tokenModeInfo');
const cadCanvas = document.querySelector('#cadCanvas');
const addPhotoPointBtn = document.querySelector('#addPhotoPoint');
const newMappedAreaBtn = document.querySelector('#newMappedArea');
const completeMappedAreaBtn = document.querySelector('#completeMappedArea');
const cancelMappedAreaBtn = document.querySelector('#cancelMappedArea');
const zoomInCadBtn = document.querySelector('#zoomInCad');
const zoomOutCadBtn = document.querySelector('#zoomOutCad');
const resetCadViewBtn = document.querySelector('#resetCadView');
const photoPointState = document.querySelector('#photoPointState');
const areaSelect = document.querySelector('#areaSelect');
const newAreaBtn = document.querySelector('#newArea');
const closeAreaBtn = document.querySelector('#closeArea');
const reopenAreaBtn = document.querySelector('#reopenArea');
const areaState = document.querySelector('#areaState');
const areaSection = document.querySelector('#areaSection');
const sessionSection = document.querySelector('#sessionSection');
const cameraQrSection = document.querySelector('#cameraQrSection');
const helpButton = document.querySelector('#helpButton');
const helpDialog = document.querySelector('#helpDialog');
const closeHelpBtn = document.querySelector('#closeHelp');
const helpSteps = document.querySelector('#helpSteps');
const photoViewerDialog = document.querySelector('#photoViewerDialog');
const closePhotoViewerBtn = document.querySelector('#closePhotoViewer');
const photoViewerViewport = document.querySelector('#photoViewerViewport');
const photoViewerImage = document.querySelector('#photoViewerImage');
const photoZoom = document.querySelector('#photoZoom');
const photoZoomValue = document.querySelector('#photoZoomValue');
const zoomOutPhotoBtn = document.querySelector('#zoomOutPhoto');
const zoomInPhotoBtn = document.querySelector('#zoomInPhoto');
const actualSizePhotoBtn = document.querySelector('#actualSizePhoto');

let config, session, ws, pc, dc;
let pendingIceCandidates = [];
let captureSeq = 0;
let pendingPhoto = null;
let torchOn = false;
let cameraInfo = null;
let projects = [];
let cadByProject = {};
let photoPointsByProject = {};
let areasByProject = {};
let cadShapes = [];
let cadBounds = null;
let cadView = null;
const cadDrawingByProject = {};
let addingPhotoPoint = false;
let drawingArea = false;
let pendingAreaVertices = [];
let selectedPhotoPointId = null;
let cadPan = null;
let currentPhotoZoomRange = { min: 1, max: 1 };

function renderHelp() {
  for (const step of HELP_STEPS) {
    const item = document.createElement('li');
    item.textContent = step.title;
    if (step.details) {
      const details = document.createElement('ul');
      step.details.forEach(detail => {
        const detailItem = document.createElement('li');
        detailItem.textContent = detail;
        details.append(detailItem);
      });
      item.append(details);
    }
    helpSteps.append(item);
  }
}

function loadWorkspace() {
  try {
    projects = JSON.parse(localStorage.getItem('remote-camera-projects') || '[]');
    cadByProject = JSON.parse(localStorage.getItem('remote-camera-cad') || '{}');
    photoPointsByProject = JSON.parse(localStorage.getItem('remote-camera-photo-points') || '{}');
    areasByProject = JSON.parse(localStorage.getItem('remote-camera-areas') || '{}');
    if (!Array.isArray(projects) || typeof cadByProject !== 'object' || !cadByProject || typeof photoPointsByProject !== 'object' || !photoPointsByProject || typeof areasByProject !== 'object' || !areasByProject) throw new Error('Invalid workspace');
  } catch { projects = []; cadByProject = {}; photoPointsByProject = {}; areasByProject = {}; }
  renderProjects();
}

function saveWorkspace() {
  localStorage.setItem('remote-camera-projects', JSON.stringify(projects));
  localStorage.setItem('remote-camera-cad', JSON.stringify(cadByProject));
  localStorage.setItem('remote-camera-photo-points', JSON.stringify(photoPointsByProject));
  localStorage.setItem('remote-camera-areas', JSON.stringify(areasByProject));
}

function renderProjects() {
  const selected = projectSelect.value;
  projectSelect.replaceChildren(new Option('Seleziona progetto…', ''));
  projects.forEach(name => projectSelect.add(new Option(name, name)));
  projectSelect.value = projects.includes(selected) ? selected : '';
  updateProjectUi();
}

function renderAreas() {
  const project = projectSelect.value;
  const projectSelected = isProjectSelected(project);
  const areas = areasByProject[project] || [];
  const selected = areaSelect.value;
  areaSelect.replaceChildren(new Option('Nessuna area', ''));
  areas.forEach(area => areaSelect.add(new Option(`${area.name}${area.status === 'closed' ? ' · chiusa' : ''}`, area.id)));
  areaSelect.value = areas.some(area => area.id === selected) ? selected : (openAreaForProject(areasByProject, project)?.id || areas[0]?.id || '');
  areaSelect.disabled = !projectSelected;
  newAreaBtn.disabled = !canManageAreas(project);
  const selectedArea = currentSelectedArea();
  closeAreaBtn.disabled = !projectSelected || selectedArea?.status !== 'open';
  reopenAreaBtn.disabled = !projectSelected || selectedArea?.status !== 'closed';
  const area = currentArea();
  areaState.textContent = area ? `Area selezionata: ${area.name}. Le foto saranno archiviate qui.` : (selectedArea ? `Area “${selectedArea.name}” chiusa. Riaprila per aggiungere foto.` : (projectSelected ? 'Crea o seleziona un’area di intervento.' : 'Crea o seleziona prima un progetto.'));
  captureBtn.disabled = !canCaptureArea(area, session, project, dc?.readyState);
  newSessionBtn.disabled = !(projectSelected && area);
  photoPointState.textContent = area ? `Area selezionata: ${area.name}. Gli scatti successivi saranno associati a questa area.` : 'Crea o seleziona un’area di intervento.';
  renderGallery();
  renderCad();
}

function currentSelectedArea() { return (areasByProject[projectSelect.value] || []).find(area => area.id === areaSelect.value) || null; }
function currentArea() { const area = currentSelectedArea(); return area?.status === 'open' ? area : null; }
function currentSessionArea() { return session && (areasByProject[session.project] || []).find(area => area.name === session.area && area.status === 'open'); }

function updateProjectUi() {
  const project = projectSelect.value;
  const projectSelected = isProjectSelected(project);
  const cad = cadByProject[project];
  const drawing = cadDrawingByProject[project];
  cadShapes = drawing?.shapes || [];
  cadBounds = drawing?.bounds || null;
  cadView = drawing?.view || (cadBounds && { ...cadBounds });
  renameProjectBtn.disabled = !projectSelected;
  deleteProjectBtn.disabled = !projectSelected;
  downloadProjectBtn.disabled = !canDownloadProject(project);
  uploadCadBtn.disabled = !projectSelected;
  deleteCadBtn.disabled = !cad;
  addPhotoPointBtn.disabled = !cadShapes.length;
  newMappedAreaBtn.disabled = !cadShapes.length || !projectSelected;
  completeMappedAreaBtn.disabled = !drawingArea || !canCreateMappedArea(pendingAreaVertices);
  cancelMappedAreaBtn.disabled = !drawingArea;
  [zoomInCadBtn, zoomOutCadBtn, resetCadViewBtn].forEach(button => button.disabled = !cadShapes.length);
  areaSection.setAttribute('aria-disabled', String(!projectSelected));
  [sessionSection, cameraQrSection].forEach(section => section.setAttribute('aria-disabled', String(!projectSelected)));
  copyLinkBtn.disabled = !projectSelected || !session || session.project !== project;
  cadFileName.textContent = cad ? `${cad.name} (${formatBytes(cad.size)})` : 'Nessun file CAD caricato.';
  dwgState.textContent = cad ? (/\.dwg$/i.test(cad.name) ? 'DWG caricato: serve un convertitore DWG→DXF lato server per la visualizzazione.' : `File selezionato: ${cad.name}`) : 'Carica un file DWG o DXF per iniziare.';
  renderCad();
  renderAreas();
}

function projectPoints() { return photoPointsByProject[projectSelect.value] || []; }
function projectAreas() { return areasByProject[projectSelect.value] || []; }

function renderCad() {
  if (!cadShapes.length || !cadBounds) {
    cadCanvas.innerHTML = '<span>▧</span><p>Area disegno CAD</p>';
    return;
  }
  const box = cadView || cadBounds;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'cad-svg'); svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
  for (const shape of cadShapes) {
    const node = document.createElementNS(svg.namespaceURI, shape.type === 'circle' ? 'circle' : shape.type === 'polyline' ? 'polyline' : shape.type === 'point' ? 'circle' : 'line');
    if (shape.type === 'line') { node.setAttribute('x1', shape.x1); node.setAttribute('y1', -shape.y1); node.setAttribute('x2', shape.x2); node.setAttribute('y2', -shape.y2); }
    else if (shape.type === 'circle') { node.setAttribute('cx', shape.x); node.setAttribute('cy', -shape.y); node.setAttribute('r', shape.r); }
    else if (shape.type === 'polyline') node.setAttribute('points', shape.points.map(([x, y]) => `${x},${-y}`).join(' '));
    else { node.setAttribute('cx', shape.x); node.setAttribute('cy', -shape.y); node.setAttribute('r', Math.max(box.width, box.height) * .004); }
    node.setAttribute('class', 'cad-shape');
    svg.append(node);
  }
  for (const area of projectAreas()) {
    if (!area.vertices?.length) continue;
    const polygon = document.createElementNS(svg.namespaceURI, 'polygon');
    polygon.setAttribute('points', area.vertices.map(point => `${point.x},${-point.y}`).join(' '));
    polygon.setAttribute('class', `cad-area${area.id === areaSelect.value ? ' selected' : ''}${area.status === 'closed' ? ' closed' : ''}`);
    polygon.dataset.areaId = area.id;
    svg.append(polygon);
    const labelPoint = area.vertices[0];
    const label = document.createElementNS(svg.namespaceURI, 'text');
    label.setAttribute('x', labelPoint.x); label.setAttribute('y', -labelPoint.y); label.setAttribute('class', 'cad-area-label'); label.dataset.areaId = area.id; label.textContent = area.name; svg.append(label);
  }
  if (pendingAreaVertices.length) {
    const preview = document.createElementNS(svg.namespaceURI, pendingAreaVertices.length > 2 ? 'polygon' : 'polyline');
    preview.setAttribute('points', pendingAreaVertices.map(point => `${point.x},${-point.y}`).join(' '));
    preview.setAttribute('class', 'cad-area-preview'); svg.append(preview);
    for (const point of pendingAreaVertices) {
      const vertex = document.createElementNS(svg.namespaceURI, 'circle'); vertex.setAttribute('cx', point.x); vertex.setAttribute('cy', -point.y); vertex.setAttribute('r', Math.max(box.width, box.height) * .007); vertex.setAttribute('class', 'cad-area-vertex'); svg.append(vertex);
    }
  }
  for (const point of projectPoints()) {
    const marker = document.createElementNS(svg.namespaceURI, 'circle'); marker.setAttribute('cx', point.x); marker.setAttribute('cy', -point.y); marker.setAttribute('r', Math.max(box.width, box.height) * .012); marker.setAttribute('class', `photo-marker${point.id === selectedPhotoPointId ? ' selected' : ''}`); marker.dataset.pointId = point.id; svg.append(marker);
  }
  svg.addEventListener('click', handleCadClick);
  svg.addEventListener('pointerdown', event => { if (!event.target.closest('.photo-marker')) { cadPan = { x: event.clientX, y: event.clientY }; svg.setPointerCapture(event.pointerId); } });
  svg.addEventListener('pointermove', handleCadPan);
  svg.addEventListener('pointerup', () => { cadPan = null; renderCad(); });
  cadCanvas.replaceChildren(svg);
  photoPointState.textContent = drawingArea ? `Area in disegno: ${pendingAreaVertices.length} punti. Aggiungi almeno 3 punti, poi conferma.` : (selectedPhotoPointId ? `Punto selezionato: ${projectPoints().find(point => point.id === selectedPhotoPointId)?.label}.` : 'Seleziona un’area o disegnane una nuova.');
}

function handleCadPan(event) {
  if (!cadPan || !cadView) return;
  const rect = event.currentTarget.getBoundingClientRect();
  cadView = { ...cadView, x: cadView.x + (cadPan.x - event.clientX) * cadView.width / rect.width, y: cadView.y + (cadPan.y - event.clientY) * cadView.height / rect.height };
  cadPan = { x: event.clientX, y: event.clientY };
  cadDrawingByProject[projectSelect.value].view = cadView;
  event.currentTarget.setAttribute('viewBox', `${cadView.x} ${cadView.y} ${cadView.width} ${cadView.height}`);
}

function handleCadClick(event) {
  const areaNode = event.target.closest('[data-area-id]');
  if (areaNode && !drawingArea) { areaSelect.value = areaNode.dataset.areaId; renderAreas(); return; }
  const marker = event.target.closest('.photo-marker');
  if (marker) { selectedPhotoPointId = marker.dataset.pointId; addingPhotoPoint = false; addPhotoPointBtn.classList.remove('active'); renderCad(); return; }
  const svg = event.currentTarget; const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
  const xy = point.matrixTransform(svg.getScreenCTM().inverse());
  if (drawingArea) { pendingAreaVertices.push({ x: xy.x, y: -xy.y }); renderCad(); return; }
  if (!addingPhotoPoint) return;
  const project = projectSelect.value;
  const photoPoint = createPhotoPoint(projectPoints(), xy.x, -xy.y);
  (photoPointsByProject[project] ||= []).push(photoPoint); selectedPhotoPointId = photoPoint.id; addingPhotoPoint = false; addPhotoPointBtn.classList.remove('active'); saveWorkspace(); renderCad();
}

function changeCadZoom(factor) {
  if (!cadView) return;
  const width = cadView.width * factor; const height = cadView.height * factor;
  cadView = { x: cadView.x + (cadView.width - width) / 2, y: cadView.y + (cadView.height - height) / 2, width, height };
  cadDrawingByProject[projectSelect.value].view = cadView; renderCad();
}

function sendSignal(msg) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function sendData(msg) { if (dc?.readyState === 'open') dc.send(JSON.stringify(msg)); }

async function createSession(area = currentArea()) {
  if (!area) throw new Error('Seleziona un’area di intervento.');
  const r = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: projectSelect.value, area: area.name }) });
  if (!r.ok) throw new Error('Impossibile creare la sessione');
  session = await r.json();
  updateSessionUi();
  connectWs();
}

function updateSessionUi() {
  roomCode.textContent = session.room;
  const cameraUrl = cameraSessionLink(config.baseUrl, session.room, session.cameraToken);
  cameraUrlEl.textContent = cameraUrl;
  qr.src = `/api/qr?text=${encodeURIComponent(cameraUrl)}`;
  expiryEl.textContent = `${session.project} • ${session.area} • QR valido fino alle ${new Date(session.expiresAt).toLocaleTimeString()}.`;
  tokenModeInfo.textContent = `QR riusabile per “${session.project}”: puoi cambiare area senza scollegare la camera.`;
  copyLinkBtn.disabled = false;
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
  pendingIceCandidates = [];
  pc = new RTCPeerConnection({ iceServers: config.iceServers });
  pc.ontrack = e => {
    video.srcObject = e.streams[0];
    video.play().catch(() => {});
    connectionInfo.textContent = 'Track video ricevuto. Attesa dei frame…';
    e.track.onunmute = () => { connectionInfo.textContent = 'Streaming video attivo.'; };
  };
  pc.ondatachannel = e => {
    dc = e.channel;
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => {
      captureBtn.disabled = !canCaptureArea(currentArea(), session, projectSelect.value, dc?.readyState);
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
    else if (['failed', 'disconnected', 'closed'].includes(s)) {
      setStatus(statusEl, webRtcFailureMessage(s), 'warn');
      connectionInfo.textContent = webRtcFailureMessage(s);
      resetControls();
    }
    else connectionInfo.textContent = `WebRTC: ${s}`;
  };
}

function connectWs() {
  if (ws) ws.close();
  resetControls();
  createPeer();
  ws = new WebSocket(wsUrl());
  ws.onopen = () => sendSignal({ type: 'join', room: session.room, role: 'controller-central', token: session.controllerToken });
  ws.onclose = () => { setStatus(statusEl, 'Server disconnesso', 'warn'); resetControls(); };
  ws.onerror = () => setStatus(statusEl, 'Errore WebSocket', 'warn');
  ws.onmessage = async event => {
    const msg = JSON.parse(event.data);
    try {
      if (msg.type === 'error') throw new Error(msg.message);
      if (msg.type === 'joined') { setStatus(statusEl, `Sessione ${msg.room}`, 'ok'); publishActiveArea(); }
      else if (msg.type === 'session-status') {
        if (!msg.camera) {
          setStatus(statusEl, 'In attesa del telefono', 'warn');
          connectionInfo.textContent = 'Scansiona il QR dal telefono camera.';
        } else if (pc.connectionState !== 'connected') {
          setStatus(statusEl, 'Telefono collegato', 'ok');
          connectionInfo.textContent = 'Connessione video in corso…';
        }
      } else if (msg.type === 'webrtc-offer') {
        await pc.setRemoteDescription(msg.sdp);
        await flushRemoteIceCandidates(pc, pendingIceCandidates);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: 'webrtc-answer', sdp: pc.localDescription });
      } else if (msg.type === 'ice-candidate' && msg.candidate) await addRemoteIceCandidate(pc, pendingIceCandidates, msg.candidate);
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
      const area = currentSessionArea();
      if (!area) { captureState.textContent = 'Seleziona un’area prima di scattare.'; return; }
      pendingPhoto = { meta: msg, area, chunks: [], received: 0 };
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
  savePhoto(blob, p.meta, p.area).catch(err => {
    captureState.textContent = `Errore archivio: ${err.message}`;
    captureBtn.disabled = false;
  });
}

async function savePhoto(blob, meta, selectedArea) {
  if (!selectedArea || selectedArea.status !== 'open') throw new Error('L’area di intervento non è più aperta.');
  const response = await fetch('/api/photos', { method: 'POST', headers: { 'content-type': blob.type || 'image/jpeg', 'x-room': session.room, 'x-controller-token': session.controllerToken, 'x-project': session.project, 'x-area': selectedArea.name }, body: blob });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Salvataggio non riuscito');
  const saved = await response.json();
  const area = (areasByProject[session.project] || []).find(item => item.id === selectedArea.id);
  if (!area) throw new Error('Area non disponibile');
  const photoId = crypto.randomUUID();
  const thumbnailKey = thumbnailStorageKey(session.project, area.id, photoId);
  try {
    await saveThumbnail(thumbnailKey, await createThumbnail(blob));
  } catch { /* l'originale resta disponibile anche se lo storage del browser è pieno */ }
  area.photos.push({ id: photoId, url: saved.url, thumbnailKey, createdAt: meta.createdAt, width: meta.width, height: meta.height, size: blob.size });
  saveWorkspace();
  renderGallery();
  sendSignal({ type: 'photo-saved', photo: { url: saved.url, createdAt: meta.createdAt, width: meta.width, height: meta.height, size: blob.size } });
  captureState.textContent = `Foto archiviata in “${area.name}”: ${formatBytes(blob.size)}.`;
  captureBtn.disabled = false;
}

function publishActiveArea() {
  const area = currentArea();
  if (!area || !session || session.project !== projectSelect.value) return;
  session.area = area.name;
  expiryEl.textContent = `${session.project} • ${session.area} • QR valido fino alle ${new Date(session.expiresAt).toLocaleTimeString()}.`;
  sendSignal({ type: 'session-area', area: area.name });
}

function renderGallery() {
  const areas = areasByProject[projectSelect.value] || [];
  gallery.replaceChildren();
  if (!areas.some(area => area.photos?.length)) { gallery.innerHTML = '<p class="small">Nessuna foto nell’area di intervento.</p>'; return; }
  for (const area of areas) {
    if (!area.photos?.length) continue;
    const group = document.createElement('section'); group.className = 'photo-area';
    const title = document.createElement('h3'); title.textContent = `${area.name}${area.status === 'closed' ? ' · chiusa' : ''}`;
    const items = document.createElement('div'); items.className = 'gallery';
    for (const photo of area.photos) {
      const figure = document.createElement('figure');
      const img = document.createElement('img'); img.src = photo.url; img.alt = `Foto ${area.name}`;
      showStoredThumbnail(img, photo);
      const meta = document.createElement('figcaption'); meta.textContent = `${photo.width || '?'}×${photo.height || '?'} • ${formatBytes(photo.size)}`;
      const actions = document.createElement('div'); actions.className = 'gallery-actions';
      const view = document.createElement('button'); view.type = 'button'; view.className = 'secondary'; view.textContent = '👁 Visualizza'; view.setAttribute('aria-label', `Visualizza foto ${area.name}`); view.addEventListener('click', () => openPhotoViewer(photo, area.name));
      const link = document.createElement('a'); link.href = photo.url; link.download = ''; link.textContent = '⬇ Scarica'; link.setAttribute('aria-label', `Scarica foto ${area.name}`);
      actions.append(view, link); figure.append(img, meta, actions); items.append(figure);
    }
    group.append(title, items); gallery.append(group);
  }
}

function showStoredThumbnail(img, photo) {
  if (!photo.thumbnailKey) return;
  loadThumbnail(photo.thumbnailKey).then(blob => {
    if (!blob || !img.isConnected) return;
    const url = URL.createObjectURL(blob);
    img.onload = () => URL.revokeObjectURL(url);
    img.src = url;
  }).catch(() => {});
}

function setPhotoZoom(value) {
  const zoomValue = clampPhotoZoom(value, currentPhotoZoomRange);
  photoZoom.value = String(zoomValue);
  photoZoomValue.value = `${Math.round(zoomValue * 100)}%`;
  photoZoomValue.textContent = photoZoomValue.value;
  photoViewerImage.style.width = `${Math.round(photoViewerImage.naturalWidth * zoomValue)}px`;
  photoViewerImage.style.height = `${Math.round(photoViewerImage.naturalHeight * zoomValue)}px`;
}

function fitPhotoViewer() {
  currentPhotoZoomRange = photoZoomRange(photoViewerImage.naturalWidth, photoViewerImage.naturalHeight, photoViewerViewport.clientWidth, photoViewerViewport.clientHeight);
  photoZoom.min = String(currentPhotoZoomRange.min);
  photoZoom.max = String(currentPhotoZoomRange.max);
  photoZoom.disabled = currentPhotoZoomRange.min === currentPhotoZoomRange.max;
  zoomOutPhotoBtn.disabled = photoZoom.disabled;
  zoomInPhotoBtn.disabled = photoZoom.disabled;
  actualSizePhotoBtn.disabled = photoZoom.disabled;
  setPhotoZoom(currentPhotoZoomRange.min);
}

function openPhotoViewer(photo, areaName) {
  photoViewerImage.alt = `Foto ${areaName}`;
  photoViewerImage.onload = fitPhotoViewer;
  photoViewerDialog.showModal();
  photoViewerImage.src = photo.url;
}

captureBtn.addEventListener('click', () => {
  if (!canCaptureArea(currentArea(), session, projectSelect.value, dc?.readyState)) return;
  captureBtn.disabled = true;
  const requestId = `${Date.now()}-${++captureSeq}`;
  captureState.textContent = 'Scatto full-resolution in corso…';
  sendData({ type: 'capture', requestId });
});

helpButton.addEventListener('click', () => helpDialog.showModal());
closeHelpBtn.addEventListener('click', () => helpDialog.close());
helpDialog.addEventListener('click', event => {
  if (event.target === helpDialog) helpDialog.close();
});

closePhotoViewerBtn.addEventListener('click', () => photoViewerDialog.close());
photoViewerDialog.addEventListener('click', event => {
  if (event.target === photoViewerDialog) photoViewerDialog.close();
});
photoViewerDialog.addEventListener('close', () => {
  photoViewerImage.removeAttribute('src');
  photoViewerImage.onload = null;
});
photoZoom.addEventListener('input', () => setPhotoZoom(photoZoom.value));
zoomOutPhotoBtn.addEventListener('click', () => setPhotoZoom(Number(photoZoom.value) - .1));
zoomInPhotoBtn.addEventListener('click', () => setPhotoZoom(Number(photoZoom.value) + .1));
actualSizePhotoBtn.addEventListener('click', () => setPhotoZoom(1));

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
  if (!projectSelect.value) { window.alert('Crea o seleziona prima un progetto.'); return; }
  newSessionBtn.disabled = true;
  try { await createSession(); renderAreas(); } finally { newSessionBtn.disabled = false; }
});

copyLinkBtn.addEventListener('click', async () => {
  const text = cameraUrlEl.textContent;
  try { await navigator.clipboard.writeText(text); copyLinkBtn.textContent = 'Link copiato'; setTimeout(() => copyLinkBtn.textContent = 'Copia link QR', 1500); }
  catch { window.prompt('Copia questo link:', text); }
});

downloadProjectBtn.addEventListener('click', async () => {
  const project = projectSelect.value;
  if (!canDownloadProject(project)) return;
  downloadProjectBtn.disabled = true;
  const originalLabel = downloadProjectBtn.textContent;
  downloadProjectBtn.textContent = 'Preparazione…';
  try {
    if (!session || session.project !== project) {
      const authorizationArea = (areasByProject[project] || [])[0];
      if (!authorizationArea) throw new Error('Il progetto non contiene aree di intervento.');
      await createSession(authorizationArea);
      renderAreas();
    }
    const response = await fetch(`/api/projects/${encodeURIComponent(project)}/download`, {
      method: 'POST',
      headers: { 'x-room': session.room, 'x-controller-token': session.controllerToken }
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Download non riuscito');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project}.zip`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    window.alert(error.message);
  } finally {
    downloadProjectBtn.textContent = originalLabel;
    updateProjectUi();
  }
});

projectSelect.addEventListener('change', updateProjectUi);

areaSelect.addEventListener('change', () => { renderAreas(); publishActiveArea(); });
newAreaBtn.addEventListener('click', () => {
  const project = projectSelect.value; const areas = areasByProject[project] || [];
  const name = nextAreaName(areas, window.prompt('Nome area di intervento:', '') || '');
  if (!name) return;
  (areasByProject[project] ||= []).push(createInterventionArea(areas, name));
  saveWorkspace(); renderAreas(); publishActiveArea();
});
closeAreaBtn.addEventListener('click', () => {
  const area = currentArea();
  if (!area || !window.confirm(`Chiudere l’area “${area.name}”? Le foto resteranno nella sua cartella.`)) return;
  area.status = 'closed';
  saveWorkspace(); renderAreas(); publishActiveArea();
});

reopenAreaBtn.addEventListener('click', () => {
  const area = currentSelectedArea();
  if (!reopenInterventionArea(area)) return;
  saveWorkspace(); renderAreas(); publishActiveArea();
});

newProjectBtn.addEventListener('click', () => {
  const name = nextProjectName(projects, window.prompt('Nome del nuovo progetto:', ''));
  if (!name) return;
  projects.push(name);
  saveWorkspace();
  renderProjects();
  projectSelect.value = name;
  updateProjectUi();
});

renameProjectBtn.addEventListener('click', () => {
  const current = projectSelect.value;
  const name = nextProjectName(projects.filter(project => project !== current), window.prompt('Nuovo nome progetto:', current) || '');
  if (!name) return;
  projects = projects.map(project => project === current ? name : project);
  if (cadByProject[current]) { cadByProject[name] = cadByProject[current]; delete cadByProject[current]; }
  if (areasByProject[current]) { areasByProject[name] = areasByProject[current]; delete areasByProject[current]; }
  saveWorkspace();
  renderProjects();
  projectSelect.value = name;
  updateProjectUi();
});

deleteProjectBtn.addEventListener('click', () => {
  const current = projectSelect.value;
  if (!current || !window.confirm(`Eliminare il progetto “${current}”?`)) return;
  projects = projects.filter(project => project !== current);
  delete cadByProject[current];
  delete photoPointsByProject[current];
  delete areasByProject[current];
  saveWorkspace();
  renderProjects();
});

uploadCadBtn.addEventListener('click', () => cadFile.click());
cadFile.addEventListener('change', () => {
  const file = cadFile.files?.[0];
  const error = cadValidationError(file);
  if (error) { if (file) window.alert(error); cadFile.value = ''; return; }
  cadByProject[projectSelect.value] = { name: file.name, size: file.size };
  if (/\.dxf$/i.test(file.name)) {
    const reader = new FileReader();
    reader.onload = () => { cadShapes = parseDxf(String(reader.result)); const bounds = drawingBounds(cadShapes); cadBounds = { ...bounds, y: -bounds.y - bounds.height }; cadView = { ...cadBounds }; cadDrawingByProject[projectSelect.value] = { shapes: cadShapes, bounds: cadBounds, view: cadView }; selectedPhotoPointId = null; updateProjectUi(); };
    reader.readAsText(file);
  } else { cadShapes = []; cadBounds = null; cadView = null; delete cadDrawingByProject[projectSelect.value]; dwgState.textContent = 'DWG caricato: serve un convertitore DWG→DXF lato server per la visualizzazione.'; }
  saveWorkspace();
  updateProjectUi();
  cadFile.value = '';
});

deleteCadBtn.addEventListener('click', () => {
  const project = projectSelect.value;
  if (!project || !window.confirm('Rimuovere il file CAD dal progetto?')) return;
  delete cadByProject[project];
  cadShapes = []; cadBounds = null; cadView = null; delete cadDrawingByProject[project]; selectedPhotoPointId = null;
  saveWorkspace();
  updateProjectUi();
});

newMappedAreaBtn.addEventListener('click', () => {
  drawingArea = true; pendingAreaVertices = []; addingPhotoPoint = false; addPhotoPointBtn.classList.remove('active'); renderCad();
});
completeMappedAreaBtn.addEventListener('click', () => {
  if (!canCreateMappedArea(pendingAreaVertices)) return;
  const project = projectSelect.value; const areas = projectAreas();
  const name = nextAreaName(areas, window.prompt('Nome dell’area:', '') || '');
  if (!name) return;
  const area = createMappedInterventionArea(areas, name, pendingAreaVertices);
  (areasByProject[project] ||= []).push(area);
  areaSelect.value = area.id; drawingArea = false; pendingAreaVertices = []; saveWorkspace(); renderAreas(); renderCad(); publishActiveArea();
});
cancelMappedAreaBtn.addEventListener('click', () => { drawingArea = false; pendingAreaVertices = []; renderCad(); });
addPhotoPointBtn.addEventListener('click', () => { addingPhotoPoint = !addingPhotoPoint; drawingArea = false; pendingAreaVertices = []; addPhotoPointBtn.classList.toggle('active', addingPhotoPoint); renderCad(); });
zoomInCadBtn.addEventListener('click', () => changeCadZoom(.75));
zoomOutCadBtn.addEventListener('click', () => changeCadZoom(1.25));
resetCadViewBtn.addEventListener('click', () => { cadView = cadBounds && { ...cadBounds }; if (cadDrawingByProject[projectSelect.value]) cadDrawingByProject[projectSelect.value].view = cadView; renderCad(); });
renderHelp();
loadWorkspace();
config = await loadConfig();
setStatus(statusEl, 'Crea un’area', 'warn');
