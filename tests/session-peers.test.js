import assert from 'node:assert/strict';
import { activePeerCount, CENTRAL_ROLE, MOBILE_ROLE, normalizedRole } from '../session-peers.js';

assert.equal(normalizedRole('controller'), CENTRAL_ROLE);
assert.equal(normalizedRole('controller-mobile'), MOBILE_ROLE);
assert.equal(normalizedRole('unknown'), null);
assert.equal(activePeerCount({ camera: {}, [CENTRAL_ROLE]: {}, [MOBILE_ROLE]: null }), 2);
