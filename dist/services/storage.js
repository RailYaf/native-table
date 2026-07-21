// ── IndexedDB-хранилище состояния таблицы ────────────────────────────────────
//
// База: "nt-storage" v1, store "state".
// Ключ: tableName (проп компонента).
// Данные: { widths?: Record<string, number>, heights?: number[], styles?: Record<string, CellStyle> }
const DB_NAME = "nt-storage";
const DB_VERSION = 1;
const STORE = "state";
/** Открыть (или создать) базу данных. */
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
/** Сохранить состояние таблицы под ключом tableName. */
export async function saveState(tableName, data) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(data, tableName);
        await new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }
    catch (_) { } // Тихо игнорируем ошибки (недоступен IndexedDB)
}
/** Загрузить состояние таблицы из IndexedDB. Возвращает undefined при отсутствии. */
export async function loadState(tableName) {
    try {
        const db = await openDB();
        const result = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readonly");
            const req = tx.objectStore(STORE).get(tableName);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return result;
    }
    catch (_) {
        return undefined;
    }
}
//# sourceMappingURL=storage.js.map