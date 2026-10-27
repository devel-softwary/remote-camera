export const MAX_CAD_SIZE = 50 * 1024 * 1024;
export const MAX_LAYER_IMAGE_SIZE = 20 * 1024 * 1024;

const LAYER_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif)$/i;
const LAYER_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function isCadFile(file) {
  return Boolean(file && /\.(dwg|dxf)$/i.test(file.name));
}

export function cadValidationError(file) {
  if (!file) return 'Seleziona un file CAD.';
  if (!isCadFile(file)) return 'Sono supportati solo file DWG o DXF.';
  if (file.size > MAX_CAD_SIZE) return 'Il file CAD supera il limite di 50 MB.';
  return '';
}

export function isLayerImage(file) {
  if (!file || !LAYER_IMAGE_EXTENSIONS.test(file.name)) return false;
  return !file.type || LAYER_IMAGE_TYPES.has(file.type);
}

export function layerFileKind(file) {
  if (isLayerImage(file)) return 'image';
  if (isCadFile(file)) return 'cad';
  return '';
}

export function layerValidationError(file) {
  if (!file) return 'Seleziona un’immagine o un file DWG/DXF.';
  const kind = layerFileKind(file);
  if (!kind) return 'Sono supportati PNG, JPG, WEBP, GIF, DWG e DXF.';
  if (kind === 'image' && file.size > MAX_LAYER_IMAGE_SIZE) return 'L’immagine supera il limite di 20 MB.';
  if (kind === 'cad' && file.size > MAX_CAD_SIZE) return 'Il file CAD supera il limite di 50 MB.';
  return '';
}

export function nextProjectName(existingNames, requestedName) {
  const name = requestedName.trim();
  if (!name) return '';
  return existingNames.some(item => item.toLocaleLowerCase() === name.toLocaleLowerCase()) ? '' : name;
}

export function isProjectSelected(project) {
  return typeof project === 'string' && project.trim().length > 0;
}

export function canManageAreas(project) {
  return isProjectSelected(project);
}

export function canDownloadProject(project) {
  return isProjectSelected(project);
}

export function canStartPointSession(project, point, isStarting = false) {
  return Boolean(isProjectSelected(project) && point?.status === 'open' && !isStarting);
}

export function photoPointForProject(pointsByProject, project) {
  return Array.isArray(pointsByProject[project]) ? pointsByProject[project] : [];
}

export function nextAreaName(areas, requestedName) {
  const name = String(requestedName || '').trim();
  if (!name) return '';
  return areas.some(area => area.name.toLocaleLowerCase() === name.toLocaleLowerCase()) ? '' : name;
}

export function createInterventionArea(areas, name, location = null) {
  return { id: crypto.randomUUID(), name, status: 'open', photos: [], ...(location ? { location } : {}) };
}

export function createMappedInterventionArea(areas, name, vertices) {
  return { ...createInterventionArea(areas, name), vertices: normalizeAreaVertices(vertices) };
}

export function normalizeAreaVertices(vertices) {
  if (!Array.isArray(vertices)) return [];
  return vertices
    .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map(point => ({ x: point.x, y: point.y }));
}

export function canCreateMappedArea(vertices) {
  return normalizeAreaVertices(vertices).length >= 3;
}

export function reopenInterventionArea(area) {
  if (!area || area.status !== 'closed') return false;
  area.status = 'open';
  return true;
}

export function openAreaForProject(areasByProject, project) {
  return (areasByProject[project] || []).find(area => area.status === 'open') || null;
}

export function canCaptureArea(area, session, project, channelState) {
  return Boolean(area && session?.project === project && channelState === 'open');
}

export function nextPhotoPointName(points, requestedName) {
  const name = String(requestedName || '').trim();
  if (!name) return '';
  return points.some(point => point.label?.toLocaleLowerCase() === name.toLocaleLowerCase()) ? '' : name;
}

export function linkPhotoPointsToAreas(points, areas) {
  let changed = false;
  for (const point of points) {
    const label = String(point?.label || '').trim();
    if (!label) continue;
    let area = areas.find(item => item.id === point.areaId);
    if (!area) area = areas.find(item => String(item.name || '').toLocaleLowerCase() === label.toLocaleLowerCase());
    if (!area) {
      area = createInterventionArea(areas, label, point.location);
      areas.push(area);
      changed = true;
    }
    if (!area.location && point.location) { area.location = point.location; changed = true; }
    if (point.areaId !== area.id) { point.areaId = area.id; changed = true; }
  }
  return changed;
}

export function renamePhotoPoint(points, areas, pointId, requestedName) {
  const point = points.find(item => item.id === pointId);
  if (!point) return false;
  const name = nextPhotoPointName(points.filter(item => item.id !== pointId), requestedName);
  if (!name) return false;
  point.label = name;
  const area = areas.find(item => item.id === point.areaId);
  if (area) area.name = name;
  return true;
}

export function removePhotoPoint(points, areas, pointId) {
  const pointIndex = points.findIndex(item => item.id === pointId);
  if (pointIndex < 0) return null;
  const [point] = points.splice(pointIndex, 1);
  const areaIndex = areas.findIndex(area => area.id === point.areaId && !points.some(item => item.areaId === area.id));
  const area = areaIndex >= 0 ? areas.splice(areaIndex, 1)[0] : null;
  return { point, area };
}
