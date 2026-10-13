import { loadConfig, wsUrl, setStatus, formatBytes } from './common.js';
import { addRemoteIceCandidate, flushRemoteIceCandidates, webRtcFailureMessage } from './webrtc-ice.js';
import { canCaptureArea, canDownloadProject, canStartPointSession, isProjectSelected, layerFileKind, layerValidationError, linkPhotoPointsToAreas, nextPhotoPointName, nextProjectName, removePhotoPoint, renamePhotoPoint, reopenInterventionArea } from './controller-model.js';
import { createPhotoPoint, drawingBounds, isPointerDrag, parseDxf } from './cad-viewer.js';
import { HELP_STEPS } from './help-content.js';
import { cameraSessionLink } from './session-links.js';
import { createThumbnail, deleteThumbnail, loadThumbnail, saveThumbnail, thumbnailStorageKey } from './photo-thumbnails.js';
import { clampPhotoZoom, photoZoomRange } from './photo-viewer.js';
import { CAPTURE_TIMEOUT_MS, canStartCapture, isCurrentCapture } from './capture-lifecycle.js';
import { deleteLayerFile, loadLayerFile, moveLayerFile, saveLayerFile } from './layer-storage.js';

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
const syncWorkspaceBtn = document.querySelector('#syncWorkspace');
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
const zoomInCadBtn = document.querySelector('#zoomInCad');
const zoomOutCadBtn = document.querySelector('#zoomOutCad');
const resetCadViewBtn = document.querySelector('#resetCadView');
const photoPointState = document.querySelector('#photoPointState');
const photoPointNameForm = document.querySelector('#photoPointNameForm');
const photoPointName = document.querySelector('#photoPointName');
const cancelPhotoPointBtn = document.querySelector('#cancelPhotoPoint');
const areaSelect = document.querySelector('#areaSelect');
const photoPointList = document.querySelector('#photoPointList');
const startPointSessionBtn = document.querySelector('#startPointSession');
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
let captureRequestId = null;
let captureTimeout = null;
let photoUploadAbortController = null;
let torchOn = false;
let cameraInfo = null;
let projects = [];
let cadByProject = {};
let photoPointsByProject = {};
let areasByProject = {};
let cadShapes = [];
let cadBounds = null;
let cadView = null;
let layerImageUrl = '';
const cadDrawingByProject = {};
const loadingLayerProjects = new Set();
let addingPhotoPoint = false;
let pendingPhotoPoint = null;
let selectedPhotoPointId = null;
let cadPan = null;
let suppressNextCadClick = false;
let sessionStarting = false;
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
  let migrated = false;
  for (const project of projects) migrated = linkPhotoPointsToAreas(photoPointsByProject[project] || [], areasByProject[project] ||= []) || migrated;
  if (migrated) saveWorkspace();
  renderProjects();
}

function saveWorkspace() {
  localStorage.setItem('remote-camera-projects', JSON.stringify(projects));
  localStorage.setItem('remote-camera-cad', JSON.stringify(cadByProject));
  localStorage.setItem('remote-camera-photo-points', JSON.stringify(photoPointsByProject));
  localStorage.setItem('remote-camera-areas', JSON.stringify(areasByProject));
}

function workspacePayload() { return { projects, areasByProject }; }

async function syncWorkspace() {
  const selectedProject = projectSelect.value;
  syncWorkspaceBtn.disabled = true;
  const label = syncWorkspaceBtn.textContent;
  syncWorkspaceBtn.textContent = 'Sincronizzazione…';
  try {
    const response = await fetch('/api/workspace/sync', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workspacePayload())
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Sincronizzazione non riuscita.');
    const workspace = await response.json();
    projects = workspace.projects;
    areasByProject = workspace.areasByProject;
    saveWorkspace();
    renderProjects();
    projectSelect.value = projects.includes(selectedProject) ? selectedProject : '';
    updateProjectUi();
    syncWorkspaceBtn.textContent = 'Sincronizzato';
    setTimeout(() => { syncWorkspaceBtn.textContent = label; }, 1500);
  } catch (error) {
    window.alert(error.message);
    syncWorkspaceBtn.textContent = label;
  } finally { syncWorkspaceBtn.disabled = false; }
}

function renderProjects() {
  const selected = projectSelect.value;
  projectSelect.replaceChildren(new Option('Seleziona progetto…', ''));
  projects.forEach(name => projectSelect.add(new Option(name, name)));
  projectSelect.value = projects.includes(selected) ? selected : '';
  updateProjectUi();
}

