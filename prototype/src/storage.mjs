/** Browser-only sandbox adapter. Not a production backend, and never public publishing. */
const DB = 'scene-prototype-v1';
const DB_VERSION = 2; // preserve v1 works/takes while adding private per-scene selections
function openDB() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('このブラウザはIndexedDBを利用できません'));
    const request = indexedDB.open(DB, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('works')) db.createObjectStore('works', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('takes')) db.createObjectStore('takes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('selections')) db.createObjectStore('selections', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction(store, mode, op) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      let result;
      const tx = db.transaction(store, mode);
      const req = op(tx.objectStore(store));
      req.onsuccess = () => { result = req.result; };
      req.onerror = () => reject(req.error);
      // Request success != durable transaction commit. Only report saved after oncomplete.
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('保存処理が失敗しました'));
      tx.onabort = () => reject(tx.error || new Error('保存が中断されました'));
    });
  } finally { db.close(); }
}
export const localRepository = Object.freeze({
  listWorks: () => transaction('works', 'readonly', store => store.getAll()),
  saveWork: work => transaction('works', 'readwrite', store => store.put(structuredClone(work))),
  loadWork: id => transaction('works', 'readonly', store => store.get(id)),
  listTakes: () => transaction('takes', 'readonly', store => store.getAll()),
  saveTake: take => transaction('takes', 'readwrite', store => store.put(take)),
  clearTake: id => transaction('takes', 'readwrite', store => store.delete(id)),
  listSelections: () => transaction('selections', 'readonly', store => store.getAll()),
  saveSelection: entry => transaction('selections', 'readwrite', store => store.put(structuredClone(entry))),
  clearSelection: key => transaction('selections', 'readwrite', store => store.delete(key)),
});

/** Resize high-resolution user images for the prototype; keep aspect ratio. */
export async function optimizeImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPEG / PNG / WebP形式の静止画像を選んでください');
  if (file.size > 16 * 1024 * 1024) throw new Error('この体験版では16MB以下の画像を選んでください');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1700 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像処理に失敗しました');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/webp', 0.85);
    if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', 0.88);
    return data;
  } finally { bitmap.close(); }
}
