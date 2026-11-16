export function createAsyncTaskQueue(worker, { concurrency = 1, onChange = () => {} } = {}) {
  if (typeof worker !== 'function') throw new TypeError('Worker non valido.');
  const limit = Math.max(1, Math.floor(Number(concurrency) || 1));
  const pending = [];
  let running = 0;

  function state() { return { pending: pending.length, running, total: pending.length + running }; }
  function notify() { onChange(state()); }

  function drain() {
    while (running < limit && pending.length) {
      const entry = pending.shift();
      running += 1;
      notify();
      Promise.resolve()
        .then(() => worker(entry.task))
        .then(result => complete(entry, 'resolve', result), error => complete(entry, 'reject', error));
    }
  }

  function complete(entry, method, value) {
    try {
      running -= 1;
      notify();
      drain();
    } finally {
      entry[method](value);
    }
  }

  function enqueue(task) {
    const promise = new Promise((resolve, reject) => pending.push({ task, resolve, reject }));
    notify();
    drain();
    return promise;
  }

  return { enqueue, state };
}
