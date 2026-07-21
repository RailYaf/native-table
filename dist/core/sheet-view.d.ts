import type { SheetModel } from "./model";
import type { Cell } from "../utils/types";
export type SortDirection = "asc" | "desc" | "none";
/** Одна запись в стеке сортировки. */
export interface SortEntry {
    col: number;
    asc: boolean;
}
/** Операции фильтра. */
export type FilterOp = "values" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "between";
/** Фильтр для одной колонки. */
export interface ColumnFilter {
    op: FilterOp;
    /** Выбранные значения (для op="values") */
    values?: Set<string>;
    /** Значение сравнения */
    value?: string;
    /** Второе значение (для between) */
    value2?: string;
}
export declare class SheetView {
    private model;
    private _totalRows;
    /** Стек сортировки: первый элемент — первичная сортировка. */
    sortStack: SortEntry[];
    /** Фильтры по колонкам. */
    filters: Map<number, ColumnFilter>;
    /** displayRow → dataRow (перестраивается при изменении sort/filter). */
    rowMap: number[];
    constructor(model: SheetModel, totalRows: number);
    /** Заменить модель (данные). Сортировка/фильтр не сбрасываются. */
    setModel(model: SheetModel): void;
    /**
     * Обновить общее количество строк (при авто-расширении).
     * Перестраивает rowMap с новым лимитом.
     */
    setTotalRows(n: number): void;
    /** Количество строк после фильтрации. */
    get totalRows(): number;
    /** Преобразовать displayRow в индекс исходной строки данных. */
    dataRow(displayRow: number): number;
    /** Получить ячейку через маппинг display → data. */
    get(displayRow: number, col: number): Cell;
    /** Все уникальные значения колонки (для UI фильтра по значениям). */
    getUniqueValues(col: number): string[];
    /**
     * Установить сортировку для колонки.
     * "none" — убрать из стека, "asc"/"desc" — добавить/обновить.
     */
    setSort(col: number, direction: SortDirection): void;
    /** Установить или убрать фильтр для колонки. */
    setFilter(col: number, filter: ColumnFilter | null): void;
    /** Сбросить и сортировку, и фильтр для колонки. */
    clearColumn(col: number): void;
    /**
     * Перестроить rowMap:
     * 1. Применить все фильтры (matching строки проходят, остальные — в конец)
     * 2. Отсортировать matching по sortStack
     * 3. Объединить: matching + nonMatching
     */
    private rebuild;
}
//# sourceMappingURL=sheet-view.d.ts.map