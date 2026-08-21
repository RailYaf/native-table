// ── Select-редактор: белый фон в режиме редактирования ──────────────────────

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { NativeTable } from "../src";
import type { ColumnDef } from "../src/utils/types";
import { cellCenter, cellText, findCell } from "./helpers";

const columns: ColumnDef[] = [
	{
		name: "status", label: "Статус", type: "select", width: 150,
		options: [
			{ value: "todo", label: "К выполнению" },
			{ value: "done", label: "Готово" },
		],
		backgroundColor: (v) => (v === "todo" ? "#ff0000" : null),
	},
	{ name: "name", label: "Имя", width: 120 },
];

const data = [
	{ id: 1, status: "todo", name: "Alpha" },
	{ id: 2, status: "todo", name: "Beta" },
];

function pickOption(label: string): void {
	const item = [...document.querySelectorAll(".nt-select-dropdown-item")]
		.find((el) => el.textContent === label);
	if (!item) throw new Error(`Пункт «${label}» не найден в дропдауне`);
	fireEvent.click(item);
}

describe("NativeTable: select-редактор", () => {
	it("в режиме редактирования у select-ячейки белый фон", () => {
		const { container } = render(<NativeTable data={data} columns={columns} />);

		const cell = findCell(container, 0, 0);
		expect(cell.style.backgroundColor).toBe("rgb(255, 0, 0)");

		fireEvent.dblClick(cell, cellCenter(cell));

		// Заливка не рисуется — фон белый (дефолтный), текст на месте
		expect(findCell(container, 0, 0).style.backgroundColor).toBe("");
		expect(cellText(container, 0, 0)).toBe("К выполнению");
	});

	it("в режиме редактирования зелёная рамка выделения скрыта", () => {
		const { container } = render(<NativeTable data={data} columns={columns} />);

		fireEvent.dblClick(findCell(container, 0, 0), cellCenter(findCell(container, 0, 0)));

		const range = container.querySelector<HTMLElement>(".nt-range")!;
		expect(range.style.display).toBe("none");
	});

	it("после выбора значения заливка возвращается", () => {
		const { container } = render(<NativeTable data={data} columns={columns} />);

		fireEvent.dblClick(findCell(container, 0, 0), cellCenter(findCell(container, 0, 0)));
		pickOption("Готово");

		expect(document.querySelector(".nt-editor")).toBeNull();
		expect(cellText(container, 0, 0)).toBe("Готово");
		// «Готово» → backgroundColor-функция вернула null, т.е. фон белый
		expect(findCell(container, 0, 0).style.backgroundColor).toBe("");
	});

	it("Escape закрывает редактор и возвращает заливку без изменения значения", async () => {
		const onChange = vi.fn();
		const { container } = render(<NativeTable data={data} columns={columns} onChange={onChange} />);

		fireEvent.dblClick(findCell(container, 0, 0), cellCenter(findCell(container, 0, 0)));
		// onDismiss подписывается на document отложенно (setTimeout 0)
		await new Promise((r) => setTimeout(r, 10));
		fireEvent.keyDown(document, { key: "Escape" });

		expect(document.querySelector(".nt-editor")).toBeNull();
		expect(cellText(container, 0, 0)).toBe("К выполнению");
		expect(findCell(container, 0, 0).style.backgroundColor).toBe("rgb(255, 0, 0)");
		expect(onChange).not.toHaveBeenCalled();
	});
});