function createPointActionButton(label, className, pathData) {
  const button = document.createElement('button'); button.type = 'button'; button.className = `secondary icon-button point-action ${className}`; button.setAttribute('aria-label', label); button.title = label;
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
  for (const data of pathData) { const path = document.createElementNS(icon.namespaceURI, 'path'); path.setAttribute('d', data); icon.append(path); }
  button.append(icon);
  return button;
}

function renameListedPhotoPoint(point, areas) {
  const requestedName = window.prompt('Nuovo nome del punto foto:', point.label);
  if (requestedName === null) return;
  if (!renamePhotoPoint(projectPoints(), areas, point.id, requestedName)) { window.alert('Inserisci un nome univoco per il punto foto.'); return; }
  saveWorkspace(); renderAreas(); publishActiveArea();
}

async function deleteListedPhotoPoint(point, areas) {
  const area = areas.find(item => item.id === point.areaId);
  if (captureRequestId && area?.id === areaSelect.value) { window.alert('Attendi il completamento dello scatto prima di eliminare il punto.'); return; }
  const photoCount = area?.photos?.length || 0;
  const detail = photoCount ? ` Contiene ${photoCount} foto: saranno rimosse dall’elenco, ma i file resteranno sul disco.` : '';
  if (!window.confirm(`Eliminare il punto foto “${point.label}”?${detail}`)) return;
  const removed = removePhotoPoint(projectPoints(), areas, point.id);
  if (!removed) return;
  if (selectedPhotoPointId === point.id) selectedPhotoPointId = null;
  if (areaSelect.value === point.areaId) areaSelect.value = '';
  await Promise.allSettled((removed.area?.photos || []).map(photo => photo.thumbnailKey ? deleteThumbnail(photo.thumbnailKey) : Promise.resolve()));
  saveWorkspace(); renderAreas(); publishActiveArea();
}

