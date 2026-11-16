import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAsyncTaskQueue } from '../public/async-task-queue.js';

let releaseFirst;
const started = [];
const queue = createAsyncTaskQueue(async task => {
  started.push(task);
  if (task === 'first') await new Promise(resolve => { releaseFirst = resolve; });
  if (task === 'broken') throw new Error('upload failed');
  return task;
});

const first = queue.enqueue('first');
const second = queue.enqueue('second');
await Promise.resolve();
assert.deepEqual(started, ['first']);
assert.deepEqual(queue.state(), { pending: 1, running: 1, total: 2 });
releaseFirst();
assert.equal(await first, 'first');
await Promise.resolve();
assert.equal(await second, 'second');
assert.deepEqual(queue.state(), { pending: 0, running: 0, total: 0 });

await assert.rejects(queue.enqueue('broken'), /upload failed/);
assert.equal(await queue.enqueue('after-error'), 'after-error');

const controllerSource = await readFile(new URL('../public/controller.js', import.meta.url), 'utf8');
assert.match(controllerSource, /clearCaptureRequest\(\);\s*uploadingAreaCounts\.set[\s\S]*photoServerQueue\.enqueue/);
assert.doesNotMatch(controllerSource, /isCurrentCapture\(captureRequestId, meta\.requestId\)/);

console.log('Async photo upload queue regression passed');
