import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNodeExcel, maradonaNodeArea, nodeExcelFilename, nodeExcelRelationshipsXml, nodeExcelWorksheetXml } from '../node-excel.js';

const location = { tower: 1, face: 'a', node: 7 };
const photos = [
  { filename: 'TR01_A_N007_01.jpg', publicUrl: 'https://camera.example.com/uploads/DAM/TR01/A/N007/TR01_A_N007_01.jpg' },
  { filename: 'TR01_A_N007_02.jpg', publicUrl: 'https://camera.example.com/uploads/DAM/TR01/A/N007/TR01_A_N007_02.jpg?x=1&y=2' }
];

assert.equal(nodeExcelFilename(location), 'TR01_A_N007.xlsx');
const session = { workProfile: { type: 'maradona' }, allowedAreas: [{ name: 'Nodo 7', location }] };
assert.deepEqual(maradonaNodeArea(session, 'Nodo 7'), { name: 'Nodo 7', location: { tower: 'TR01', face: 'A', node: 'N007' } });
assert.equal(maradonaNodeArea(session, 'Nodo estraneo'), null);
assert.equal(maradonaNodeArea({ ...session, workProfile: { type: 'generic' } }, 'Nodo 7'), null);
const sheet = nodeExcelWorksheetXml({ jobCode: 'XXXX', location, photos });
assert.match(sheet, /Commessa/);
assert.match(sheet, /N° Traliccio/);
assert.match(sheet, /TR01/);
assert.match(sheet, /ID NODO/);
assert.match(sheet, /A 007/);
assert.match(sheet, /FOTO 1/);
assert.match(sheet, /TR01_A_N007_01\.jpg/);
assert.match(sheet, /hyperlink ref="B5" r:id="rId1"/);
const relationships = nodeExcelRelationshipsXml(photos);
assert.match(relationships, /TargetMode="External"/);
assert.match(relationships, /x=1&amp;y=2/);
const workbook = await createNodeExcel({ jobCode: 'XXXX', location, photos });
assert.deepEqual([...workbook.subarray(0, 2)], [0x50, 0x4b]);
assert.ok(workbook.length > 1000);

const controllerSource = await readFile(new URL('../public/controller.js', import.meta.url), 'utf8');
const pointListSource = controllerSource.slice(controllerSource.indexOf('function renderAreas()'), controllerSource.indexOf('function canCapture()'));
const gallerySource = controllerSource.slice(controllerSource.indexOf('function renderGallery()'), controllerSource.indexOf('async function deleteGalleryPhoto'));
assert.match(pointListSource, /point-action-excel/);
assert.match(gallerySource, /photo-area-heading/);
assert.match(gallerySource, /Scarica XLSX/);
assert.match(gallerySource, /isMaradona && area\.location/);

console.log('Maradona node Excel regression passed');
