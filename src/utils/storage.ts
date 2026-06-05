import type { Document } from '../types';

const DB_NAME = 'pyrotechnics_db';
const DB_VERSION = 1;
const STORE_NAME = 'documents';
const AUTOSAVE_KEY = 'autosave';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function saveDocument(doc: Document): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(doc, AUTOSAVE_KEY);

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject((event.target as IDBRequest).error);
    tx.oncomplete = () => db.close();
  });
}

export async function loadDocument(): Promise<Document | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(AUTOSAVE_KEY);

    request.onsuccess = (event) => {
      const result = (event.target as IDBRequest<Document | undefined>).result;
      resolve(result ?? null);
    };
    request.onerror = (event) => reject((event.target as IDBRequest).error);
    tx.oncomplete = () => db.close();
  });
}

export async function clearDocument(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(AUTOSAVE_KEY);

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject((event.target as IDBRequest).error);
    tx.oncomplete = () => db.close();
  });
}
