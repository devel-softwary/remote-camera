const DATABASE_NAME = 'remote-camera-layers';
const STORE_NAME = 'layers';
let databasePromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Operazione IndexedDB non riuscita.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Salvataggio layer non riuscito.'));
    transaction.onabort = () => reject(transaction.error || new Error('Salvataggio layer annullato.'));
  });
}

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'project' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Archivio layer non disponibile.'));
    });
  }
  return databasePromise;
}

export function createLayerRecord(project, file) {
  return { project, name: file.name, type: file.type, size: file.size, blob: file, updatedAt: Date.now() };
}

export async function saveLayerFile(project, file) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).put(createLayerRecord(project, file));
  await transactionDone(transaction);
}

export async function loadLayerFile(project) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  return requestResult(transaction.objectStore(STORE_NAME).get(project));
}

export async function deleteLayerFile(project) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).delete(project);
  await transactionDone(transaction);
}

export async function moveLayerFile(currentProject, nextProject) {
  const record = await loadLayerFile(currentProject);
  if (!record) return;
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  store.put({ ...record, project: nextProject });
  store.delete(currentProject);
  await transactionDone(transaction);
}