function renderAreas() {
  const project = projectSelect.value;
  const projectSelected = isProjectSelected(project);
  const areas = projectSelected ? (areasByProject[project] ||= []) : [];
  const points = photoPointsByProject[project] || [];
  if (linkPhotoPointsToAreas(points, areas)) saveWorkspace();
  const pointAreas = points.map(point => areas.find(area => area.id === point.areaId)).filter(Boolean);
  const selected = areaSelect.value;
  areaSelect.replaceChildren(new Option('Nessun punto foto', ''));
  pointAreas.forEach(area => areaSelect.add(new Option(`${area.name}${area.status === 'closed' ? ' · chiuso' : ''}`, area.id)));
  areaSelect.value = pointAreas.some(area => area.id === selected) ? selected : (pointAreas.find(area => area.status === 'open')?.id || pointAreas[0]?.id || '');
  areaSelect.disabled = !projectSelected || !points.length;
  photoPointList.replaceChildren();
  if (!points.length) {
    const empty = document.createElement('p'); empty.className = 'small'; empty.textContent = projectSelected ? 'Nessun punto foto creato sul layer.' : 'Seleziona prima un progetto.'; photoPointList.append(empty);
  } else {
    for (const point of points) {
      const area = areas.find(item => item.id === point.areaId);
      const item = document.createElement('div'); item.className = `photo-point-list-item${area?.id === areaSelect.value ? ' active' : ''}`; item.setAttribute('role', 'listitem');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary photo-point-select'; button.dataset.areaId = area?.id || ''; button.setAttribute('aria-pressed', String(area?.id === areaSelect.value));
      const name = document.createElement('span'); name.textContent = point.label;
      const status = document.createElement('span'); status.className = 'photo-point-list-status'; status.textContent = area?.status === 'closed' ? 'Chiuso' : `${area?.photos?.length || 0} foto`;
      button.append(name, status);
      button.addEventListener('click', () => { areaSelect.value = area.id; selectedPhotoPointId = point.id; renderAreas(); publishActiveArea(); });
      const actions = document.createElement('div'); actions.className = 'photo-point-list-actions';
      const edit = createPointActionButton(`Rinomina ${point.label}`, 'point-action-edit', ['M4 20h4L19 9l-4-4L4 16v4', 'M13.5 6.5l4 4']); edit.addEventListener('click', () => renameListedPhotoPoint(point, areas));
      const remove = createPointActionButton(`Elimina ${point.label}`, 'point-action-delete', ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14', 'M10 10v6', 'M14 10v6']); remove.addEventListener('click', () => void deleteListedPhotoPoint(point, areas));
      actions.append(edit, remove); item.append(button, actions); photoPointList.append(item);
    }
  }
  const selectedArea = currentSelectedArea();
  const canStartSession = canStartPointSession(project, selectedArea, sessionStarting);
  startPointSessionBtn.disabled = !canStartSession;
  closeAreaBtn.disabled = !projectSelected || selectedArea?.status !== 'open';
  reopenAreaBtn.disabled = !projectSelected || selectedArea?.status !== 'closed';
  const area = currentArea();
  areaState.textContent = area ? `Punto selezionato: ${area.name}. Le foto saranno archiviate qui.` : (selectedArea ? `Punto “${selectedArea.name}” chiuso. Riaprilo per aggiungere foto.` : (projectSelected ? 'Crea un punto foto sul layer.' : 'Seleziona prima un progetto.'));
  updateCaptureButton();
  newSessionBtn.disabled = !canStartSession;
  photoPointState.textContent = area ? `Punto selezionato: ${area.name}. Gli scatti successivi saranno associati a questo punto.` : 'Crea o seleziona un punto foto.';
  renderGallery();
  renderCad();
}

function canCapture() {
  return canCaptureArea(currentArea(), session, projectSelect.value, dc?.readyState);
}

function updateCaptureButton() {
  captureBtn.disabled = !canStartCapture(canCapture(), captureRequestId);
}

function clearCaptureRequest() {
  if (captureTimeout) clearTimeout(captureTimeout);
  captureTimeout = null;
  captureRequestId = null;
  photoUploadAbortController = null;
  updateCaptureButton();
}

function expireCaptureRequest() {
  if (!captureRequestId) return;
  pendingPhoto = null;
  photoUploadAbortController?.abort();
  captureState.textContent = 'Tempo scaduto durante il salvataggio. Riprova lo scatto.';
  clearCaptureRequest();
}

function startCaptureRequest(requestId) {
  captureRequestId = requestId;
  captureTimeout = setTimeout(expireCaptureRequest, CAPTURE_TIMEOUT_MS);
  updateCaptureButton();
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
  layerImageUrl = drawing?.imageUrl || '';
  const drawableLayer = Boolean(cadBounds && (cadShapes.length || layerImageUrl));
  renameProjectBtn.disabled = !projectSelected;
  deleteProjectBtn.disabled = !projectSelected;
  downloadProjectBtn.disabled = !canDownloadProject(project);
  uploadCadBtn.disabled = !projectSelected;
  deleteCadBtn.disabled = !cad;
  addPhotoPointBtn.disabled = !drawableLayer;
  [zoomInCadBtn, zoomOutCadBtn, resetCadViewBtn].forEach(button => button.disabled = !drawableLayer);
  areaSection.setAttribute('aria-disabled', String(!projectSelected));
  [sessionSection, cameraQrSection].forEach(section => section.setAttribute('aria-disabled', String(!projectSelected)));
  copyLinkBtn.disabled = !projectSelected || !session || session.project !== project;
  cadFileName.textContent = cad ? `${cad.name} (${formatBytes(cad.size)})` : 'Nessun layer caricato.';
  dwgState.textContent = cad ? (/\.dwg$/i.test(cad.name) ? 'DWG caricato: per disegnare serve la conversione in DXF.' : `Layer attivo: ${cad.name}`) : 'Carica un’immagine o un file DWG/DXF per iniziare.';
  renderCad();
  renderAreas();
  if (projectSelected && cad && !drawing && !loadingLayerProjects.has(project)) void restoreProjectLayer(project);
}

function projectPoints() { return photoPointsByProject[projectSelect.value] || []; }
function renderCad() {
  const pendingPoint = pendingPhotoPoint?.project === projectSelect.value ? pendingPhotoPoint : null;
  photoPointNameForm.hidden = !pendingPoint;
  if ((!cadShapes.length && !layerImageUrl) || !cadBounds) {
    cadCanvas.innerHTML = '<span>▧</span><p>Layer punti foto</p>';
    return;
  }
  const box = cadView || cadBounds;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'cad-svg'); svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
  if (layerImageUrl) {
    const image = document.createElementNS(svg.namespaceURI, 'image');
    image.setAttribute('href', layerImageUrl);
    image.setAttribute('x', cadBounds.x);
    image.setAttribute('y', cadBounds.y);
    image.setAttribute('width', cadBounds.width);
    image.setAttribute('height', cadBounds.height);
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('class', 'layer-image');
    svg.append(image);
  }
  for (const shape of cadShapes) {
    const node = document.createElementNS(svg.namespaceURI, shape.type === 'circle' ? 'circle' : shape.type === 'polyline' ? 'polyline' : shape.type === 'point' ? 'circle' : 'line');
    if (shape.type === 'line') { node.setAttribute('x1', shape.x1); node.setAttribute('y1', -shape.y1); node.setAttribute('x2', shape.x2); node.setAttribute('y2', -shape.y2); }
    else if (shape.type === 'circle') { node.setAttribute('cx', shape.x); node.setAttribute('cy', -shape.y); node.setAttribute('r', shape.r); }
    else if (shape.type === 'polyline') node.setAttribute('points', shape.points.map(([x, y]) => `${x},${-y}`).join(' '));
    else { node.setAttribute('cx', shape.x); node.setAttribute('cy', -shape.y); node.setAttribute('r', Math.max(box.width, box.height) * .004); }
    node.setAttribute('class', 'cad-shape');
    svg.append(node);
  }
  for (const point of projectPoints()) {
    const marker = document.createElementNS(svg.namespaceURI, 'circle'); marker.setAttribute('cx', point.x); marker.setAttribute('cy', -point.y); marker.setAttribute('r', Math.max(box.width, box.height) * .012); marker.setAttribute('class', `photo-marker${point.id === selectedPhotoPointId ? ' selected' : ''}`); marker.dataset.pointId = point.id; svg.append(marker);
    const label = document.createElementNS(svg.namespaceURI, 'text'); label.setAttribute('x', point.x + Math.max(box.width, box.height) * .018); label.setAttribute('y', -point.y); label.setAttribute('font-size', Math.max(box.width, box.height) * .022); label.setAttribute('dominant-baseline', 'middle'); label.setAttribute('class', 'photo-marker-label'); label.textContent = point.label; svg.append(label);
  }
  if (pendingPoint) {
    const marker = document.createElementNS(svg.namespaceURI, 'circle'); marker.setAttribute('cx', pendingPoint.x); marker.setAttribute('cy', -pendingPoint.y); marker.setAttribute('r', Math.max(box.width, box.height) * .012); marker.setAttribute('class', 'photo-marker pending'); svg.append(marker);
  }
  svg.addEventListener('click', handleCadClick);
  svg.addEventListener('dblclick', handleCadDoubleClick);
  svg.addEventListener('pointerdown', event => {
    if (addingPhotoPoint || event.target.closest('.photo-marker')) return;
    cadPan = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', handleCadPan);
  svg.addEventListener('pointerup', () => {
    suppressNextCadClick = Boolean(cadPan?.moved);
    cadPan = null;
    if (suppressNextCadClick) setTimeout(() => { suppressNextCadClick = false; }, 0);
  });
  svg.addEventListener('pointercancel', () => { cadPan = null; });
  cadCanvas.replaceChildren(svg);
  photoPointState.textContent = pendingPoint ? 'Inserisci il nome e salva il punto foto.' : (addingPhotoPoint ? 'Tocca il layer per posizionare il punto foto.' : (selectedPhotoPointId ? `Punto selezionato: ${projectPoints().find(point => point.id === selectedPhotoPointId)?.label}.` : 'Seleziona “Aggiungi punto foto” per posizionare un punto.'));
}

function handleCadPan(event) {
  if (!cadPan || !cadView) return;
  if (!cadPan.moved && !isPointerDrag(cadPan.startX, cadPan.startY, event.clientX, event.clientY)) return;
  cadPan.moved = true;
  const rect = event.currentTarget.getBoundingClientRect();
  cadView = { ...cadView, x: cadView.x + (cadPan.x - event.clientX) * cadView.width / rect.width, y: cadView.y + (cadPan.y - event.clientY) * cadView.height / rect.height };
  cadPan = { ...cadPan, x: event.clientX, y: event.clientY };
  cadDrawingByProject[projectSelect.value].view = cadView;
  event.currentTarget.setAttribute('viewBox', `${cadView.x} ${cadView.y} ${cadView.width} ${cadView.height}`);
}

function handleCadClick(event) {
  if (suppressNextCadClick) { suppressNextCadClick = false; return; }
  const marker = event.target.closest('.photo-marker');
  if (marker) {
    selectedPhotoPointId = marker.dataset.pointId; addingPhotoPoint = false; addPhotoPointBtn.classList.remove('active');
    const selectedPoint = projectPoints().find(point => point.id === selectedPhotoPointId);
    if (selectedPoint?.areaId) { areaSelect.value = selectedPoint.areaId; renderAreas(); publishActiveArea(); } else renderCad();
    return;
  }
  const svg = event.currentTarget; const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
  const xy = point.matrixTransform(svg.getScreenCTM().inverse());
  if (!addingPhotoPoint) return;
  beginPhotoPoint(xy.x, -xy.y);
}

function handleCadDoubleClick(event) {
  if (event.target.closest('.photo-marker')) return;
  event.preventDefault();
  const svg = event.currentTarget; const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
  const xy = point.matrixTransform(svg.getScreenCTM().inverse());
  beginPhotoPoint(xy.x, -xy.y);
}

function beginPhotoPoint(x, y) {
  pendingPhotoPoint = { project: projectSelect.value, x, y };
  addingPhotoPoint = false;
  addPhotoPointBtn.classList.remove('active');
  photoPointName.value = '';
  photoPointName.setCustomValidity('');
  renderCad();
  requestAnimationFrame(() => photoPointName.focus());
}

function changeCadZoom(factor) {
  if (!cadView) return;
  const width = cadView.width * factor; const height = cadView.height * factor;
  cadView = { x: cadView.x + (cadView.width - width) / 2, y: cadView.y + (cadView.height - height) / 2, width, height };
  cadDrawingByProject[projectSelect.value].view = cadView; renderCad();
}

function revokeLayerImage(drawing) {
  if (drawing?.imageUrl) URL.revokeObjectURL(drawing.imageUrl);
}

function loadLayerImage(file) {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ imageUrl, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => { URL.revokeObjectURL(imageUrl); reject(new Error('Immagine non valida o non leggibile.')); };
    image.src = imageUrl;
  });
}

