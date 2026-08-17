import type { SelectionRect } from "./types";

/**
 * Нормализует прямоугольник выделения:
 * приводит start/end к единому порядку (topRow ≤ bottomRow, leftCol ≤ rightCol).
 * Возвращает null, если выделение не задано.
 */
export function normRect(rect: SelectionRect): {
	topRow: number;
	bottomRow: number;
	leftCol: number;
	rightCol: number;
} | null {
	if (!rect.start || !rect.end) {
		return null;
	}
	return {
		topRow: Math.min(rect.start.row, rect.end.row),
		bottomRow: Math.max(rect.start.row, rect.end.row),
		leftCol: Math.min(rect.start.col, rect.end.col),
		rightCol: Math.max(rect.start.col, rect.end.col),
	};
}
