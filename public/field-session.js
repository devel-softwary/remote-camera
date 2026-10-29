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
