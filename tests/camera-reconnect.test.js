import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canRetryConnection, reconnectDelay } from '../public/reconnect-policy.js';

const source = readFileSync(new URL('../public/camera.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
const init = new Function('document', 'window', 'navigator', 'localStorage', 'loadConfig', 'wsUrl', 'queryParam', 'setStatus', 'formatBytes', 'WebSocket', 'RTCPeerConnection', 'setTimeout', 'clearTimeout', 'canRetryConnection', 'reconnectDelay', 'normalizeCameraControls', source + '\nreturn { start };');

const elements = new Map();
const document = {
  querySelector(id) {
    if (!elements.has(id)) elements.set(id, { classList: { add() {}, remove() {} }, replaceChildren() {}, append() {}, addEventListener() {}, play: async () => {} });
    return elements.get(id);
  },
  createElement: () => ({})
};
const track = { label: 'back', readyState: 'live', getSettings: () => ({ deviceId: 'back', width: 1920, height: 1080 }), getCapabilities: () => ({}), stop() { this.readyState = 'ended'; } };
const navigator = { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }), enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'back', label: 'back' }] } };
const sockets = [];
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  constructor() { this.readyState = FakeWebSocket.CONNECTING; sockets.push(this); }
  send() {}
  close() {}
}
const peers = [];
class FakePeer {
  constructor() { this.closed = false; peers.push(this); }
  addTrack() { return {}; }
  createDataChannel() { return { readyState: 'open', send() {} }; }
  close() { this.closed = true; }
}
const timers = [];
const setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
const api = init(document, { isSecureContext: true }, navigator, { getItem: () => '' }, async () => ({ iceServers: [] }), () => 'wss://test', name => name === 'room' ? 'room' : 'token', () => {}, () => '', FakeWebSocket, FakePeer, setTimeout, () => {}, canRetryConnection, reconnectDelay, () => ({ zoom: null, torch: false, focusModes: [], focusDistance: null, pointsOfInterest: false, flashModes: [] }));

await api.start();
assert.equal(sockets.length, 1);
sockets[0].onclose({ code: 1006 });
assert.equal(timers[0].delay, 1000);
timers[0].callback();
assert.equal(sockets.length, 2);
assert.equal(peers[0].closed, true);
assert.equal(track.readyState, 'live', 'lo stream locale deve restare aperto');
sockets[1].onclose({ code: 4003 });
assert.equal(timers.length, 1, 'un token non valido non deve creare loop');
console.log('Camera automatic reconnect regression passed');
