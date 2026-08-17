// ── Обработчик клавиатуры ────────────────────────────────────────────────────
//
// Навигация: стрелки, Enter, Tab, PageUp/Down, Ctrl+стрелки (data regions)
// Редактирование: любая буква/цифра → начать ввод, Delete/Backspace → очистить
// Горячие клавиши: Ctrl+Z/Y/S/C/V/X
// Shift+стрелка — расширение выделения

import type { CellCoord, SelectionRect } from "../utils/types";

export interface KeyboardHandlerArgs {
	selection: SelectionRect;
	totalRows: number;
	totalCols: number;
	/** Ограничение: курсор не должен уходить на фантомные строки */
	maxRow?: number;
	maxCol?: number;
	/** Количество видимых строк в вьюпорте (для PageUp/PageDown) */
	pageSize?: number;
	isEditing: boolean;
	setSelection: (_rect: SelectionRect) => void;
	startEdit: (_row: number, _col: number, _initial?: string) => void;
	commitEdit: () => void;
	cancelEdit: () => void;
	onCopy: () => void;
	onPaste: () => void;
	onDelete: () => void;
	onUndo?: () => void;
	onRedo?: () => void;
	onSave?: () => void;
	/** Проверка: пуста ли ячейка (dataRow, col). Нужна для Ctrl+стрелок (data regions). */
	isCellEmpty?: (_row: number, _col: number) => boolean;
}

export function handleKeyboard(e: KeyboardEvent, args: KeyboardHandlerArgs): void {
	const { selection, totalRows, totalCols, isEditing } = args;
	if (isEditing) return; // в режиме редактирования клавиши идут в инпут
	const cursor = selection.end ?? selection.start;
	if (!cursor) return;

	const ctrl = e.ctrlKey || e.metaKey;

	// Клиппинг координат
	const maxR = args.maxRow ?? totalRows - 1;
	const maxC = args.maxCol ?? totalCols - 1;

	// Горячие клавиши с Ctrl/Cmd. preventDefault обязателен и для копирования:
	// иначе браузер параллельно положит в буфер выделенный текст страницы.
	if (ctrl && e.code === "KeyZ") { e.preventDefault(); args.onUndo?.(); return; }
	if (ctrl && e.code === "KeyY") { e.preventDefault(); args.onRedo?.(); return; }
	if (ctrl && e.code === "KeyS") { e.preventDefault(); args.onSave?.(); return; }
	if (ctrl && e.code === "KeyC") { e.preventDefault(); args.onCopy(); return; }
	if (ctrl && e.code === "KeyV") return; // Paste — через нативный paste event
	if (ctrl && e.code === "KeyX") { e.preventDefault(); args.onCopy(); args.onDelete(); return; }

	// Ctrl+стрелки — прыжки по границам data-регионов
	if (ctrl && args.isCellEmpty) {
		e.preventDefault();
		const key = e.key;
		if (key === "ArrowRight" || key === "ArrowLeft") {
			const dir = key === "ArrowRight" ? 1 : -1;
			let col = cursor.col;
			if (!args.isCellEmpty(cursor.row, col)) {
				col += dir;
				if (col >= 0 && col <= maxC && !args.isCellEmpty(cursor.row, col)) {
					while (col >= 0 && col <= maxC && !args.isCellEmpty(cursor.row, col)) col += dir;
					col -= dir;
				} else {
					while (col >= 0 && col <= maxC && args.isCellEmpty(cursor.row, col)) col += dir;
				}
			} else {
				col += dir;
				while (col >= 0 && col <= maxC && args.isCellEmpty(cursor.row, col)) col += dir;
			}
			col = Math.max(0, Math.min(maxC, col));
			const nextCoord: CellCoord = { row: cursor.row, col };
			if (e.shiftKey && selection.start) args.setSelection({ start: selection.start, end: nextCoord });
			else args.setSelection({ start: nextCoord, end: nextCoord });
		} else if (key === "ArrowDown" || key === "ArrowUp") {
			const dir = key === "ArrowDown" ? 1 : -1;
			let row = cursor.row;
			if (!args.isCellEmpty(row, cursor.col)) {
				row += dir;
				if (row >= 0 && row <= maxR && !args.isCellEmpty(row, cursor.col)) {
					while (row >= 0 && row <= maxR && !args.isCellEmpty(row, cursor.col)) row += dir;
					row -= dir;
				} else {
					while (row >= 0 && row <= maxR && args.isCellEmpty(row, cursor.col)) row += dir;
				}
			} else {
				row += dir;
				while (row >= 0 && row <= maxR && args.isCellEmpty(row, cursor.col)) row += dir;
			}
			row = Math.max(0, Math.min(maxR, row));
			const nextCoord: CellCoord = { row, col: cursor.col };
			if (e.shiftKey && selection.start) args.setSelection({ start: selection.start, end: nextCoord });
			else args.setSelection({ start: nextCoord, end: nextCoord });
		}
		return;
	}

	let next: CellCoord | null = null;
	switch (e.key) {
		case "ArrowUp":    next = { row: cursor.row - 1, col: cursor.col }; break;
		case "ArrowDown":  next = { row: cursor.row + 1, col: cursor.col }; break;
		case "ArrowLeft":  next = { row: cursor.row, col: cursor.col - 1 }; break;
		case "ArrowRight": next = { row: cursor.row, col: cursor.col + 1 }; break;
		case "PageUp":     next = { row: cursor.row - (args.pageSize ?? 20), col: cursor.col }; break;
		case "PageDown":   next = { row: cursor.row + (args.pageSize ?? 20), col: cursor.col }; break;
		case "Enter":      next = { row: cursor.row + 1, col: cursor.col }; break;
		case "Tab":        next = { row: cursor.row, col: cursor.col + (e.shiftKey ? -1 : 1) }; break;
		case "Home":       next = { row: ctrl ? 0 : cursor.row, col: 0 }; break;
		case "End":        next = { row: ctrl ? maxR : cursor.row, col: maxC }; break;
		case "F2":         args.startEdit(cursor.row, cursor.col, ""); e.preventDefault(); return;
		case "Delete": case "Backspace": args.onDelete(); e.preventDefault(); return;
		case "Escape":     args.cancelEdit(); e.preventDefault(); return;
		default:
			// Любой печатный символ (без модификаторов) — начать ввод с этого символа
			if (e.key.length === 1 && !ctrl && !e.altKey) {
				args.startEdit(cursor.row, cursor.col, e.key);
				e.preventDefault();
			}
			return;
	}
	if (!next) return;
	e.preventDefault();

	if (next.row < 0) next.row = 0;
	if (next.col < 0) next.col = 0;
	if (next.row > maxR) next.row = maxR;
	if (next.col > maxC) next.col = maxC;

	// Shift — расширение выделения, без Shift — перемещение курсора
	if (e.shiftKey && selection.start) args.setSelection({ start: selection.start, end: next });
	else args.setSelection({ start: next, end: next });
}
