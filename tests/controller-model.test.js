import assert from 'node:assert/strict';
import { MAX_CAD_SIZE, cadValidationError, isCadFile, nextProjectName } from '../public/controller-model.js';

assert.equal(isCadFile({ name: 'rilievo.DWG' }), true);
assert.equal(isCadFile({ name: 'rilievo.pdf' }), false);
assert.equal(cadValidationError({ name: 'rilievo.pdf', size: 1 }), 'Sono supportati solo file DWG o DXF.');
assert.equal(cadValidationError({ name: 'rilievo.dxf', size: MAX_CAD_SIZE + 1 }), 'Il file CAD supera il limite di 50 MB.');
assert.equal(cadValidationError({ name: 'rilievo.dxf', size: MAX_CAD_SIZE }), '');
assert.equal(nextProjectName(['Rilievo 01'], ' rilievo 01 '), '');
assert.equal(nextProjectName(['Rilievo 01'], ' Rilievo 02 '), 'Rilievo 02');
