const DB_NAME = 'remote-camera-photo-queue';
const STORE_NAME = 'photos';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (!store.indexNames.contains('room')) store.createIndex('room', 'room');
      if (!store.indexNames.contains('project')) store.createIndex('project', 'project');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = action(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

export function createQueuedPhoto(input) {
  if (!input?.id || !input.room || !input.project || !input.area || !(input.blob instanceof Blob)) {
    throw new Error('Dati foto locale non validi.');
  }
  return {
    id: String(input.id), room: String(input.room), project: String(input.project), area: String(input.area),
    blob: input.blob, createdAt: String(input.createdAt || new Date().toISOString()),
    width: Number(input.width) || 0, height: Number(input.height) || 0, size: input.blob.size
  };
}

export function queuePhoto(record) { return transaction('readwrite', store => store.put(record)); }
export function deleteQueuedPhoto(id) { return transaction('readwrite', store => store.delete(id)); }
export function listQueuedPhotos(room) { return transaction('readonly', store => store.index('room').getAll(room)); }
export function listQueuedPhotosForProject(project) { return transaction('readonly', store => store.index('project').getAll(project)); }

export function queuedPhotoSummary(records) {
  return {
    count: records.length,
    bytes: records.reduce((total, record) => total + (Number(record?.size) || Number(record?.blob?.size) || 0), 0)
  };
}
