// ── Базовые сценарии: рендер, редактирование, undo/redo, добавление строк ──

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { NativeTable } from "../src";
import { cellCenter, cellText, dblClickCell, editCell, findCell, testColumns, testData } from "./helpers";

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

	it("onSave не шлёт deletedRowId для фантомных строк", () => {
		const onChange = vi.fn();
		const onSave = vi.fn();
		const { container } = render(
			<NativeTable data={testData} columns={testColumns} onChange={onChange} onSave={onSave} />,
		);

		// Разворачиваем таблицу — появляются фантомные строки с temp-id
		const body = container.querySelector(".nt-body")!;
		fireEvent.scroll(body);

		// Вводим значение в новую строку и сохраняем
		editCell(findCell(container, 3, 0), "Delta");
		fireEvent.click(container.querySelector('[data-action="save"]')!);

		const [, changes] = onSave.mock.calls[0];
		// Только созданная ячейка, без «удаления» пустых фантомов
		expect(changes).toHaveLength(1);
		expect(changes[0]).toMatchObject({ columnName: "name", value: "Delta" });
		expect(String(changes[0].createdRowId)).toMatch(/^new_/);
		expect(changes.some((c) => "deletedRowId" in c)).toBe(false);

		// id новой строки в onSave совпадает с id из onChange
		const [, onChangeChanges] = onChange.mock.calls.at(-1)! as [unknown, Array<{ updatedRowId?: string | number }>];
		expect((changes[0] as { createdRowId?: string | number }).createdRowId).toBe(onChangeChanges[0].updatedRowId);
	});

	it("после удаления строки onSave шлёт правильный deletedRowId", () => {
		const onSave = vi.fn();
		const { container } = render(
			<NativeTable data={testData} columns={testColumns} onSave={onSave} />,
		);

		// Удаляем строку с id=2 (Beta) через контекстное меню:
		// правый mousedown переносит выделение на ячейку под курсором
		const cell = findCell(container, 1, 0);
		fireEvent.mouseDown(cell, { button: 2, ...cellCenter(cell) });
		fireEvent.contextMenu(cell, cellCenter(cell));
		const deleteItem = [...document.querySelectorAll(".nt-context-menu-item")]
			.find((el) => el.textContent?.includes("Удалить строки"));
		expect(deleteItem).toBeTruthy();
		fireEvent.click(deleteItem!);

		fireEvent.click(container.querySelector('[data-action="save"]')!);

		const [, changes] = onSave.mock.calls[0];
		// Удалён именно id=2, а значения Gamma не «приклеились» к чужим id
		expect(changes).toEqual([{ deletedRowId: 2 }]);
	});

	it("копирование/вставка boolean и select переносит сырые значения", () => {
		const onChange = vi.fn();
		const columns = [
			{ name: "name", label: "Имя", width: 120 },
			{ name: "active", label: "Активен", type: "boolean" as const, width: 100 },
			{
				name: "status", label: "Статус", type: "select" as const, width: 140,
				options: [
					{ value: "done", label: "Готово" },
					{ value: "todo", label: "К выполнению" },
				],
			},
		];
		const data = [
			{ id: 1, name: "A", active: true, status: "done" },
			{ id: 2, name: "B", active: false, status: "todo" },
		];
		const { container } = render(<NativeTable data={data} columns={columns} onChange={onChange} />);
		const root = container.querySelector(".nt-root")!;

		// Копируем boolean=true из первой строки и вставляем в (1,1)
		fireEvent.mouseDown(findCell(container, 0, 1), cellCenter(findCell(container, 0, 1)));
		fireEvent.keyDown(root, { key: "c", ctrlKey: true, code: "KeyC" });
		fireEvent.mouseDown(findCell(container, 1, 1), cellCenter(findCell(container, 1, 1)));
		fireEvent.paste(document);
		const boolChange = onChange.mock.calls.at(-1)![1][0] as { columnName: string; value: unknown };
		expect(boolChange.columnName).toBe("active");
		expect(boolChange.value).toBe(true);

		// Копируем select=done и вставляем в (1,2)
		onChange.mockClear();
		fireEvent.mouseDown(findCell(container, 0, 2), cellCenter(findCell(container, 0, 2)));
		fireEvent.keyDown(root, { key: "c", ctrlKey: true, code: "KeyC" });
		fireEvent.mouseDown(findCell(container, 1, 2), cellCenter(findCell(container, 1, 2)));
		fireEvent.paste(document);
		const selectChange = onChange.mock.calls.at(-1)![1][0] as { columnName: string; value: unknown };
		expect(selectChange.columnName).toBe("status");
		expect(selectChange.value).toBe("done");
		// Отображается подпись, а не сырое значение
		expect(cellText(container, 1, 2)).toBe("Готово");
	});

	it("вставка работает после клика по кнопке тулбара", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} />);
		const root = container.querySelector(".nt-root")!;

		// Копируем Alpha из (0,0)
		fireEvent.mouseDown(findCell(container, 0, 0), cellCenter(findCell(container, 0, 0)));
		fireEvent.keyDown(root, { key: "c", ctrlKey: true, code: "KeyC" });

		// Выделяем (1,0), затем фокус уходит на кнопку тулбара
		fireEvent.mouseDown(findCell(container, 1, 0), cellCenter(findCell(container, 1, 0)));
		const saveBtn = container.querySelector('[data-action="save"]')!;
		fireEvent.focusIn(saveBtn);

		// Paste приходит с кнопки тулбара (вне .nt-root, но внутри враппера)
		fireEvent.paste(saveBtn);

		expect(cellText(container, 1, 0)).toBe("Alpha");
	});

	it("показывает «Нет данных» при пустых data", () => {
		const { container } = render(<NativeTable data={[]} columns={testColumns} />);
		expect(container.textContent).toContain("Нет данных");
	});

	it("кнопки тулбара имеют подписи, цветовые кнопки убраны", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} />);

		expect(container.querySelector('[data-action="save"]')!.textContent).toContain("Сохранить");
		expect(container.querySelector('[data-action="undo"]')!.textContent).toContain("Отменить");
		expect(container.querySelector('[data-action="redo"]')!.textContent).toContain("Вернуть");
		expect(container.querySelector(".nt-tb-color")).toBeNull();
		expect(container.querySelector(".nt-tb-color-btn")).toBeNull();
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
