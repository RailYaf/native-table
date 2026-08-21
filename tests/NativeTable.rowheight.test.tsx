import { afterAll, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { NativeTable } from "../src";
import { editCell, findCell } from "./helpers";

function patchScrollHeight() {
	Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
		configurable: true,
		get() {
			const t = this.textContent ?? "";
			return Math.ceil(t.length / 10) * 20;
		},
	});
}

afterAll(() => {
	delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
});

describe("undo/redo: пересчёт высоты строки и колонки номеров", () => {
	it("высота ячейки и ячейки индекса пересчитывается при undo/redo", () => {
		patchScrollHeight();

		const columns = [
			{ name: "name", label: "Имя", width: 100 },
			{ name: "price", label: "Цена", type: "number" as const, width: 100 },
		];
		const data = [
			{ id: 1, name: "очень длинный текст который точно не влезает в узкую колонку", price: 1 },
			{ id: 2, name: "b", price: 2 },
		];

		const { container } = render(
			<NativeTable data={data} columns={columns} allowAddRows={false} cell={{ ellipsis: true, capLines: 5 }} />,
		);

		const rowHeight = () => findCell(container, 0, 0).closest<HTMLElement>(".nt-row")!.style.height;
		const indexHeight = () => container
			.querySelector<HTMLElement>('.nt-header-col .nt-header-cell[data-row="0"]')!.style.height;

		const tall = rowHeight();
		expect(parseFloat(tall)).toBeGreaterThan(28);
		expect(indexHeight()).toBe(tall);

		editCell(findCell(container, 0, 0), "x");
		expect(rowHeight()).toBe("28px");
		expect(indexHeight()).toBe("28px");

		fireEvent.click(container.querySelector('[data-action="undo"]')!);
		expect(rowHeight()).toBe(tall);
		expect(indexHeight()).toBe(tall);

		fireEvent.click(container.querySelector('[data-action="redo"]')!);
		expect(rowHeight()).toBe("28px");
		expect(indexHeight()).toBe("28px");
	});
});
