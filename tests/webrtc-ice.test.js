import assert from 'node:assert/strict';
import { addRemoteIceCandidate, flushRemoteIceCandidates, webRtcFailureMessage } from '../public/webrtc-ice.js';

const added = [];
const peer = { remoteDescription: null, addIceCandidate: async candidate => added.push(candidate) };
const pending = [];

await addRemoteIceCandidate(peer, pending, { candidate: 'early' });
assert.deepEqual(added, []);
assert.deepEqual(pending, [{ candidate: 'early' }]);

peer.remoteDescription = { type: 'offer' };
await flushRemoteIceCandidates(peer, pending);
await addRemoteIceCandidate(peer, pending, { candidate: 'late' });
assert.deepEqual(added, [{ candidate: 'early' }, { candidate: 'late' }]);
assert.deepEqual(pending, []);
assert.match(webRtcFailureMessage('failed'), /TURN/);

console.log('ICE candidate queue regression passed');
