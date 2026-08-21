// ── Базовые сценарии: рендер, редактирование, undo/redo, добавление строк ──

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { NativeTable } from "../src";
import { cellText, dblClickCell, editCell, findCell, testColumns, testData } from "./helpers";

describe("NativeTable: базовые сценарии", () => {
	it("рендерит заголовки и значения ячеек", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} />);

		for (const label of ["Имя", "Цена", "Активен"]) {
			expect(container.querySelector(`.nt-header-label`)).toBeTruthy();
			expect([...container.querySelectorAll(".nt-header-label")].map((el) => el.textContent)).toContain(label);
		}

		expect(cellText(container, 0, 0)).toBe("Alpha");
		expect(cellText(container, 1, 0)).toBe("Beta");
		expect(cellText(container, 0, 1)).toContain("100");
		const boolCheckbox = findCell(container, 2, 2).querySelector<HTMLInputElement>(".nt-checkbox")!;
		expect(boolCheckbox.checked).toBe(true);
	});

	it("вызывает onChange при редактировании ячейки", () => {
		const onChange = vi.fn();
		const { container } = render(<NativeTable data={testData} columns={testColumns} onChange={onChange} />);

		editCell(findCell(container, 1, 0), "Beta 2.0");

		expect(onChange).toHaveBeenCalled();
		const [allRows, changes] = onChange.mock.calls.at(-1)!;
		expect(changes).toEqual([
			{ updatedRowId: 2, columnName: "name", value: "Beta 2.0" },
		]);
		expect(allRows).toHaveLength(3);
		expect(allRows[1]).toMatchObject({ id: 2, name: "Beta 2.0" });
	});

	it("редактирует number-колонку с приведением типа", () => {
		const onChange = vi.fn();
		const { container } = render(<NativeTable data={testData} columns={testColumns} onChange={onChange} />);

		editCell(findCell(container, 0, 1), "123.5");

		const [, changes] = onChange.mock.calls.at(-1)!;
		expect(changes).toEqual([
			{ updatedRowId: 1, columnName: "price", value: 123.5 },
		]);
	});

	it("переключает boolean по клику на чекбокс", () => {
		const onChange = vi.fn();
		const { container } = render(<NativeTable data={testData} columns={testColumns} onChange={onChange} />);

		const checkbox = findCell(container, 1, 2).querySelector(".nt-checkbox")!;
		fireEvent.mouseDown(checkbox);
		fireEvent.click(checkbox);

		const [, changes] = onChange.mock.calls.at(-1)!;
		expect(changes).toEqual([
			{ updatedRowId: 2, columnName: "active", value: true },
		]);
	});

	it("отменяет и повторяет изменение через тулбар (undo/redo)", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} />);

		editCell(findCell(container, 0, 0), "Changed");
		expect(cellText(container, 0, 0)).toBe("Changed");

		fireEvent.click(container.querySelector('[data-action="undo"]')!);
		expect(cellText(container, 0, 0)).toBe("Alpha");

		fireEvent.click(container.querySelector('[data-action="redo"]')!);
		expect(cellText(container, 0, 0)).toBe("Changed");
	});

	it("вызывает onSave с гранулярными изменениями", () => {
		const onSave = vi.fn();
		const { container } = render(
			<NativeTable data={testData} columns={testColumns} allowAddRows={false} onSave={onSave} />,
		);

		editCell(findCell(container, 2, 0), "Gamma 2");
		fireEvent.click(container.querySelector('[data-action="save"]')!);

		expect(onSave).toHaveBeenCalledTimes(1);
		const [allRows, changes] = onSave.mock.calls[0];
		expect(changes).toEqual([
			{ updatedRowId: 3, columnName: "name", value: "Gamma 2" },
		]);
		expect(allRows).toHaveLength(3);
	});

	it("добавляет новую строку при вводе в строке-фантоме", () => {
		const onChange = vi.fn();
		const { container } = render(<NativeTable data={testData} columns={testColumns} onChange={onChange} />);

		// Разворачиваем таблицу вниз (скролл → autoExpand добавляет строки)
		const body = container.querySelector(".nt-body")!;
		fireEvent.scroll(body);

		// 4-я строка — фантом (после 3 строк данных)
		editCell(findCell(container, 3, 0), "Delta");

		const [, changes] = onChange.mock.calls.at(-1)!;
		expect(changes).toHaveLength(1);
		expect(changes[0]).toMatchObject({ columnName: "name", value: "Delta" });
		expect(String(changes[0].updatedRowId)).toMatch(/^new_/);
	});

	it("показывает «Нет данных» при пустых data", () => {
		const { container } = render(<NativeTable data={[]} columns={testColumns} />);
		expect(container.textContent).toContain("Нет данных");
	});

	it("показывает загрузку при loading", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} loading />);
		expect(container.textContent).toContain("Загрузка");
		expect(container.querySelector(".nt-loading-spinner")).toBeTruthy();
	});

	it("не открывает редактор для readOnly-колонки", () => {
		const columns = [
			{ name: "name", label: "Имя", width: 120, readOnly: true },
			{ name: "price", label: "Цена", type: "number" as const, width: 100 },
		];
		const { container } = render(<NativeTable data={testData} columns={columns} />);

		dblClickCell(findCell(container, 0, 0));
		expect(document.querySelector(".nt-editor--textarea")).toBeNull();
	});
});
