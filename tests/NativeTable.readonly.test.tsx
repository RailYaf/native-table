// ── Режим только для чтения и запрет добавления строк ──────────────────────

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { NativeTable } from "../src";
import { cellText, dblClickCell, findCell, testColumns, testData } from "./helpers";

describe("NativeTable: readOnly", () => {
	it("скрывает кнопки сохранения/undo/redo в readOnly-режиме", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} readOnly />);

		expect(container.querySelector('[data-action="save"]')).toBeNull();
		expect(container.querySelector('[data-action="undo"]')).toBeNull();
		expect(container.querySelector('[data-action="redo"]')).toBeNull();
	});

	it("не открывает редактор по двойному клику", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} readOnly />);

		dblClickCell(findCell(container, 0, 0));
		expect(document.querySelector(".nt-editor")).toBeNull();
	});

	it("не создаёт строки-фантомы при allowAddRows=false", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} allowAddRows={false} />);

		// После последней строки данных (строка 3) ячеек нет
		expect(container.querySelector('.nt-cell[data-row="3"]')).toBeNull();
	});

	it("данные по-прежнему отображаются", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} readOnly />);
		expect(cellText(container, 0, 0)).toBe("Alpha");
		expect(cellText(container, 2, 0)).toBe("Gamma");
	});
});
