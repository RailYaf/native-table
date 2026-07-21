import { cellKey } from "../utils/cell-addr";
import type { Cell, ChangeAction, ScalarCellValue } from "../utils/types";

// ── Модель данных таблицы ────────────────────────────────────────────────────
//
// Хранит все данные в Map<string, Cell> с ключами формата "A1", "B2" и т.д.
// Отсутствующие ячейки считаются пустыми (value: null).
// Поддерживает вставку и удаление строк со сдвигом данных.

export class SheetModel {
	/** Хранилище ячеек: ключ формата "A1" → ячейка */
	private cells = new Map<string, Cell>();

	/** Колбэк, вызываемый при каждом изменении данных (для IndexedDB). */
	onChange?: (_cells: Record<string, Cell>, action?: ChangeAction) => void;

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

	/** Записать ячейку без вызова onChange (для массовых операций). */
	setSilent(row: number, col: number, cell: Cell): void {
		this.cells.set(cellKey(row, col), { ...cell });
	}

	/** То же — по готовому ключу. */
	setSilentByKey(key: string, cell: Cell): void {
		this.cells.set(key, { ...cell });
	}

	/** Получить сырое значение (или null). */
	getValue(row: number, col: number): ScalarCellValue {
		return this.cells.get(cellKey(row, col))?.value ?? null;
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
	 * Пустая строка — удалить ячейку. Вызывает onChange.
	 */
	set(row: number, col: number, raw: string): void {
		const key = cellKey(row, col);
		if (raw === "") this.cells.delete(key);
		else this.cells.set(key, { value: parseLiteral(raw) });
		this.emit();
	}

	/** Удалить ячейку без вызова onChange. */
	deleteSilent(row: number, col: number): void {
		this.cells.delete(cellKey(row, col));
	}

	/** Вставить пустую строку на позицию row, сдвинув данные вниз. */
	insertRowAt(row: number): void {
		const toShift: Array<{ fromKey: string; cell: Cell }> = [];
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
		this.emit("insert");
	}

	/** Удалить строки [from, to] включительно, сдвинув данные вверх. */
	deleteRows(from: number, to: number): void {
		const count = to - from + 1;
		const toDelete = new Set<string>();
		const toShift: Array<{ fromKey: string; cell: Cell }> = [];

		for (const [key, cell] of this.cells) {
			const match = key.match(/^([A-Z]+)(\d+)$/);
			if (match) {
				const r = Number(match[2]) - 1;
				if (r >= from && r <= to) {
					toDelete.add(key);
				} else if (r > to) {
					toShift.push({ fromKey: key, cell: { ...cell } });
				}
			}
		}

		for (const key of toDelete) this.cells.delete(key);
		for (const { fromKey } of toShift) this.cells.delete(fromKey);
		for (const { fromKey, cell } of toShift) {
			const match = fromKey.match(/^([A-Z]+)(\d+)$/);
			if (match) {
				const col = match[1];
				const r = Number(match[2]) - 1;
				const newKey = `${col}${r - count + 1}`;
				this.cells.set(newKey, cell);
			}
		}
		this.emit("delete");
	}

	emit(action: ChangeAction = "edit"): void {
		this.onChange?.(this.getAll(), action);
	}
}

// ── Парсинг литералов ────────────────────────────────────────────────────────
//
// "42"     → 42  (number)
// "true"   → true
// "false"  → false
// "hello"  → "hello"
// ""       → null

function parseLiteral(input: string): ScalarCellValue {
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