async function createLayerDrawing(file, name, kind) {
  if (kind === 'image') {
    const image = await loadLayerImage(file);
    const bounds = { x: 0, y: -image.height, width: image.width, height: image.height };
    return { shapes: [], bounds, view: { ...bounds }, imageUrl: image.imageUrl };
  }
  if (/\.dxf$/i.test(name)) {
    const shapes = parseDxf(await file.text());
    if (!shapes.length) throw new Error('Il DXF non contiene entità supportate.');
    const bounds = drawingBounds(shapes);
    const flippedBounds = { ...bounds, y: -bounds.y - bounds.height };
    return { shapes, bounds: flippedBounds, view: { ...flippedBounds } };
  }
  return { shapes: [], bounds: null, view: null, unsupported: true };
}

async function restoreProjectLayer(project) {
  loadingLayerProjects.add(project);
  if (projectSelect.value === project) dwgState.textContent = 'Caricamento layer…';
  try {
    const record = await loadLayerFile(project);
    if (!record) {
      if (projectSelect.value === project) dwgState.textContent = 'File layer non disponibile: caricalo nuovamente.';
      return;
    }
    const metadata = cadByProject[project];
    const kind = metadata?.kind || layerFileKind(record);
    const drawing = await createLayerDrawing(record.blob, record.name, kind);
    if (drawing) cadDrawingByProject[project] = drawing;
    if (projectSelect.value === project) updateProjectUi();
  } catch (error) {
    if (projectSelect.value === project) dwgState.textContent = `Impossibile ripristinare il layer: ${error.message}`;
  } finally {
    loadingLayerProjects.delete(project);
  }
}

