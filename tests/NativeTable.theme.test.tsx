// ── Тема и стилизация: dark theme, striped, cellStyles ──────────────────────

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { NativeTable } from "../src";
import { findCell, testColumns, testData } from "./helpers";

describe("NativeTable: тема и стили", () => {
	it("применяет класс nt-dark при theme=dark", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} theme="dark" />);

		const wrapper = container.querySelector(".nt-table-wrapper")!;
		expect(wrapper.classList.contains("nt-dark")).toBe(true);
		expect(wrapper.getAttribute("data-nt-theme")).toBe("dark");
		expect(container.querySelector(".nt-container")!.classList.contains("nt-dark")).toBe(true);
	});

	it("по умолчанию тема светлая", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} />);

		const wrapper = container.querySelector(".nt-table-wrapper")!;
		expect(wrapper.classList.contains("nt-dark")).toBe(false);
		expect(wrapper.getAttribute("data-nt-theme")).toBe("light");
	});

	it("чередует строки при striped", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} striped />);

		const row0 = findCell(container, 0, 0).closest(".nt-row")!;
		const row1 = findCell(container, 1, 0).closest(".nt-row")!;
		expect(row0.classList.contains("nt-row--striped")).toBe(true);
		expect(row1.classList.contains("nt-row--striped")).toBe(false);
	});

	it("без striped строки не помечаются", () => {
		const { container } = render(<NativeTable data={testData} columns={testColumns} />);

		const row0 = findCell(container, 0, 0).closest(".nt-row")!;
		expect(row0.classList.contains("nt-row--striped")).toBe(false);
	});

	it("применяет cellStyles по ключу columnName|rowId", () => {
		const { container } = render(
			<NativeTable
				data={testData}
				columns={testColumns}
				cellStyles={{ "name|1": { background: "#ff0000", color: "#00ff00" } }}
			/>,
		);

		const cell = findCell(container, 0, 0);
		expect(cell.style.backgroundColor).toBe("rgb(255, 0, 0)");
		expect(cell.style.color).toBe("rgb(0, 255, 0)");
	});

	it("применяет цветовую функцию колонки к ячейкам", () => {
		const columns = [
			{ name: "name", label: "Имя", width: 120 },
			{
				name: "price", label: "Цена", type: "number" as const, width: 100,
				color: (v: string | number | boolean | null) => (Number(v) > 150 ? "#ff0000" : null),
			},
		];
		const { container } = render(<NativeTable data={testData} columns={columns} />);

		expect(findCell(container, 2, 1).style.color).toBe("rgb(255, 0, 0)");
		expect(findCell(container, 0, 1).style.color).toBe("");
	});
});
