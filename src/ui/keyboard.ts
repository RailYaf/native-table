// ── Обработчик клавиатуры ────────────────────────────────────────────────────
//
// Навигация: стрелки, Enter, Tab, Shift+F2 (позже — просто F2)
// Редактирование: любая буква/цифра → начать ввод, Delete/Backspace → очистить
// Горячие клавиши: Ctrl+Z/Y/S/C/V/X
// Shift+стрелка — расширение выделения

import type { CellCoord, SelectionRect } from "../utils/types";

export interface KeyboardHandlerArgs {
	selection: SelectionRect;
	totalRows: number;
	totalCols: number;
	/** Ограничение на фантомные строки/колонки */
	maxRow?: number;
	maxCol?: number;
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
}

export function handleKeyboard(e: KeyboardEvent, args: KeyboardHandlerArgs): void {
	const { selection, totalRows, totalCols, isEditing } = args;
	if (isEditing) return; // в режиме редактирования клавиши идут в инпут
	const cursor = selection.end ?? selection.start;
	if (!cursor) return;

	const ctrl = e.ctrlKey || e.metaKey;

	// Горячие клавиши с Ctrl/Cmd
	if (ctrl && (e.key === "z" || e.key === "Z")) { e.preventDefault(); args.onUndo?.(); return; }
	if (ctrl && (e.key === "y" || e.key === "Y")) { e.preventDefault(); args.onRedo?.(); return; }
	if (ctrl && (e.key === "s" || e.key === "S")) { e.preventDefault(); args.onSave?.(); return; }
	if (ctrl && (e.key === "c" || e.key === "C")) { args.onCopy(); return; }
	if (ctrl && (e.key === "v" || e.key === "V")) { args.onPaste(); return; }
	if (ctrl && (e.key === "x" || e.key === "X")) { args.onCopy(); args.onDelete(); return; }

	let next: CellCoord | null = null;
	switch (e.key) {
		case "ArrowUp":    next = { row: cursor.row - 1, col: cursor.col }; break;
		case "ArrowDown":  next = { row: cursor.row + 1, col: cursor.col }; break;
		case "ArrowLeft":  next = { row: cursor.row, col: cursor.col - 1 }; break;
		case "ArrowRight": next = { row: cursor.row, col: cursor.col + 1 }; break;
		case "Enter":      next = { row: cursor.row + 1, col: cursor.col }; break;
		case "Tab":        next = { row: cursor.row, col: cursor.col + (e.shiftKey ? -1 : 1) }; break;
		case "F2":         args.startEdit(cursor.row, cursor.col, ""); e.preventDefault(); return;
		case "Delete": case "Backspace": args.onDelete(); e.preventDefault(); return;
		case "Escape":     args.cancelEdit(); e.preventDefault(); return;
		default:
			// Любой печатный символ (без Ctrl) — начать редактирование с этим символом
			if (e.key.length === 1 && !ctrl) { args.startEdit(cursor.row, cursor.col, e.key); e.preventDefault(); }
			return;
	}
	if (!next) return;
	e.preventDefault();

	// Клиппинг координат
	const maxR = args.maxRow ?? totalRows - 1;
	const maxC = args.maxCol ?? totalCols - 1;
	if (next.row < 0) next.row = 0;
	if (next.col < 0) next.col = 0;
	if (next.row > maxR) next.row = maxR;
	if (next.col > maxC) next.col = maxC;

	// Shift — расширение выделения, без Shift — перемещение курсора
	if (e.shiftKey && selection.start) args.setSelection({ start: selection.start, end: next });
	else args.setSelection({ start: next, end: next });
}