function sendSignal(msg) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function sendData(msg) { if (dc?.readyState === 'open') dc.send(JSON.stringify(msg)); }

async function createSession(area = currentArea()) {
  if (!area) throw new Error('Seleziona un punto foto.');
  const r = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: projectSelect.value, area: area.name }) });
  if (!r.ok) throw new Error('Impossibile creare la sessione');
  session = await r.json();
  updateSessionUi();
  connectWs();
}

async function startSessionForSelectedPoint() {
  const point = currentArea();
  if (!point) { window.alert('Seleziona un punto foto aperto.'); return; }
  sessionStarting = true;
  startPointSessionBtn.textContent = 'Avvio sessione…';
  renderAreas();
  try {
    await createSession(point);
    captureState.textContent = `Rilievo avviato per “${point.name}”. Collega la camera tramite QR.`;
    sessionSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    window.alert(error.message);
  } finally {
    sessionStarting = false;
    startPointSessionBtn.textContent = 'Avvia sessione';
    renderAreas();
  }
}

function updateSessionUi() {
  roomCode.textContent = session.room;
  const cameraUrl = cameraSessionLink(config.baseUrl, session.room, session.cameraToken);
  cameraUrlEl.textContent = cameraUrl;
  qr.src = `/api/qr?text=${encodeURIComponent(cameraUrl)}`;
  expiryEl.textContent = `${session.project} • ${session.area} • QR valido fino alle ${new Date(session.expiresAt).toLocaleTimeString()}.`;
  tokenModeInfo.textContent = `QR riusabile per “${session.project}”: puoi cambiare punto foto senza scollegare la camera.`;
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
      updateCaptureButton();
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
    else if (msg.type === 'photo-captured') {
      if (isCurrentCapture(captureRequestId, msg.requestId)) captureState.textContent = 'Foto scattata. Preparazione invio…';
    }
    else if (msg.type === 'photo-start') {
      if (!isCurrentCapture(captureRequestId, msg.requestId)) return;
      const area = currentSessionArea();
      if (!area) { captureState.textContent = 'Seleziona un punto foto prima di scattare.'; clearCaptureRequest(); return; }
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
      if (!isCurrentCapture(captureRequestId, msg.requestId)) return;
      captureState.textContent = `Errore: ${msg.message}`;
      pendingPhoto = null;
      clearCaptureRequest();
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
    if (!isCurrentCapture(captureRequestId, p.meta.requestId)) return;
    captureState.textContent = `Errore archivio: ${err.message}`;
    clearCaptureRequest();
  });
}

