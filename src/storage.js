const DB_NAME = "hydrocheck-ph-free-v3";
const STORE_NAME = "kv";
const STATE_KEY = "state";

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = callback(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadState(defaultState, mergeState) {
  try {
    const saved = await withStore("readonly", (store) => store.get(STATE_KEY));
    return saved ? mergeState(defaultState, saved) : defaultState;
  } catch {
    const raw = localStorage.getItem(DB_NAME);
    return raw ? mergeState(defaultState, JSON.parse(raw)) : defaultState;
  }
}

export async function saveState(state) {
  const stamped = { ...state, updatedAt: new Date().toISOString() };
  try {
    await withStore("readwrite", (store) => store.put(stamped, STATE_KEY));
  } catch {
    localStorage.setItem(DB_NAME, JSON.stringify(stamped));
  }
}

export async function clearState() {
  try {
    await withStore("readwrite", (store) => store.delete(STATE_KEY));
  } catch {
    localStorage.removeItem(DB_NAME);
  }
}
