import assert from 'node:assert/strict';
import { canRetryConnection, MAX_RECONNECT_DELAY_MS, reconnectDelay } from '../public/reconnect-policy.js';

assert.equal(reconnectDelay(0), 1000);
assert.equal(reconnectDelay(1), 2000);
assert.equal(reconnectDelay(5), MAX_RECONNECT_DELAY_MS);
assert.equal(reconnectDelay(100), MAX_RECONNECT_DELAY_MS);
assert.equal(canRetryConnection(1006), true);
assert.equal(canRetryConnection(4000), true);
assert.equal(canRetryConnection(4001), false);
assert.equal(canRetryConnection(4003), false);
console.log('Camera reconnect policy regression passed');
