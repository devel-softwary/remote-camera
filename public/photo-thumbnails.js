const DB_NAME = 'remote-camera-thumbnails';
const STORE_NAME = 'thumbnails';

export function thumbnailStorageKey(project, areaId, photoId) {
  return `${project}:${areaId}:${photoId}`;
}

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runTransaction(mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

export function saveThumbnail(key, blob) {
  return runTransaction('readwrite', store => store.put(blob, key));
}

export function loadThumbnail(key) {
  return runTransaction('readonly', store => store.get(key));
}

export async function createThumbnail(source, maxSide = 320) {
  const image = await createImage(source);
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Miniatura non valida.')), 'image/jpeg', 0.82));
}

async function createImage(blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Impossibile creare la miniatura.'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
