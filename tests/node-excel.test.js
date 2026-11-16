import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNodeExcel, fillNodeTemplateWorksheet, maradonaNodeArea, nodeExcelFilename, nodeExcelRelationshipsXml, readXlsxEntries } from '../node-excel.js';

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
const relationships = nodeExcelRelationshipsXml(photos);
assert.match(relationships, /TargetMode="External"/);
assert.match(relationships, /x=1&amp;y=2/);
const workbook = await createNodeExcel({ jobCode: 'XXXX', location, photos });
assert.deepEqual([...workbook.subarray(0, 2)], [0x50, 0x4b]);
assert.ok(workbook.length > 10_000);
const entries = readXlsxEntries(workbook);
const sheet = entries.find(entry => entry.name === 'xl/worksheets/sheet1.xml').data.toString('utf8');
const sharedStrings = entries.find(entry => entry.name === 'xl/sharedStrings.xml').data.toString('utf8');
assert.match(sharedStrings, /SCHEDA DI RILIEVO NODO BULLONATO/);
assert.match(sheet, /r="C5"[^>]*t="inlineStr"[^>]*><is><t>XXXX<\/t>/);
assert.match(sheet, /r="H5"[^>]*t="inlineStr"[^>]*><is><t>TR01<\/t>/);
assert.match(sheet, /r="F6"[^>]*t="inlineStr"[^>]*><is><t>A 007<\/t>/);
assert.match(sheet, /Apri FOTO 1/);
assert.match(sheet, /TR01_A_N007_01\.jpg/);
assert.match(sheet, /hyperlink ref="B16" r:id="rId1"/);
assert.match(sheet, /hyperlink ref="B28" r:id="rId1"/);
assert.match(sheet, /sqref="K6"/);
assert.ok(entries.some(entry => entry.name === 'docProps/thumbnail.wmf'));
assert.ok(entries.some(entry => entry.name === 'xl/worksheets/_rels/sheet1.xml.rels'));

const templateEntries = readXlsxEntries(await readFile(new URL('../docs/scheda-rilievo-nodo-bullonato-traliccio-acciaio.xlsx', import.meta.url)));
const templateSheet = templateEntries.find(entry => entry.name === 'xl/worksheets/sheet1.xml').data.toString('utf8');
const extraSheet = fillNodeTemplateWorksheet(templateSheet, { jobCode: 'XXXX', location, photos: [...photos, ...Array.from({ length: 5 }, (_, index) => ({ filename: `extra-${index}.jpg`, publicUrl: `https://camera.example.com/extra-${index}.jpg` }))] });
assert.match(extraSheet, /FOTO AGGIUNTIVE/);
assert.match(extraSheet, /extra-4\.jpg/);
assert.match(extraSheet, /hyperlink ref="C67" r:id="rId7"/);

const controllerSource = await readFile(new URL('../public/controller.js', import.meta.url), 'utf8');
const pointListSource = controllerSource.slice(controllerSource.indexOf('function renderAreas()'), controllerSource.indexOf('function canCapture()'));
const gallerySource = controllerSource.slice(controllerSource.indexOf('function renderGallery()'), controllerSource.indexOf('async function deleteGalleryPhoto'));
assert.match(pointListSource, /point-action-excel/);
assert.match(gallerySource, /photo-area-heading/);
assert.match(gallerySource, /Scarica XLSX/);
assert.match(gallerySource, /isMaradona && area\.location/);

console.log('Maradona node Excel regression passed');
