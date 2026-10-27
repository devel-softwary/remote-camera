import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mergeWorkspaces, normalizeWorkspace, readWorkspace, writeWorkspace } from '../workspace-storage.js';

assert.deepEqual(normalizeWorkspace({ projects: [' Progetto ', '../non valido'], areasByProject: { ' Progetto ': [{ id: 'a1', name: ' Area ', status: 'closed' }] } }), {
  projects: ['Progetto'], areasByProject: { Progetto: [{ id: 'a1', name: 'Area', status: 'closed' }] }, projectProfilesByProject: { Progetto: { type: 'generic' } }
});
assert.deepEqual(normalizeWorkspace({ projects: ['DAM'], areasByProject: { DAM: [{ id: 'n1', name: 'Nodo', location: { tower: 1, face: 'a', node: 1 } }] }, projectProfilesByProject: { DAM: { type: 'maradona' } } }).areasByProject.DAM[0].location, { tower: 'TR01', face: 'A', node: 'N001' });
const merged = mergeWorkspaces(
  { projects: ['Rilievo'], areasByProject: { Rilievo: [{ id: 'nord', name: 'Nord', status: 'open', photos: [{ id: 'p1', url: '/uploads/p1' }] }] }, projectProfilesByProject: { Rilievo: { type: 'maradona' } } },
  { projects: ['Rilievo', 'Altro'], areasByProject: { Rilievo: [{ id: 'nord', name: 'Nord', status: 'closed', photos: [{ id: 'p1', url: '/uploads/p1' }, { id: 'p2', url: '/uploads/p2' }] }], Altro: [] }, projectProfilesByProject: { Altro: { type: 'generic' } } }
);
assert.deepEqual(merged.projects, ['Rilievo', 'Altro']);
assert.equal(merged.areasByProject.Rilievo[0].status, 'closed');
assert.equal(merged.areasByProject.Rilievo[0].photos.length, 2);
assert.deepEqual(merged.projectProfilesByProject, { Rilievo: { type: 'maradona', workName: 'DAM' }, Altro: { type: 'generic' } });
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-camera-workspace-'));
const file = path.join(directory, 'workspace.json');
assert.deepEqual(readWorkspace(file), { projects: [], areasByProject: {}, projectProfilesByProject: {} });
writeWorkspace(file, merged);
assert.deepEqual(readWorkspace(file), merged);
fs.rmSync(directory, { recursive: true, force: true });
