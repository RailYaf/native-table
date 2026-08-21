// ── Undo/Redo менеджер ───────────────────────────────────────────────────────
//
// Хранит стек изменений (пакетами batch), до MAX_HISTORY уровней отмены.
// Отменяются только изменения данных:
//   - Редактирование ячеек (oldValue ↔ newValue)
//   - Массовые операции (batch: заполнение, вставка, удаление)
//
// Сортировка/фильтр, изменение ширины колонок, заливка и цвет текста
// в историю не попадают.

import type { Cell } from "../utils/types";

/** Максимальная глубина истории. */
const MAX_HISTORY = 100;

/** Одна запись изменения ячейки. */
export interface ChangeRecord {
	row: number;
	col: number;
	oldValue: Cell | null;
	newValue: Cell | null;
}

/** Поменять местами old/new в записи. */
function invert(rec: ChangeRecord): ChangeRecord {
	return {
		row: rec.row,
		col: rec.col,
		oldValue: rec.newValue,
		newValue: rec.oldValue,
	};
}

export class UndoManager {
	/** Стек undo: каждый элемент — пакет ChangeRecord[] */
	private undoStack: ChangeRecord[][] = [];
	/** Стек redo */
	private redoStack: ChangeRecord[][] = [];
	/** Текущий накапливаемый пакет */
	private batch: ChangeRecord[] = [];

	/** Записать изменение ячейки целиком: старое значение + новое. */
	record(row: number, col: number, oldValue: Cell | null, newValue: Cell | null): void {
		this.batch.push({ row, col, oldValue, newValue });
	}

	/** Зафиксировать накопленный batch в undoStack. Очищает redoStack. */
	commit(): void {
		if (this.batch.length === 0) return;
		this.undoStack.push(this.batch);
		if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
		this.redoStack = [];
		this.batch = [];
	}

	/**
	 * Отменить последнее действие: пакет уходит в redoStack с инвертированными
	 * значениями. Возвращает исходный пакет — его надо применить «наоборот».
	 */
	undo(): ChangeRecord[] | null {
		this.commit();
		const batch = this.undoStack.pop();
		if (!batch) return null;
		this.redoStack.push(batch.map(invert));
		return batch;
	}

	/** Вернуть отменённое действие. */
	redo(): ChangeRecord[] | null {
		this.commit();
		const batch = this.redoStack.pop();
		if (!batch) return null;
		this.undoStack.push(batch.map(invert));
		return batch;
	}

	/** Можно ли отменить? */
	get canUndo(): boolean { return this.undoStack.length > 0 || this.batch.length > 0; }

	/** Есть ли в истории изменения данных? */
	get hasDataChanges(): boolean {
		return this.batch.length > 0 || this.undoStack.some((b) => b.length > 0);
	}

	/** Можно ли вернуть? */
	get canRedo(): boolean { return this.redoStack.length > 0; }

	/** Полная очистка истории (после Save или загрузки). */
	clear(): void {
		this.undoStack = [];
		this.redoStack = [];
		this.batch = [];
	}
}
