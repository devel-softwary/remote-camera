import assert from 'node:assert/strict';
import { MAX_CAD_SIZE, MAX_LAYER_IMAGE_SIZE, cadValidationError, canCaptureArea, canDownloadProject, canManageAreas, canStartPointSession, isCadFile, isLayerImage, isProjectSelected, layerFileKind, layerValidationError, linkPhotoPointsToAreas, nextPhotoPointName, nextProjectName, removePhotoPoint, renamePhotoPoint } from '../public/controller-model.js';
import { createPhotoPoint, drawingBounds, isPointerDrag, parseDxf } from '../public/cad-viewer.js';
import { authorizePhotoUpload, createAllowedSessionAreas, createSessionBinding, createSessionStorageBinding, fieldSessionPayload, matchesSessionBinding } from '../session-policy.js';
import { canCreateMappedArea, createInterventionArea, createMappedInterventionArea, nextAreaName, normalizeAreaVertices, openAreaForProject, reopenInterventionArea } from '../public/controller-model.js';
import { photoExtension, safeFolderName } from '../storage-policy.js';
import { HELP_STEPS } from '../public/help-content.js';

assert.equal(isCadFile({ name: 'rilievo.DWG' }), true);
assert.equal(isCadFile({ name: 'rilievo.pdf' }), false);
assert.equal(cadValidationError({ name: 'rilievo.pdf', size: 1 }), 'Sono supportati solo file DWG o DXF.');
assert.equal(cadValidationError({ name: 'rilievo.dxf', size: MAX_CAD_SIZE + 1 }), 'Il file CAD supera il limite di 50 MB.');
assert.equal(cadValidationError({ name: 'rilievo.dxf', size: MAX_CAD_SIZE }), '');
assert.equal(isLayerImage({ name: 'planimetria.JPG', type: 'image/jpeg' }), true);
assert.equal(isLayerImage({ name: 'planimetria.svg', type: 'image/svg+xml' }), false);
assert.equal(isLayerImage({ name: 'planimetria.jpg', type: 'text/html' }), false);
assert.equal(layerFileKind({ name: 'planimetria.webp', type: 'image/webp' }), 'image');
assert.equal(layerFileKind({ name: 'planimetria.dwg' }), 'cad');
assert.equal(layerValidationError({ name: 'planimetria.pdf', type: 'application/pdf', size: 1 }), 'Sono supportati PNG, JPG, WEBP, GIF, DWG e DXF.');
assert.equal(layerValidationError({ name: 'planimetria.png', type: 'image/png', size: MAX_LAYER_IMAGE_SIZE + 1 }), 'L’immagine supera il limite di 20 MB.');
assert.equal(layerValidationError({ name: 'planimetria.png', type: 'image/png', size: MAX_LAYER_IMAGE_SIZE }), '');
assert.equal(nextProjectName(['Rilievo 01'], ' rilievo 01 '), '');
assert.equal(nextProjectName(['Rilievo 01'], ' Rilievo 02 '), 'Rilievo 02');
assert.equal(isProjectSelected('Rilievo 02'), true);
assert.equal(isProjectSelected('   '), false);
assert.equal(canManageAreas('Rilievo 02'), true);
assert.equal(canManageAreas(''), false);
assert.equal(canCaptureArea({ name: 'Area nord' }, { project: 'Rilievo 02', area: 'Area sud' }, 'Rilievo 02', 'open'), true);
assert.equal(canCaptureArea({ name: 'Area nord' }, { project: 'Altro progetto' }, 'Rilievo 02', 'open'), false);
assert.equal(canCaptureArea({ name: 'Area nord' }, { project: 'Rilievo 02' }, 'Rilievo 02', 'closed'), false);
assert.equal(canDownloadProject('Rilievo 02'), true);
assert.equal(canDownloadProject(''), false);
assert.equal(canStartPointSession('Rilievo 02', { status: 'open' }), true);
assert.equal(canStartPointSession('Rilievo 02', { status: 'closed' }), false);
assert.equal(canStartPointSession('', { status: 'open' }), false);
assert.equal(canStartPointSession('Rilievo 02', { status: 'open' }, true), false);
const shapes = parseDxf('0\nLINE\n10\n0\n20\n0\n11\n20\n21\n10\n0\nEOF\n');
assert.deepEqual(shapes, [{ type: 'line', x1: 0, y1: 0, x2: 20, y2: 10 }]);
assert.ok(drawingBounds(shapes).width > 20);
assert.equal(isPointerDrag(10, 10, 12, 12), false);
assert.equal(isPointerDrag(10, 10, 14, 10), true);
const photoPoint = createPhotoPoint([], 12, 8);
assert.deepEqual({ label: photoPoint.label, x: photoPoint.x, y: photoPoint.y }, { label: 'Punto foto 1', x: 12, y: 8 });
const namedPhotoPoint = createPhotoPoint([], 12, 8, 'Nodo nord');
assert.equal(namedPhotoPoint.label, 'Nodo nord');
const maradonaPoint = createPhotoPoint([], 12, 8, 'TR01_A_N001', { tower: 'TR01', face: 'A', node: 'N001' });
assert.deepEqual(maradonaPoint.location, { tower: 'TR01', face: 'A', node: 'N001' });
assert.equal(nextPhotoPointName([], ' Nodo nord '), 'Nodo nord');
assert.equal(nextPhotoPointName([{ label: 'Nodo nord' }], 'nodo NORD'), '');
assert.equal(nextPhotoPointName([], '   '), '');
const linkedPoints = [{ id: 'point-1', label: 'Nodo nord' }];
const linkedAreas = [];
assert.equal(linkPhotoPointsToAreas(linkedPoints, linkedAreas), true);
assert.equal(linkedAreas[0].name, 'Nodo nord');
assert.equal(linkedPoints[0].areaId, linkedAreas[0].id);
assert.equal(linkPhotoPointsToAreas(linkedPoints, linkedAreas), false);
assert.equal(renamePhotoPoint(linkedPoints, linkedAreas, 'point-1', ' Nodo sud '), true);
assert.equal(linkedPoints[0].label, 'Nodo sud');
assert.equal(linkedAreas[0].name, 'Nodo sud');
assert.equal(renamePhotoPoint(linkedPoints, linkedAreas, 'point-1', '   '), false);
const removedPoint = removePhotoPoint(linkedPoints, linkedAreas, 'point-1');
assert.equal(removedPoint.point.label, 'Nodo sud');
assert.equal(removedPoint.area.name, 'Nodo sud');
assert.deepEqual(linkedPoints, []);
assert.deepEqual(linkedAreas, []);
const structuredPoints = [{ id: 'point-2', label: 'TR01_A_N001', location: { tower: 'TR01', face: 'A', node: 'N001' } }];
const structuredAreas = [];
assert.equal(linkPhotoPointsToAreas(structuredPoints, structuredAreas), true);
assert.deepEqual(structuredAreas[0].location, structuredPoints[0].location);
const binding = createSessionBinding('Progetto', 'Pilastro sud');
assert.deepEqual(binding, { project: 'Progetto', area: 'Pilastro sud' });
assert.equal(matchesSessionBinding(binding, 'Progetto', 'Pilastro sud'), true);
assert.equal(matchesSessionBinding(binding, 'Progetto', 'Pilastro nord'), false);
assert.equal(createSessionBinding('Progetto', ''), null);
assert.deepEqual(createSessionStorageBinding({ type: 'generic' }), { workProfile: { type: 'generic' }, location: null });
assert.deepEqual(createSessionStorageBinding({ type: 'maradona' }, { tower: 28, face: 'd', node: 100 }), { workProfile: { type: 'maradona', workName: 'DAM' }, location: { tower: 'TR28', face: 'D', node: 'N100' } });
assert.equal(createSessionStorageBinding({ type: 'maradona' }, { tower: 29, face: 'A', node: 1 }), null);
assert.deepEqual(createAllowedSessionAreas('DAM', [
  { name: 'Nodo 1', location: { tower: 1, face: 'a', node: 1 } },
  { name: 'nodo 1', location: { tower: 2, face: 'B', node: 2 } },
  { name: '../vietato', location: { tower: 2, face: 'B', node: 2 } }
], { type: 'maradona' }), [{ name: 'Nodo 1', location: { tower: 'TR01', face: 'A', node: 'N001' } }]);
const uploadSession = { project: 'DAM', area: 'Nodo 1', activeArea: 'Nodo 1', location: null, controllerToken: 'central', cameraToken: 'camera', localMode: true, expiresAt: 2000, allowedAreas: [{ name: 'Nodo 1', location: null }, { name: 'Nodo 2', location: null }] };
const equalTokens = (actual, supplied) => actual === supplied;
assert.equal(authorizePhotoUpload(uploadSession, { project: 'DAM', area: 'Nodo 1', controllerToken: 'central' }, equalTokens, 1999).role, 'controller');
assert.equal(authorizePhotoUpload(uploadSession, { project: 'DAM', area: 'Nodo 2', cameraToken: 'camera' }, equalTokens, 1999).role, 'camera');
assert.equal(authorizePhotoUpload(uploadSession, { project: 'DAM', area: 'Nodo 3', cameraToken: 'camera' }, equalTokens, 1999), null);
assert.equal(authorizePhotoUpload(uploadSession, { project: 'DAM', area: 'Nodo 1', cameraToken: 'camera' }, equalTokens, 2000), null);
assert.deepEqual(fieldSessionPayload(uploadSession, 'camera', equalTokens, 1999), {
  project: 'DAM', activeArea: 'Nodo 1', areas: [{ name: 'Nodo 1' }, { name: 'Nodo 2' }], expiresAt: new Date(2000).toISOString()
});
assert.equal(fieldSessionPayload(uploadSession, 'wrong', equalTokens, 1999), null);
assert.equal(fieldSessionPayload(uploadSession, 'camera', equalTokens, 2000), null);
assert.equal(nextAreaName([{ name: 'Pilastro nord' }], ' pilastro NORD '), '');
assert.equal(nextAreaName([], ' Pilastro sud '), 'Pilastro sud');
const area = createInterventionArea([], 'Pilastro sud');
assert.equal(area.status, 'open');
area.status = 'closed';
assert.equal(reopenInterventionArea(area), true);
assert.equal(area.status, 'open');
assert.equal(reopenInterventionArea(area), false);
assert.equal(openAreaForProject({ Progetto: [area] }, 'Progetto'), area);
assert.deepEqual(normalizeAreaVertices([{ x: 1, y: 2 }, { x: '1', y: 2 }, null]), [{ x: 1, y: 2 }]);
assert.equal(canCreateMappedArea([{ x: 0, y: 0 }, { x: 1, y: 0 }]), false);
assert.equal(canCreateMappedArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]), true);
const mappedArea = createMappedInterventionArea([], 'Traliccio', [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 2 }]);
assert.equal(mappedArea.vertices.length, 3);
assert.equal(safeFolderName('Area 01'), 'Area 01');
assert.equal(safeFolderName('../segreto'), '');
assert.equal(photoExtension('image/png'), 'png');
assert.equal(HELP_STEPS.length, 5);
assert.deepEqual(HELP_STEPS[3].details, [
  'Seleziona prima il punto foto.',
  'Il QR è vincolato al progetto; puoi cambiare punto foto senza scollegare la camera.',
  'Il cellulare potrà riagganciarsi fino alla scadenza.'
]);
