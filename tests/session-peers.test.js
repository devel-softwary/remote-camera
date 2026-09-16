import assert from 'node:assert/strict';
import { activePeerCount, CAMERA_ROLE, CENTRAL_ROLE, MOBILE_ROLE, normalizedRole, signalTargetRole } from '../session-peers.js';

assert.equal(normalizedRole('controller'), CENTRAL_ROLE);
assert.equal(normalizedRole('controller-mobile'), MOBILE_ROLE);
assert.equal(normalizedRole('unknown'), null);
assert.equal(activePeerCount({ camera: {}, [CENTRAL_ROLE]: {}, [MOBILE_ROLE]: null }), 2);
assert.equal(signalTargetRole(CAMERA_ROLE), CENTRAL_ROLE);
assert.equal(signalTargetRole(CAMERA_ROLE, MOBILE_ROLE), MOBILE_ROLE);
assert.equal(signalTargetRole(CAMERA_ROLE, 'invalid'), null);
