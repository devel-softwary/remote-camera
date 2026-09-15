export const MAX_CAD_SIZE = 50 * 1024 * 1024;

export function isCadFile(file) {
  return Boolean(file && /\.(dwg|dxf)$/i.test(file.name));
}

export function cadValidationError(file) {
  if (!file) return 'Seleziona un file CAD.';
  if (!isCadFile(file)) return 'Sono supportati solo file DWG o DXF.';
  if (file.size > MAX_CAD_SIZE) return 'Il file CAD supera il limite di 50 MB.';
  return '';
}

export function nextProjectName(existingNames, requestedName) {
  const name = requestedName.trim();
  if (!name) return '';
  return existingNames.some(item => item.toLocaleLowerCase() === name.toLocaleLowerCase()) ? '' : name;
}

export function photoPointForProject(pointsByProject, project) {
  return Array.isArray(pointsByProject[project]) ? pointsByProject[project] : [];
}
