import type { Cell, ScalarCellValue } from "../utils/types";
export declare class SheetModel {
    /** Хранилище ячеек: ключ формата "A1" → ячейка */
    private cells;
    /** Колбэк, вызываемый при каждом изменении данных (для IndexedDB). */
    onChange?: (_cells: Record<string, Cell>) => void;
    constructor(initial?: Record<string, Cell>);
    /** Получить ячейку по координатам. Если не найдена — возвращает пустую. */
    get(row: number, col: number): Cell;
    /** Получить ячейку по готовому ключу (например "A1"). */
    getByKey(key: string): Cell | undefined;
    /** Записать ячейку без вызова onChange (для массовых операций). */
    setSilent(row: number, col: number, cell: Cell): void;
    /** То же — по готовому ключу. */
    setSilentByKey(key: string, cell: Cell): void;
    /** Получить сырое значение (или null). */
    getValue(row: number, col: number): ScalarCellValue;
    /** Снимок всех непустых ячеек (копия). */
    getAll(): Record<string, Cell>;
    /**
     * Установить значение после парсинга пользовательского ввода.
     * Пустая строка — удалить ячейку. Вызывает onChange.
     */
    set(row: number, col: number, raw: string): void;
    /** Удалить ячейку без вызова onChange. */
    deleteSilent(row: number, col: number): void;
    /** Вставить пустую строку на позицию row, сдвинув данные вниз. */
    insertRowAt(row: number): void;
    /** Удалить строки [from, to] включительно, сдвинув данные вверх. */
    deleteRows(from: number, to: number): void;
    private emit;
}
//# sourceMappingURL=model.d.ts.map