async function savePhoto(blob, meta, selectedArea) {
  if (!selectedArea || selectedArea.status !== 'open') throw new Error('Il punto foto non è più aperto.');
  photoUploadAbortController = new AbortController();
  const response = await fetch('/api/photos', { method: 'POST', signal: photoUploadAbortController.signal, headers: { 'content-type': blob.type || 'image/jpeg', 'x-room': session.room, 'x-controller-token': session.controllerToken, 'x-project': session.project, 'x-area': selectedArea.name }, body: blob });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Salvataggio non riuscito');
  const saved = await response.json();
  if (!isCurrentCapture(captureRequestId, meta.requestId)) return;
  const area = (areasByProject[session.project] || []).find(item => item.id === selectedArea.id);
  if (!area) throw new Error('Punto foto non disponibile');
  const photoId = crypto.randomUUID();
  const thumbnailKey = thumbnailStorageKey(session.project, area.id, photoId);
  try {
    await saveThumbnail(thumbnailKey, await createThumbnail(blob));
  } catch { /* l'originale resta disponibile anche se lo storage del browser è pieno */ }
  area.photos.push({ id: photoId, url: saved.url, thumbnailKey, createdAt: meta.createdAt, width: meta.width, height: meta.height, size: blob.size });
  saveWorkspace();
  renderAreas();
  sendSignal({ type: 'photo-saved', photo: { url: saved.url, createdAt: meta.createdAt, width: meta.width, height: meta.height, size: blob.size } });
  captureState.textContent = `Foto archiviata in “${area.name}”: ${formatBytes(blob.size)}.`;
  clearCaptureRequest();
}

function publishActiveArea() {
  const area = currentArea();
  if (!area || !session || session.project !== projectSelect.value) return;
  session.area = area.name;
  expiryEl.textContent = `${session.project} • ${session.area} • QR valido fino alle ${new Date(session.expiresAt).toLocaleTimeString()}.`;
  sendSignal({ type: 'session-area', area: area.name });
}

