import type { ColumnDef, ScalarCellValue } from "./types";
/**
 * Форматирует значение ячейки для отображения:
 * - boolean: "Да" / "Нет"
 * - number: с учётом decimals
 * - select: label вместо value
 * - date: YYYY-MM-DD → DD.MM.YYYY
 */
export declare function formatCellDisplay(value: ScalarCellValue, colDef?: ColumnDef): string;
/**
 * Возвращает текстовое представление значения для поля ввода при редактировании.
 * Для number — очищает NaN, для остальных — приводит к строке.
 */
export declare function getEditValue(value: ScalarCellValue, colDef?: ColumnDef): string;
/**
 * Возвращает выравнивание ячейки:
 * 1) Явно заданное в ColumnDef.align
 * 2) По умолчанию на основе типа: number → right, boolean → center, остальные → left.
 */
export declare function getCellAlign(colDef?: ColumnDef): "left" | "center" | "right";
/** Проверяет, заблокирована ли колонка для редактирования. */
export declare function isReadOnly(colDef?: ColumnDef): boolean;
/** Проверяет, является ли тип колонки boolean. */
export declare function isBoolean(colDef?: ColumnDef): boolean;
//# sourceMappingURL=column-utils.d.ts.map