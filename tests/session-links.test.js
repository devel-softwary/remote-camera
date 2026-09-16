import assert from 'node:assert/strict';
import { cameraSessionLink, mobileControllerSessionLink } from '../public/session-links.js';

assert.equal(
  cameraSessionLink('https://example.test/app/', 'AB C', 'a&b'),
  'https://example.test/camera.html?room=AB+C&token=a%26b'
);
assert.equal(
  mobileControllerSessionLink('https://example.test', 'ROOM01', 'token'),
  'https://example.test/mobile-controller.html?room=ROOM01&token=token'
);

console.log('Session sharing links regression passed');
