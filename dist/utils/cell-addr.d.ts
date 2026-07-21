import type { CellCoord } from "./types";
/**
 * Преобразует индекс колонки (0-based) в буквенное обозначение (A, B, ..., Z, AA, AB, ...).
 * Пример: 0 → "A", 25 → "Z", 26 → "AA".
 */
export declare function colToLetter(col: number): string;
/**
 * Преобразует буквенное обозначение колонки обратно в индекс (0-based).
 * Пример: "A" → 0, "Z" → 25, "AA" → 26.
 */
export declare function letterToCol(letter: string): number;
/**
 * Формирует ключ ячейки в формате A1 (колонка + строка).
 * Пример: cellKey(0, 0) → "A1".
 */
export declare function cellKey(row: number, col: number): string;
/**
 * Разбирает ключ A1 обратно в координаты.
 * Пример: parseCellKey("B3") → { row: 2, col: 1 }.
 * Возвращает null при некорректном формате.
 */
export declare function parseCellKey(key: string): CellCoord | null;
//# sourceMappingURL=cell-addr.d.ts.map