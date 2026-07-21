import { cellKey } from "../utils/cell-addr";
// ── Модель данных таблицы ────────────────────────────────────────────────────
//
// Хранит все данные в Map<string, Cell> с ключами формата "A1", "B2" и т.д.
// Отсутствующие ячейки считаются пустыми (value: null).
// Поддерживает вставку и удаление строк со сдвигом данных.
export class SheetModel {
    constructor(initial) {
        /** Хранилище ячеек: ключ формата "A1" → ячейка */
        this.cells = new Map();
        if (initial) {
            for (const [key, cell] of Object.entries(initial)) {
                this.cells.set(key, { ...cell });
            }
        }
    }
    /** Получить ячейку по координатам. Если не найдена — возвращает пустую. */
    get(row, col) {
        return this.cells.get(cellKey(row, col)) ?? { value: null };
    }
    /** Получить ячейку по готовому ключу (например "A1"). */
    getByKey(key) {
        return this.cells.get(key);
    }
    /** Записать ячейку без вызова onChange (для массовых операций). */
    setSilent(row, col, cell) {
        this.cells.set(cellKey(row, col), { ...cell });
    }
    /** То же — по готовому ключу. */
    setSilentByKey(key, cell) {
        this.cells.set(key, { ...cell });
    }
    /** Получить сырое значение (или null). */
    getValue(row, col) {
        return this.cells.get(cellKey(row, col))?.value ?? null;
    }
    /** Снимок всех непустых ячеек (копия). */
    getAll() {
        const result = {};
        for (const [key, cell] of this.cells) {
            result[key] = { ...cell };
        }
        return result;
    }
    /**
     * Установить значение после парсинга пользовательского ввода.
     * Пустая строка — удалить ячейку. Вызывает onChange.
     */
    set(row, col, raw) {
        const key = cellKey(row, col);
        if (raw === "")
            this.cells.delete(key);
        else
            this.cells.set(key, { value: parseLiteral(raw) });
        this.emit();
    }
    /** Удалить ячейку без вызова onChange. */
    deleteSilent(row, col) {
        this.cells.delete(cellKey(row, col));
    }
    /** Вставить пустую строку на позицию row, сдвинув данные вниз. */
    insertRowAt(row) {
        const toShift = [];
        for (const [key, cell] of this.cells) {
            const match = key.match(/^([A-Z]+)(\d+)$/);
            if (match) {
                const r = Number(match[2]) - 1;
                if (r >= row) {
                    toShift.push({ fromKey: key, cell: { ...cell } });
                }
            }
        }
        for (const { fromKey } of toShift) {
            this.cells.delete(fromKey);
        }
        for (const { fromKey, cell } of toShift) {
            const match = fromKey.match(/^([A-Z]+)(\d+)$/);
            if (match) {
                const col = match[1];
                const r = Number(match[2]) - 1;
                const newKey = `${col}${r + 2}`;
                this.cells.set(newKey, cell);
            }
        }
        this.emit();
    }
    /** Удалить строки [from, to] включительно, сдвинув данные вверх. */
    deleteRows(from, to) {
        const count = to - from + 1;
        const toDelete = new Set();
        const toShift = [];
        for (const [key, cell] of this.cells) {
            const match = key.match(/^([A-Z]+)(\d+)$/);
            if (match) {
                const r = Number(match[2]) - 1;
                if (r >= from && r <= to) {
                    toDelete.add(key);
                }
                else if (r > to) {
                    toShift.push({ fromKey: key, cell: { ...cell } });
                }
            }
        }
        for (const key of toDelete)
            this.cells.delete(key);
        for (const { fromKey } of toShift)
            this.cells.delete(fromKey);
        for (const { fromKey, cell } of toShift) {
            const match = fromKey.match(/^([A-Z]+)(\d+)$/);
            if (match) {
                const col = match[1];
                const r = Number(match[2]) - 1;
                const newKey = `${col}${r - count + 1}`;
                this.cells.set(newKey, cell);
            }
        }
        this.emit();
    }
    emit() {
        this.onChange?.(this.getAll());
    }
}
// ── Парсинг литералов ────────────────────────────────────────────────────────
//
// "42"     → 42  (number)
// "true"   → true
// "false"  → false
// "hello"  → "hello"
// ""       → null
function parseLiteral(input) {
    const trimmed = input.trim();
    if (trimmed === "") {
        return null;
    }
    const num = Number(trimmed);
    if (!Number.isNaN(num) && trimmed !== "") {
        return num;
    }
    if (trimmed.toLowerCase() === "true") {
        return true;
    }
    if (trimmed.toLowerCase() === "false") {
        return false;
    }
    return trimmed;
}
//# sourceMappingURL=model.js.map