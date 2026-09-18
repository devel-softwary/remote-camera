import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_PROJECTS = 500;
const MAX_AREAS_PER_PROJECT = 500;

function isSafeName(value) {
  const name = String(value || '').trim();
  return name && name.length <= 80 && !/[\\/:*?"<>|\x00-\x1f]/.test(name) && name !== '.' && name !== '..' ? name : '';
}

function cloneArea(area) {
  const name = isSafeName(area?.name);
  if (!name) return null;
  return {
    id: typeof area.id === 'string' && area.id.length <= 100 ? area.id : crypto.randomUUID(),
    name,
    status: area.status === 'closed' ? 'closed' : 'open',
    ...(Array.isArray(area.vertices) ? { vertices: area.vertices.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y)).slice(0, 1000).map(point => ({ x: point.x, y: point.y })) } : {}),
    ...(Array.isArray(area.photos) ? { photos: area.photos.map(clonePhoto).filter(Boolean).slice(0, 1000) } : {})
  };
}

function clonePhoto(photo) {
  if (!photo || typeof photo !== 'object' || !String(photo.url || '').startsWith('/uploads/')) return null;
  return {
    ...(typeof photo.id === 'string' && photo.id.length <= 100 ? { id: photo.id } : {}),
    url: String(photo.url),
    ...(typeof photo.createdAt === 'string' && photo.createdAt.length <= 40 ? { createdAt: photo.createdAt } : {}),
    ...(Number.isFinite(photo.width) ? { width: photo.width } : {}),
    ...(Number.isFinite(photo.height) ? { height: photo.height } : {}),
    ...(Number.isFinite(photo.size) ? { size: photo.size } : {})
  };
}

export function normalizeWorkspace(input) {
  const requestedProjects = Array.isArray(input?.projects) ? input.projects : [];
  const requestedAreas = input?.areasByProject && typeof input.areasByProject === 'object' ? input.areasByProject : {};
  const projects = [];
  const areasByProject = {};
  for (const rawProject of requestedProjects.slice(0, MAX_PROJECTS)) {
    const project = isSafeName(rawProject);
    if (!project || projects.some(item => item.toLocaleLowerCase() === project.toLocaleLowerCase())) continue;
    projects.push(project);
    const seenAreaIds = new Set();
    const seenAreaNames = new Set();
    areasByProject[project] = (Array.isArray(requestedAreas[rawProject]) ? requestedAreas[rawProject] : [])
      .slice(0, MAX_AREAS_PER_PROJECT)
      .map(cloneArea)
      .filter(area => {
        if (!area || seenAreaIds.has(area.id) || seenAreaNames.has(area.name.toLocaleLowerCase())) return false;
        seenAreaIds.add(area.id); seenAreaNames.add(area.name.toLocaleLowerCase()); return true;
      });
  }
  return { projects, areasByProject };
}

export function mergeWorkspaces(serverWorkspace, localWorkspace) {
  const server = normalizeWorkspace(serverWorkspace);
  const local = normalizeWorkspace(localWorkspace);
  const projects = [...server.projects];
  const areasByProject = structuredClone(server.areasByProject);
  for (const project of local.projects) {
    const existingProject = projects.find(item => item.toLocaleLowerCase() === project.toLocaleLowerCase());
    const targetProject = existingProject || project;
    if (!existingProject) projects.push(project);
    const areas = areasByProject[targetProject] ||= [];
    for (const area of local.areasByProject[project] || []) {
      const index = areas.findIndex(item => item.id === area.id || item.name.toLocaleLowerCase() === area.name.toLocaleLowerCase());
      if (index < 0) areas.push(area);
      else areas[index] = { ...areas[index], ...area, photos: mergePhotos(areas[index].photos, area.photos) };
    }
  }
  return normalizeWorkspace({ projects, areasByProject });
}

function mergePhotos(serverPhotos = [], localPhotos = []) {
  const seen = new Set();
  return [...serverPhotos, ...localPhotos].filter(photo => {
    const key = String(photo?.id || photo?.url || '');
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function readWorkspace(file) {
  try { return normalizeWorkspace(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return normalizeWorkspace({}); throw error; }
}

export function writeWorkspace(file, workspace) {
  const normalized = normalizeWorkspace(workspace);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(normalized), { mode: 0o640 });
  fs.renameSync(temporary, file);
  return normalized;
}
