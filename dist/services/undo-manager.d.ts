/** Одна запись изменения (одна ячейка или один resize). */
export interface ChangeRecord {
    row: number;
    col: number;
    oldValue: import("../utils/types").Cell | null;
    newValue: import("../utils/types").Cell | null;
    /** Если задано — изменение ширины колонки */
    colWidth?: {
        old: number;
        new: number;
    };
    /** Если задано — изменение высоты строки */
    rowHeight?: {
        old: number;
        new: number;
    };
}
export declare class UndoManager {
    /** Стек undo: каждый элемент — пакет ChangeRecord[] */
    private undoStack;
    /** Стек redo */
    private redoStack;
    /** Текущий накапливаемый пакет */
    private batch;
    /**
     * Начать запись изменения для ячейки.
     * Возвращает индекс внутри текущего batch для последующего updateNewValue.
     */
    startBatch(row: number, col: number, oldValue: import("../utils/types").Cell | null): number;
    /** Обновить newValue в уже созданной записи (вызывается после реального изменения данных). */
    updateNewValue(index: number, newValue: import("../utils/types").Cell | null): void;
    /** Добавить готовую запись (resize, delete и т.д.). */
    addRecord(rec: ChangeRecord): void;
    /** Зафиксировать накопленный batch в undoStack. Очищает redoStack. */
    commit(): void;
    /**
     * Отменить последнее действие.
     * Перемещает batch в redoStack с инвертированными значениями.
     * Возвращает batch для выполнения отката.
     */
    undo(): ChangeRecord[] | null;
    /**
     * Вернуть отменённое действие.
     * Перемещает batch обратно в undoStack.
     */
    redo(): ChangeRecord[] | null;
    /** Можно ли отменить? */
    get canUndo(): boolean;
    /** Можно ли вернуть? */
    get canRedo(): boolean;
    /** Размер текущего незафиксированного batch. */
    get batchSize(): number;
    /** Полная очистка истории (после Save или загрузки). */
    clear(): void;
}
//# sourceMappingURL=undo-manager.d.ts.map