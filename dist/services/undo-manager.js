// ── Undo/Redo менеджер ───────────────────────────────────────────────────────
//
// Хранит стек изменений (пакетами batch), до 100 уровней отмены.
// Поддерживает:
//   - Редактирование ячеек (oldValue ↔ newValue)
//   - Изменение ширины колонок и высоты строк (colWidth/rowHeight)
//   - Массовые операции (batch: заполнение, удаление строк)
export class UndoManager {
    constructor() {
        /** Стек undo: каждый элемент — пакет ChangeRecord[] */
        this.undoStack = [];
        /** Стек redo */
        this.redoStack = [];
        /** Текущий накапливаемый пакет */
        this.batch = [];
    }
    /**
     * Начать запись изменения для ячейки.
     * Возвращает индекс внутри текущего batch для последующего updateNewValue.
     */
    startBatch(row, col, oldValue) {
        const index = this.batch.length;
        this.batch.push({ row, col, oldValue, newValue: null });
        return index;
    }
    /** Обновить newValue в уже созданной записи (вызывается после реального изменения данных). */
    updateNewValue(index, newValue) {
        if (index < this.batch.length)
            this.batch[index].newValue = newValue;
    }
    /** Добавить готовую запись (resize, delete и т.д.). */
    addRecord(rec) {
        this.batch.push(rec);
    }
    /** Зафиксировать накопленный batch в undoStack. Очищает redoStack. */
    commit() {
        if (this.batch.length === 0)
            return;
        this.undoStack.push(this.batch);
        // Ограничиваем историю 100 уровнями
        if (this.undoStack.length > 100)
            this.undoStack.shift();
        this.redoStack = [];
        this.batch = [];
    }
    /**
     * Отменить последнее действие.
     * Перемещает batch в redoStack с инвертированными значениями.
     * Возвращает batch для выполнения отката.
     */
    undo() {
        this.commit();
        const batch = this.undoStack.pop();
        if (!batch)
            return null;
        // При отмене меняем old/new местами и кладём в redo
        this.redoStack.push(batch.map((c) => ({
            row: c.row, col: c.col,
            oldValue: c.newValue, newValue: c.oldValue,
            colWidth: c.colWidth ? { old: c.colWidth.new, new: c.colWidth.old } : undefined,
            rowHeight: c.rowHeight ? { old: c.rowHeight.new, new: c.rowHeight.old } : undefined,
        })));
        return batch;
    }
    /**
     * Вернуть отменённое действие.
     * Перемещает batch обратно в undoStack.
     */
    redo() {
        this.commit();
        const batch = this.redoStack.pop();
        if (!batch)
            return null;
        this.undoStack.push(batch.map((c) => ({
            row: c.row, col: c.col,
            oldValue: c.newValue, newValue: c.oldValue,
            colWidth: c.colWidth ? { old: c.colWidth.new, new: c.colWidth.old } : undefined,
            rowHeight: c.rowHeight ? { old: c.rowHeight.new, new: c.rowHeight.old } : undefined,
        })));
        return batch;
    }
    /** Можно ли отменить? */
    get canUndo() { return this.undoStack.length > 0; }
    /** Можно ли вернуть? */
    get canRedo() { return this.redoStack.length > 0; }
    /** Размер текущего незафиксированного batch. */
    get batchSize() { return this.batch.length; }
    /** Полная очистка истории (после Save или загрузки). */
    clear() { this.undoStack = []; this.redoStack = []; this.batch = []; }
}
//# sourceMappingURL=undo-manager.js.map