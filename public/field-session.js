import { maradonaPointName, normalizeMaradonaLocation, normalizeWorkProfile } from './work-profile.js';

export function fieldProjects(workspace = {}) {
  const areasByProject = workspace.areasByProject || {};
  return (workspace.projects || []).filter(project => fieldAreas(workspace, project).length && Array.isArray(areasByProject[project]));
}

export function fieldAreas(workspace = {}, project = '') {
  return (workspace.areasByProject?.[project] || []).filter(area => area?.name && area.status === 'open');
}

export function fieldSessionRequest(workspace, project, areaName) {
  const areas = fieldAreas(workspace, project);
  const area = areas.find(item => item.name === areaName);
  if (!project || !area) return null;
  return {
    project,
    area: area.name,
    workProfile: workspace.projectProfilesByProject?.[project] || { type: 'generic' },
    location: area.location || null,
    areas: areas.map(item => ({ name: item.name, location: item.location || null })),
    localMode: true
  };
}

export function fieldPhotoItems(workspace, project, areaName, queuedPhotos = []) {
  const area = (workspace?.areasByProject?.[project] || []).find(item => item.name === areaName);
  const saved = (area?.photos || []).filter(photo => typeof photo?.url === 'string' && photo.url.startsWith('/uploads/')).map(photo => ({
    id: photo.id || photo.url,
    source: 'server',
    url: photo.url,
    createdAt: photo.createdAt || '',
    size: photo.size || 0
  }));
  const queued = queuedPhotos.filter(photo => photo?.project === project && photo.area === areaName && photo.blob instanceof Blob).map(photo => ({
    id: photo.id,
    source: 'device',
    blob: photo.blob,
    createdAt: photo.createdAt || '',
    size: photo.size || photo.blob.size
  }));
  return [...queued, ...saved].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function createFieldProject(workspace = {}, input = {}, createId = () => crypto.randomUUID()) {
  const name = String(input.name || '').trim();
  const existing = workspace.projects || [];
  if (!name || name.length > 80 || name === '.' || name === '..' || /[\\/:*?"<>|\x00-\x1f]/.test(name) || existing.some(project => project.toLocaleLowerCase() === name.toLocaleLowerCase())) return null;
  const profile = normalizeWorkProfile({ type: input.type });
  const location = profile.type === 'maradona' ? normalizeMaradonaLocation(input.location) : null;
  const pointName = profile.type === 'maradona' ? maradonaPointName(location) : String(input.pointName || '').trim();
  if (!pointName || pointName.length > 80 || pointName === '.' || pointName === '..' || /[\\/:*?"<>|\x00-\x1f]/.test(pointName)) return null;
  const area = { id: createId(), name: pointName, status: 'open', photos: [], ...(location ? { location } : {}) };
  return {
    workspace: {
      projects: [...existing, name],
      projectProfilesByProject: { ...(workspace.projectProfilesByProject || {}), [name]: profile },
      areasByProject: { ...(workspace.areasByProject || {}), [name]: [area] }
    },
    project: name,
    area: pointName
  };
}
