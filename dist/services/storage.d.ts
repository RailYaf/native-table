/** Сохранить состояние таблицы под ключом tableName. */
export declare function saveState(tableName: string, data: Record<string, unknown>): Promise<void>;
/** Загрузить состояние таблицы из IndexedDB. Возвращает undefined при отсутствии. */
export declare function loadState(tableName: string): Promise<Record<string, unknown> | undefined>;
//# sourceMappingURL=storage.d.ts.map