// ── Хелперы для тестов NativeTable ───────────────────────────────────────────
//
// В jsdom нет реального лейаута, поэтому мышь приходится «наводить»
// координатами: вычисляем их из инлайн-стилей ячеек (transform/width/top),
// которые рендерер выставляет сам.

import { fireEvent } from "@testing-library/react";
import { INDEX_HEADER_WIDTH } from "../src/utils/consts";

/** Найти ячейку по display-координатам (data-row/data-col). */
export function findCell(container: HTMLElement, row: number, col: number): HTMLElement {
	const cell = container.querySelector<HTMLElement>(`.nt-cell[data-row="${row}"][data-col="${col}"]`);
	if (!cell) throw new Error(`Ячейка [${row},${col}] не найдена в DOM`);
	return cell;
}

/** Текст ячейки (без учёта индикаторов ошибок). */
export function cellText(container: HTMLElement, row: number, col: number): string {
	const cell = findCell(container, row, col);
	const span = cell.querySelector<HTMLElement>(".nt-cell-text");
	return span?.textContent ?? "";
}

/**
 * Координаты центра ячейки в «виртуальном» лейауте.
 * Рендерер позиционирует ячейки через style.transform: translateX(colLeft)
 * внутри слоя со смещением INDEX_HEADER_WIDTH, строки — через style.top.
 */
export function cellCenter(cell: HTMLElement): { clientX: number; clientY: number } {
	const rowEl = cell.closest<HTMLElement>(".nt-row");
	const top = parseFloat(rowEl?.style.top ?? "0") || 0;
	const height = parseFloat(rowEl?.style.height ?? "0") || 28;
	const match = (cell.style.transform ?? "").match(/translateX\(([-\d.]+)px\)/);
	const x = match ? parseFloat(match[1]) : 0;
	const width = parseFloat(cell.style.width ?? "0") || 100;
	return {
		clientX: INDEX_HEADER_WIDTH + x + width / 2,
		clientY: top + height / 2,
	};
}

/** Двойной клик по ячейке (открывает редактор). */
export function dblClickCell(cell: HTMLElement): void {
	fireEvent.dblClick(cell, cellCenter(cell));
}

/**
 * Отредактировать текстовую ячейку: dblclick → ввод значения → Enter.
 * Работает для text/number-колонок (для остальных — отдельные редакторы).
 */
export function editCell(cell: HTMLElement, value: string): void {
	dblClickCell(cell);
	const editor = document.querySelector<HTMLTextAreaElement>(".nt-editor--textarea");
	if (!editor) throw new Error("Редактор ячейки не открылся");
	editor.value = value;
	fireEvent.input(editor);
	fireEvent.keyDown(editor, { key: "Enter" });
}

/** Мок-данные для базовых тестов. */
export const testData = [
	{ id: 1, name: "Alpha", price: 100, active: true },
	{ id: 2, name: "Beta", price: 200, active: false },
	{ id: 3, name: "Gamma", price: 300, active: true },
];

export const testColumns = [
	{ name: "name", label: "Имя", width: 120 },
	{ name: "price", label: "Цена", type: "number" as const, width: 100 },
	{ name: "active", label: "Активен", type: "boolean" as const, width: 100 },
];
