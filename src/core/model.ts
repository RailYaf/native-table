import { cellKey, parseCellKey } from "../utils/cell-addr";
import type { Cell, ChangeAction, ScalarCellValue } from "../utils/types";

// ── Модель данных таблицы ────────────────────────────────────────────────────
//
// Хранит все данные в Map<string, Cell> с ключами формата "A1", "B2" и т.д.
// Отсутствующие ячейки считаются пустыми (value: null).
// Поддерживает вставку и удаление строк со сдвигом данных.

export class SheetModel {
	/** Хранилище ячеек: ключ формата "A1" → ячейка */
	private cells = new Map<string, Cell>();

	/** Колбэк, вызываемый при каждом изменении данных. */
	onChange?: (
		allCells: Record<string, Cell>,
		changedCells: Record<string, { old: Cell | null; new: Cell | null }>,
		action?: ChangeAction,
	) => void;

	constructor(initial?: Record<string, Cell>) {
		if (initial) {
			for (const [key, cell] of Object.entries(initial)) {
				this.cells.set(key, { ...cell });
			}
		}
	}

	/** Получить ячейку по координатам. Если не найдена — возвращает пустую. */
	get(row: number, col: number): Cell {
		return this.cells.get(cellKey(row, col)) ?? { value: null };
	}

	/** Получить ячейку по готовому ключу (например "A1"). */
	getByKey(key: string): Cell | undefined {
		return this.cells.get(key);
	}

	/** Пуста ли ячейка (нет значения). */
	isEmpty(row: number, col: number): boolean {
		const v = this.cells.get(cellKey(row, col))?.value;
		return v === null || v === undefined;
	}

	/** Записать ячейку без вызова onChange (для массовых операций). */
	setSilent(row: number, col: number, cell: Cell): void {
		this.cells.set(cellKey(row, col), { ...cell });
	}

	/** То же — по готовому ключу. */
	setSilentByKey(key: string, cell: Cell): void {
		this.cells.set(key, { ...cell });
	}

	/** Снимок всех непустых ячеек (копия). */
	getAll(): Record<string, Cell> {
		const result: Record<string, Cell> = {};
		for (const [key, cell] of this.cells) {
			result[key] = { ...cell };
		}
		return result;
	}

	/**
	 * Установить значение после парсинга пользовательского ввода.
	 * Пустая строка — удалить ячейку. Стиль сохраняется, кэш display сбрасывается.
	 * onChange не вызывается — вызывающий код сам решает, когда эмитить событие.
	 */
	set(row: number, col: number, raw: string, colType?: string): void {
		const key = cellKey(row, col);
		if (raw === "") {
			this.cells.delete(key);
			return;
		}
		const next: Cell = { value: parseLiteral(raw, colType) };
		this.cells.set(key, next);
	}

	/** Удалить ячейку без вызова onChange. */
	deleteSilent(row: number, col: number): void {
		this.cells.delete(cellKey(row, col));
	}

	/** Вставить пустую строку на позицию row, сдвинув данные вниз. */
	insertRowAt(row: number): void {
		this.shiftRows((r) => (r >= row ? r + 1 : r), () => false);
	}

	/**
	 * Удалить произвольный набор строк со сдвигом остальных вверх.
	 * Нужен при активной сортировке: выделенные подряд строки на экране
	 * соответствуют несмежным строкам данных.
	 */
	deleteRowSet(rows: Set<number>): void {
		if (rows.size === 0) return;
		const sorted = Array.from(rows).sort((a, b) => a - b);
		this.shiftRows(
			(r) => r - sorted.filter((deleted) => deleted < r).length,
			(r) => rows.has(r),
		);
	}

	/**
	 * Перестроить хранилище: строки, для которых remove() === true, удаляются,
	 * остальные переезжают на строку mapRow(row).
	 */
	private shiftRows(mapRow: (_row: number) => number, remove: (_row: number) => boolean): void {
		const next = new Map<string, Cell>();
		for (const [key, cell] of this.cells) {
			const coord = parseCellKey(key);
			if (!coord) {
				next.set(key, cell);
				continue;
			}
			if (remove(coord.row)) continue;
			next.set(cellKey(mapRow(coord.row), coord.col), cell);
		}
		this.cells = next;
	}

	emit(
		action: ChangeAction = "edit",
		changedCells?: Record<string, { old: Cell | null; new: Cell | null }>,
	): void {
		this.onChange?.(this.getAll(), changedCells ?? {}, action);
	}
}

// ── Парсинг литералов ────────────────────────────────────────────────────────
//
// Колонка с типом number  → число (или исходная строка, если не парсится)
// Колонка с типом boolean → true/false
// Колонка text/select/date/datetime → строка как есть (без «магического» приведения:
//   в текстовой колонке "true" должно остаться текстом)
// Колонка без типа (режим A, B, C…) → авто-определение числа и boolean

function parseLiteral(input: string, colType?: string): ScalarCellValue {
	const trimmed = input.trim();
	if (trimmed === "") return null;

	if (colType === "number") {
		const num = Number(trimmed);
		return Number.isNaN(num) ? trimmed : num;
	}

	if (colType === "array") {
		if (trimmed === "[]" || trimmed === "") return [];
		return trimmed.split(",").map((s) => s.trim()).filter((s) => s !== "");
	}

	if (colType === "json") {
		if (trimmed === "") return null;
		try { return JSON.parse(trimmed); }
		catch { return trimmed; }
	}

	if (colType === "boolean" || colType === undefined) {
		const lower = trimmed.toLowerCase();
		if (lower === "true" || lower === "да") return true;
		if (lower === "false" || lower === "нет") return false;
		if (colType === "boolean" && lower === "не определено") return null;
	}

	if (colType === undefined) {
		const num = Number(trimmed);
		if (!Number.isNaN(num)) return num;
	}

	return trimmed;
}