function renderGallery() {
  const pointAreaIds = new Set(projectPoints().map(point => point.areaId));
  const areas = (areasByProject[projectSelect.value] || []).filter(area => pointAreaIds.has(area.id));
  gallery.replaceChildren();
  if (!areas.some(area => area.photos?.length)) { gallery.innerHTML = '<p class="small">Nessuna foto associata ai punti foto.</p>'; return; }
  for (const area of areas) {
    if (!area.photos?.length) continue;
    const group = document.createElement('section'); group.className = 'photo-area';
    const title = document.createElement('h3'); title.textContent = `${area.name}${area.status === 'closed' ? ' · chiuso' : ''}`;
    const items = document.createElement('div'); items.className = 'gallery';
    for (const photo of area.photos) {
      const figure = document.createElement('figure');
      const img = document.createElement('img'); img.src = photo.url; img.alt = `Foto ${area.name}`;
      showStoredThumbnail(img, photo);
      const meta = document.createElement('figcaption'); meta.textContent = `${photo.width || '?'}×${photo.height || '?'} • ${formatBytes(photo.size)}`;
      const actions = document.createElement('div'); actions.className = 'gallery-actions';
      const view = document.createElement('button'); view.type = 'button'; view.className = 'secondary gallery-icon-button'; view.title = `Visualizza foto ${area.name}`; view.setAttribute('aria-label', view.title);
      const viewIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); viewIcon.setAttribute('viewBox', '0 0 24 24'); viewIcon.setAttribute('aria-hidden', 'true'); viewIcon.setAttribute('focusable', 'false');
      const viewOutline = document.createElementNS(viewIcon.namespaceURI, 'path'); viewOutline.setAttribute('d', 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12');
      const viewPupil = document.createElementNS(viewIcon.namespaceURI, 'circle'); viewPupil.setAttribute('cx', '12'); viewPupil.setAttribute('cy', '12'); viewPupil.setAttribute('r', '3'); viewIcon.append(viewOutline, viewPupil); view.append(viewIcon); view.addEventListener('click', () => openPhotoViewer(photo, area.name));
      const link = document.createElement('a'); link.className = 'gallery-action-link gallery-icon-button'; link.href = photo.url; link.download = ''; link.title = `Scarica foto ${area.name}`; link.setAttribute('aria-label', link.title);
      const downloadIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); downloadIcon.setAttribute('viewBox', '0 0 24 24'); downloadIcon.setAttribute('aria-hidden', 'true'); downloadIcon.setAttribute('focusable', 'false');
      const downloadPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); downloadPath.setAttribute('d', 'M12 3v11m0 0 4-4m-4 4-4-4m-3 7v3h14v-3'); downloadIcon.append(downloadPath);
      link.append(downloadIcon);
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
  if (!canStartCapture(canCapture(), captureRequestId)) return;
  const requestId = `${Date.now()}-${++captureSeq}`;
  startCaptureRequest(requestId);
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

newSessionBtn.addEventListener('click', startSessionForSelectedPoint);

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
      const authorizationArea = currentSelectedArea() || (areasByProject[project] || []).find(area => (photoPointsByProject[project] || []).some(point => point.areaId === area.id));
      if (!authorizationArea) throw new Error('Il progetto non contiene punti foto.');
      await createSession(authorizationArea);
      renderAreas();
    }
    const response = await fetch(`/api/projects/${encodeURIComponent(project)}/download-ticket`, {
      method: 'POST',
      headers: { 'x-room': session.room, 'x-controller-token': session.controllerToken }
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Download non riuscito');
    const download = await response.json();
    if (!download.url?.startsWith('/api/project-downloads/')) throw new Error('Link di download non valido.');
    const link = document.createElement('a');
    link.href = download.url;
    link.download = `${project}.zip`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  } catch (error) {
    window.alert(error instanceof TypeError ? 'Impossibile contattare il server per preparare lo ZIP.' : error.message);
  } finally {
    downloadProjectBtn.textContent = originalLabel;
    updateProjectUi();
  }
});

projectSelect.addEventListener('change', () => { pendingPhotoPoint = null; addingPhotoPoint = false; addPhotoPointBtn.classList.remove('active'); updateProjectUi(); });

