import assert from 'node:assert/strict';
import { canDownloadProject, projectArchiveName, projectArchiveRoot } from '../project-download.js';

const session = { project: 'Traliccio A', controllerToken: 'controller-token', expiresAt: 2_000 };
const tokensEqual = (actual, supplied) => actual === supplied;

assert.equal(canDownloadProject(session, 'Traliccio A', 'controller-token', tokensEqual, 1_999), true);
assert.equal(canDownloadProject(session, 'Altro progetto', 'controller-token', tokensEqual, 1_999), false);
assert.equal(canDownloadProject(session, 'Traliccio A', 'wrong-token', tokensEqual, 1_999), false);
assert.equal(canDownloadProject(session, 'Traliccio A', 'controller-token', tokensEqual, 2_000), false);
assert.equal(projectArchiveName('Traliccio A'), 'Traliccio A.zip');
assert.equal(projectArchiveRoot('/srv/uploads', 'Traliccio A'), '/srv/uploads/Traliccio A');

console.log('Project download regression passed');
