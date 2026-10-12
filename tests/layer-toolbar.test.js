import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const controllerHtml = await readFile(new URL('../public/controller.html', import.meta.url), 'utf8');
const controllerJs = await readFile(new URL('../public/controller.js', import.meta.url), 'utf8');

assert.match(controllerHtml, /id="addPhotoPoint"/);
assert.match(controllerHtml, /id="photoPointName"[^>]*maxlength="80"/);
assert.match(controllerHtml, /id="photoPointNameForm"/);
assert.match(controllerHtml, /<h2>Punto foto<\/h2>/);
assert.match(controllerHtml, /id="photoPointList"/);
assert.match(controllerHtml, /id="startPointSession"[^>]*>Avvia sessione<\/button>/);
assert.doesNotMatch(controllerHtml, /id="newArea"/);
assert.doesNotMatch(controllerHtml, /id="(?:newMappedArea|completeMappedArea|cancelMappedArea)"/);
assert.match(controllerHtml, /Sul layer resta disponibile solo il posizionamento dei punti foto|Aggiungi punto foto/);
assert.match(controllerJs, /Rinomina \$\{point\.label\}/);
assert.match(controllerJs, /Elimina \$\{point\.label\}/);
assert.match(controllerJs, /addEventListener\('dblclick', handleCadDoubleClick\)/);
assert.match(controllerJs, /function beginPhotoPoint\(x, y\)/);

console.log('Layer photo-point-only regression passed');