areaSelect.addEventListener('change', () => { renderAreas(); publishActiveArea(); });
startPointSessionBtn.addEventListener('click', startSessionForSelectedPoint);
closeAreaBtn.addEventListener('click', () => {
  const area = currentArea();
  if (!area || !window.confirm(`Chiudere il punto foto “${area.name}”? Le foto resteranno nella sua cartella.`)) return;
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

syncWorkspaceBtn.addEventListener('click', syncWorkspace);

renameProjectBtn.addEventListener('click', async () => {
  const current = projectSelect.value;
  const name = nextProjectName(projects.filter(project => project !== current), window.prompt('Nuovo nome progetto:', current) || '');
  if (!name) return;
  try {
    if (cadByProject[current]) await moveLayerFile(current, name);
  } catch (error) {
    window.alert(`Impossibile rinominare il layer: ${error.message}`);
    return;
  }
  projects = projects.map(project => project === current ? name : project);
  if (cadByProject[current]) { cadByProject[name] = cadByProject[current]; delete cadByProject[current]; }
  if (cadDrawingByProject[current]) { cadDrawingByProject[name] = cadDrawingByProject[current]; delete cadDrawingByProject[current]; }
  if (photoPointsByProject[current]) { photoPointsByProject[name] = photoPointsByProject[current]; delete photoPointsByProject[current]; }
  if (areasByProject[current]) { areasByProject[name] = areasByProject[current]; delete areasByProject[current]; }
  saveWorkspace();
  renderProjects();
  projectSelect.value = name;
  updateProjectUi();
});

deleteProjectBtn.addEventListener('click', async () => {
  const current = projectSelect.value;
  if (!current || !window.confirm(`Eliminare il progetto “${current}”?`)) return;
  try { await deleteLayerFile(current); } catch (error) { window.alert(`Impossibile eliminare il layer: ${error.message}`); return; }
  projects = projects.filter(project => project !== current);
  revokeLayerImage(cadDrawingByProject[current]);
  delete cadByProject[current];
  delete cadDrawingByProject[current];
  delete photoPointsByProject[current];
  delete areasByProject[current];
  saveWorkspace();
  renderProjects();
});

uploadCadBtn.addEventListener('click', () => cadFile.click());
cadFile.addEventListener('change', async () => {
  const file = cadFile.files?.[0];
  const error = layerValidationError(file);
  if (error) { if (file) window.alert(error); cadFile.value = ''; return; }
  const project = projectSelect.value;
  const previousDrawing = cadDrawingByProject[project];
  let drawing = null;
  try {
    const kind = layerFileKind(file);
    drawing = await createLayerDrawing(file, file.name, kind);
    await saveLayerFile(project, file);
    revokeLayerImage(previousDrawing);
    if (drawing) cadDrawingByProject[project] = drawing;
    else delete cadDrawingByProject[project];
    cadByProject[project] = { name: file.name, size: file.size, kind };
    selectedPhotoPointId = null;
    saveWorkspace();
    updateProjectUi();
  } catch (uploadError) {
    if (drawing !== previousDrawing) revokeLayerImage(drawing);
    window.alert(uploadError.message);
  } finally {
    cadFile.value = '';
  }
});

deleteCadBtn.addEventListener('click', async () => {
  const project = projectSelect.value;
  if (!project || !window.confirm('Rimuovere il layer dal progetto?')) return;
  try { await deleteLayerFile(project); } catch (error) { window.alert(error.message); return; }
  revokeLayerImage(cadDrawingByProject[project]);
  delete cadByProject[project];
  cadShapes = []; cadBounds = null; cadView = null; layerImageUrl = ''; delete cadDrawingByProject[project]; selectedPhotoPointId = null;
  saveWorkspace();
  updateProjectUi();
});

addPhotoPointBtn.addEventListener('click', () => { pendingPhotoPoint = null; addingPhotoPoint = !addingPhotoPoint; addPhotoPointBtn.classList.toggle('active', addingPhotoPoint); renderCad(); });
photoPointNameForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!pendingPhotoPoint || pendingPhotoPoint.project !== projectSelect.value) return;
  const points = projectPoints();
  const name = nextPhotoPointName(points, photoPointName.value);
  if (!name) {
    photoPointName.setCustomValidity('Inserisci un nome univoco per il punto foto.');
    photoPointName.reportValidity();
    return;
  }
  photoPointName.setCustomValidity('');
  const photoPoint = createPhotoPoint(points, pendingPhotoPoint.x, pendingPhotoPoint.y, name);
  (photoPointsByProject[pendingPhotoPoint.project] ||= []).push(photoPoint);
  linkPhotoPointsToAreas(photoPointsByProject[pendingPhotoPoint.project], areasByProject[pendingPhotoPoint.project] ||= []);
  areaSelect.value = photoPoint.areaId;
  selectedPhotoPointId = photoPoint.id;
  pendingPhotoPoint = null;
  saveWorkspace();
  renderAreas();
  publishActiveArea();
});
photoPointName.addEventListener('input', () => photoPointName.setCustomValidity(''));
cancelPhotoPointBtn.addEventListener('click', () => { pendingPhotoPoint = null; renderCad(); });
zoomInCadBtn.addEventListener('click', () => changeCadZoom(.75));
zoomOutCadBtn.addEventListener('click', () => changeCadZoom(1.25));
resetCadViewBtn.addEventListener('click', () => { cadView = cadBounds && { ...cadBounds }; if (cadDrawingByProject[projectSelect.value]) cadDrawingByProject[projectSelect.value].view = cadView; renderCad(); });
renderHelp();
loadWorkspace();
config = await loadConfig();
setStatus(statusEl, 'Crea un punto foto', 'warn');
