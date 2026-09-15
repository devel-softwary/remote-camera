import assert from 'node:assert/strict';
import { MAX_CAD_SIZE, cadValidationError, isCadFile, nextProjectName } from '../public/controller-model.js';
import { createPhotoPoint, drawingBounds, parseDxf } from '../public/cad-viewer.js';

assert.equal(isCadFile({ name: 'rilievo.DWG' }), true);
assert.equal(isCadFile({ name: 'rilievo.pdf' }), false);
assert.equal(cadValidationError({ name: 'rilievo.pdf', size: 1 }), 'Sono supportati solo file DWG o DXF.');
assert.equal(cadValidationError({ name: 'rilievo.dxf', size: MAX_CAD_SIZE + 1 }), 'Il file CAD supera il limite di 50 MB.');
assert.equal(cadValidationError({ name: 'rilievo.dxf', size: MAX_CAD_SIZE }), '');
assert.equal(nextProjectName(['Rilievo 01'], ' rilievo 01 '), '');
assert.equal(nextProjectName(['Rilievo 01'], ' Rilievo 02 '), 'Rilievo 02');
const shapes = parseDxf('0\nLINE\n10\n0\n20\n0\n11\n20\n21\n10\n0\nEOF\n');
assert.deepEqual(shapes, [{ type: 'line', x1: 0, y1: 0, x2: 20, y2: 10 }]);
assert.ok(drawingBounds(shapes).width > 20);
const photoPoint = createPhotoPoint([], 12, 8);
assert.deepEqual({ label: photoPoint.label, x: photoPoint.x, y: photoPoint.y }, { label: 'Punto foto 1', x: 12, y: 8 });
