import type { CellCoord } from "./types";

// ── Адресация ячеек (A1-стиль) ───────────────────────────────────────────────

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Преобразует индекс колонки (0-based) в буквенное обозначение (A, B, ..., Z, AA, AB, ...).
 * Пример: 0 → "A", 25 → "Z", 26 → "AA".
 */
export function colToLetter(col: number): string {
	let letter = "";
	let n = col;
	while (n >= 0) {
		letter = LETTERS[n % 26] + letter;
		n = Math.floor(n / 26) - 1;
	}
	return letter;
}

/**
 * Преобразует буквенное обозначение колонки обратно в индекс (0-based).
 * Пример: "A" → 0, "Z" → 25, "AA" → 26.
 */
export function letterToCol(letter: string): number {
	let col = 0;
	for (let i = 0; i < letter.length; i++) {
		col = col * 26 + (letter.charCodeAt(i) - "A".charCodeAt(0) + 1);
	}
	return col - 1;
}

/**
 * Формирует ключ ячейки в формате A1 (колонка + строка).
 * Пример: cellKey(0, 0) → "A1".
 */
export function cellKey(row: number, col: number): string {
	return `${colToLetter(col)}${row + 1}`;
}

/**
 * Разбирает ключ A1 обратно в координаты.
 * Пример: parseCellKey("B3") → { row: 2, col: 1 }.
 * Возвращает null при некорректном формате.
 */
export function parseCellKey(key: string): CellCoord | null {
	const match = key.match(/^([A-Z]+)(\d+)$/);
	if (!match) {
		return null;
	}
	return { row: Number(match[2]) - 1, col: letterToCol(match[1]) };
}
