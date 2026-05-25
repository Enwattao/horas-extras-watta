const DB_NAME = 'horasextras';
const DB_VERSION = 1;

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('operarios')) {
        db.createObjectStore('operarios', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('montajes')) {
        db.createObjectStore('montajes', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('registros')) {
        const s = db.createObjectStore('registros', { keyPath: 'id', autoIncrement: true });
        s.createIndex('fecha', 'fecha', { unique: false });
        s.createIndex('operario_id', 'operario_id', { unique: false });
        s.createIndex('montaje_id', 'montaje_id', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return abrirDB().then(db => {
    const t = db.transaction(store, mode);
    return t.objectStore(store);
  });
}

function promReq(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

// OPERARIOS
export async function getOperarios() {
  const s = await tx('operarios');
  return promReq(s.getAll());
}
export async function addOperario(data) {
  const s = await tx('operarios', 'readwrite');
  return promReq(s.add(data));
}
export async function updateOperario(data) {
  const s = await tx('operarios', 'readwrite');
  return promReq(s.put(data));
}
export async function deleteOperario(id) {
  const s = await tx('operarios', 'readwrite');
  return promReq(s.delete(id));
}

// MONTAJES
export async function getMontajes() {
  const s = await tx('montajes');
  return promReq(s.getAll());
}
export async function addMontaje(data) {
  const s = await tx('montajes', 'readwrite');
  return promReq(s.add(data));
}
export async function updateMontaje(data) {
  const s = await tx('montajes', 'readwrite');
  return promReq(s.put(data));
}
export async function deleteMontaje(id) {
  const s = await tx('montajes', 'readwrite');
  return promReq(s.delete(id));
}

// REGISTROS
export async function getRegistros() {
  const s = await tx('registros');
  return promReq(s.getAll());
}
export async function addRegistro(data) {
  const s = await tx('registros', 'readwrite');
  return promReq(s.add({ ...data, created_at: new Date().toISOString() }));
}
export async function updateRegistro(data) {
  const s = await tx('registros', 'readwrite');
  return promReq(s.put(data));
}
export async function deleteRegistro(id) {
  const s = await tx('registros', 'readwrite');
  return promReq(s.delete(id));
}
