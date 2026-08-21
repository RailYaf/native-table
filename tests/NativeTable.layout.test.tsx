// ── Лейаут: onLayoutChange при ресайзе колонок, стилях и undo/redo ──────────

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { NativeTable } from "../src";
import { cellCenter, findCell, testColumns, testData } from "./helpers";

describe("NativeTable: лейаут (onLayoutChange)", () => {
	it("вызывает onLayoutChange при ресайзе колонки", () => {
		const onLayoutChange = vi.fn();
		const { container } = render(
			<NativeTable data={testData} columns={testColumns} onLayoutChange={onLayoutChange} />,
		);

		// Колонки растянуты на 100% вьюпорта — берём фактическую ширину из DOM
		const widthBefore = parseFloat(findCell(container, 0, 0).style.width);

		// Перетаскиваем ручку первой колонки на +40px
		const handle = container.querySelector(".nt-header-cell .nt-resize-handle")!;
		fireEvent.mouseDown(handle, { clientX: 100 });
		fireEvent.mouseMove(window, { clientX: 140 });
		fireEvent.mouseUp(window);

		expect(onLayoutChange).toHaveBeenCalled();
		const layout = onLayoutChange.mock.calls.at(-1)![0];
		expect(layout.widths.name).toBe(widthBefore + 40);
	});

	it("Ctrl+Z не отменяет ресайз колонки", () => {
		const onLayoutChange = vi.fn();
		const { container } = render(
			<NativeTable data={testData} columns={testColumns} onLayoutChange={onLayoutChange} />,
		);

		const widthBefore = parseFloat(findCell(container, 0, 0).style.width);

		const handle = container.querySelector(".nt-header-cell .nt-resize-handle")!;
		fireEvent.mouseDown(handle, { clientX:100 });
		fireEvent.mouseMove(window, { clientX: 140 });
		fireEvent.mouseUp(window);
		const widthAfter = parseFloat(findCell(container, 0, 0).style.width);
		expect(widthAfter).toBeGreaterThan(widthBefore);

		// Undo должен отменять только данные — ширина остаётся
		fireEvent.click(container.querySelector('[data-action="undo"]')!);
		expect(parseFloat(findCell(container, 0, 0).style.width)).toBe(widthAfter);

		// Лейаут эмитился только при ресайзе, не при undo
		expect(onLayoutChange).toHaveBeenCalledTimes(1);
	});

	it("не вызывает onLayoutChange при обычном редактировании ячейки", () => {
		const onLayoutChange = vi.fn();
		const { container } = render(
			<NativeTable data={testData} columns={testColumns} onLayoutChange={onLayoutChange} />,
		);

		const cell = findCell(container, 0, 0);
		fireEvent.dblClick(cell, cellCenter(cell));
		const editor = document.querySelector<HTMLTextAreaElement>(".nt-editor--textarea")!;
		editor.value = "New";
		fireEvent.input(editor);
		fireEvent.keyDown(editor, { key: "Enter" });

		expect(onLayoutChange).not.toHaveBeenCalled();
	});

	it("индикатор save не загорается при ресайзе колонки", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} />);

		const dot = container.querySelector<HTMLElement>(".nt-tb-dot")!;
		expect(dot.style.display).toBe("none");

		const handle = container.querySelector(".nt-header-cell .nt-resize-handle")!;
		fireEvent.mouseDown(handle, { clientX: 100 });
		fireEvent.mouseMove(window, { clientX: 140 });
		fireEvent.mouseUp(window);

		expect(dot.style.display).toBe("none");
	});

	it("индикатор save загорается при изменении значения ячейки и гаснет после save", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} />);

		const dot = container.querySelector<HTMLElement>(".nt-tb-dot")!;
		expect(dot.style.display).toBe("none");

		const cell = findCell(container, 0, 0);
		fireEvent.dblClick(cell, cellCenter(cell));
		const editor = document.querySelector<HTMLTextAreaElement>(".nt-editor--textarea")!;
		editor.value = "New";
		fireEvent.input(editor);
		fireEvent.keyDown(editor, { key: "Enter" });

		expect(dot.style.display).toBe("block");

		fireEvent.click(container.querySelector('[data-action="save"]')!);
		expect(dot.style.display).toBe("none");
	});

	it("кнопки undo/redo не активируются при ресайзе колонки", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} />);

		const undoBtn = container.querySelector<HTMLButtonElement>('[data-action="undo"]')!;
		const redoBtn = container.querySelector<HTMLButtonElement>('[data-action="redo"]')!;
		expect(undoBtn).toBeDisabled();
		expect(redoBtn).toBeDisabled();

		const handle = container.querySelector(".nt-header-cell .nt-resize-handle")!;
		fireEvent.mouseDown(handle, { clientX: 100 });
		fireEvent.mouseMove(window, { clientX: 140 });
		fireEvent.mouseUp(window);

		expect(undoBtn).toBeDisabled();
		expect(redoBtn).toBeDisabled();
	});

	it("кнопки undo/redo отражают изменения данных", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} />);

		const undoBtn = container.querySelector<HTMLButtonElement>('[data-action="undo"]')!;
		const redoBtn = container.querySelector<HTMLButtonElement>('[data-action="redo"]')!;

		// Правка данных → undo активен, redo нет
		const cell = findCell(container, 0, 0);
		fireEvent.dblClick(cell, cellCenter(cell));
		const editor = document.querySelector<HTMLTextAreaElement>(".nt-editor--textarea")!;
		editor.value = "New";
		fireEvent.input(editor);
		fireEvent.keyDown(editor, { key: "Enter" });

		expect(undoBtn).not.toBeDisabled();
		expect(redoBtn).toBeDisabled();

		// undo → наоборот
		fireEvent.click(undoBtn);
		expect(undoBtn).toBeDisabled();
		expect(redoBtn).not.toBeDisabled();

		// redo → как после правки
		fireEvent.click(redoBtn);
		expect(undoBtn).not.toBeDisabled();
		expect(redoBtn).toBeDisabled();
	});
});
