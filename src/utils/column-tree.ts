// ── Дерево колонок: разворачивание иерархии в плоскую сетку шапки ────────────

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
export function flattenColumns(columns: ColumnDef[]): FlattenResult {
	const flatColumns: ColumnDef[] = [];
	const headerGrid: HeaderCell[] = [];
	let maxDepth = 1;

	function walk(nodes: ColumnDef[], depth: number, startCol: number): number {
		if (depth + 1 > maxDepth) maxDepth = depth + 1;

		let col = startCol;

		for (const node of nodes) {
			if (node.children && node.children.length > 0) {
				// Групповая колонка: не листовая, рендерится как объединённая ячейка шапки
				const childStart = col;
				col = walk(node.children, depth + 1, col);
				const span = col - childStart;
				headerGrid.push({
					label: node.label ?? "",
					col: childStart,
					colSpan: span,
					row: depth,
					rowSpan: 1,
					def: node,
				});
			} else {
				// Листовая колонка
				flatColumns.push(node);
				const leafCol = flatColumns.length - 1;
				headerGrid.push({
					label: node.label ?? "",
					col: leafCol,
					colSpan: 1,
					row: depth,
					rowSpan: 1, // будет пересчитан после определения maxDepth
					def: node,
				});
				col++;
			}
		}

		return col;
	}

	walk(columns, 0, 0);

	// Для листовых колонок: rowSpan = сколько строк осталось до низа шапки
	for (const h of headerGrid) {
		if (!h.def?.children && h.colSpan === 1) {
			h.rowSpan = maxDepth - h.row;
		}
	}

	return { flatColumns, headerGrid, maxDepth };
}
