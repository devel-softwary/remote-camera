import assert from 'node:assert/strict';
import { MAX_CAD_SIZE, cadValidationError, canDownloadProject, canManageAreas, isCadFile, isProjectSelected, nextProjectName } from '../public/controller-model.js';
import { createPhotoPoint, drawingBounds, parseDxf } from '../public/cad-viewer.js';
import { createSessionBinding, matchesSessionBinding } from '../session-policy.js';
import { canCreateMappedArea, createInterventionArea, createMappedInterventionArea, nextAreaName, normalizeAreaVertices, openAreaForProject, reopenInterventionArea } from '../public/controller-model.js';
import { photoExtension, safeFolderName } from '../storage-policy.js';
import { HELP_STEPS } from '../public/help-content.js';

assert.equal(isCadFile({ name: 'rilievo.DWG' }), true);
assert.equal(isCadFile({ name: 'rilievo.pdf' }), false);
assert.equal(cadValidationError({ name: 'rilievo.pdf', size: 1 }), 'Sono supportati solo file DWG o DXF.');
assert.equal(cadValidationError({ name: 'rilievo.dxf', size: MAX_CAD_SIZE + 1 }), 'Il file CAD supera il limite di 50 MB.');
assert.equal(cadValidationError({ name: 'rilievo.dxf', size: MAX_CAD_SIZE }), '');
assert.equal(nextProjectName(['Rilievo 01'], ' rilievo 01 '), '');
assert.equal(nextProjectName(['Rilievo 01'], ' Rilievo 02 '), 'Rilievo 02');
assert.equal(isProjectSelected('Rilievo 02'), true);
assert.equal(isProjectSelected('   '), false);
assert.equal(canManageAreas('Rilievo 02'), true);
assert.equal(canManageAreas(''), false);
assert.equal(canDownloadProject('Rilievo 02'), true);
assert.equal(canDownloadProject(''), false);
const shapes = parseDxf('0\nLINE\n10\n0\n20\n0\n11\n20\n21\n10\n0\nEOF\n');
assert.deepEqual(shapes, [{ type: 'line', x1: 0, y1: 0, x2: 20, y2: 10 }]);
assert.ok(drawingBounds(shapes).width > 20);
const photoPoint = createPhotoPoint([], 12, 8);
assert.deepEqual({ label: photoPoint.label, x: photoPoint.x, y: photoPoint.y }, { label: 'Punto foto 1', x: 12, y: 8 });
const binding = createSessionBinding('Progetto', 'Pilastro sud');
assert.deepEqual(binding, { project: 'Progetto', area: 'Pilastro sud' });
assert.equal(matchesSessionBinding(binding, 'Progetto', 'Pilastro sud'), true);
assert.equal(matchesSessionBinding(binding, 'Progetto', 'Pilastro nord'), false);
assert.equal(createSessionBinding('Progetto', ''), null);
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
assert.equal(HELP_STEPS.length, 4);
assert.deepEqual(HELP_STEPS[2].details, [
  'Seleziona prima l’area di intervento.',
  'Il QR è vincolato alla coppia progetto-area.',
  'Il cellulare potrà riagganciarsi fino alla scadenza.'
]);
