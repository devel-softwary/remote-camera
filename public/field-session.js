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
