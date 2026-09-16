import assert from 'node:assert/strict';
import fs from 'node:fs';

const compose = fs.readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');

assert.match(compose, /user: "\$\{PUID:-1000\}:\$\{PGID:-1000\}"/);

console.log('Docker host ownership regression passed');
