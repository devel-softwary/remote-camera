import assert from 'node:assert/strict';
import { thumbnailStorageKey } from '../public/photo-thumbnails.js';

assert.equal(thumbnailStorageKey('Progetto 01', 'area-42', 'foto-7'), 'Progetto 01:area-42:foto-7');

console.log('Photo thumbnail storage key regression passed');
