import type { ColumnDef } from "./types";
/** Одна ячейка многоручной шапки. */
export interface HeaderCell {
    /** Текст заголовка */
    label: string;
    /** Индекс листовой колонки, с которой начинается (0-based) */
    col: number;
    /** Сколько листовых колонок объединяет (colSpan) */
    colSpan: number;
    /** Уровень (строка) в шапке: 0 = верхний */
    row: number;
    /** Сколько строк объединяет по вертикали (rowSpan). 1 = одна строка. */
    rowSpan: number;
    /** Оригинальный ColumnDef (для доступа к свойствам) */
    def?: ColumnDef;
}
export interface FlattenResult {
    /** Листовые колонки (столько же, сколько data-колонок) */
    flatColumns: ColumnDef[];
    /** Сетка шапки: row × col */
    headerGrid: HeaderCell[];
    /** Максимальная глубина (количество уровней шапки) */
    maxDepth: number;
}
/**
 * Развернуть иерархическое дерево колонок в плоский список листовых колонок
 * и сетку ячеек шапки с colSpan.
 */
export declare function flattenColumns(columns: ColumnDef[]): FlattenResult;
//# sourceMappingURL=column-tree.d.ts.map