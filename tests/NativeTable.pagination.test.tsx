// ── Пагинация: управление извне ─────────────────────────────────────────────

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { NativeTable } from "../src";
import { cellText, testColumns } from "./helpers";

const pageData = [
	{ id: 11, name: "Page1-1", price: 11, active: true },
	{ id: 12, name: "Page1-2", price: 12, active: false },
];

function renderPaged(onPageChange = vi.fn(), page = 0, pageSize = 10) {
	const { container } = render(
		<NativeTable
			data={pageData}
			columns={testColumns}
			pagination={{
				page,
				pageSize,
				total: 25,
				pageSizeOptions: [5, 10, 25],
				onPageChange,
			}}
		/>,
	);
	return { container, onPageChange };
}

describe("NativeTable: пагинация", () => {
	it("рендерит кнопки, счётчик страниц и селект размера", () => {
		const { container } = renderPaged();

		expect(container.querySelectorAll(".nt-pagination-btn")).toHaveLength(2);
		expect(container.querySelector(".nt-pagination-info")!.textContent).toContain("из 3");
		expect(container.querySelector(".nt-pagination-input")).toHaveValue("1");
		expect(container.querySelector(".nt-pagination-pagesize")!.children).toHaveLength(3);
	});

	it("кнопка «вперёд» вызывает onPageChange(1, pageSize)", () => {
		const { container, onPageChange } = renderPaged();

		const buttons = container.querySelectorAll(".nt-pagination-btn");
		fireEvent.click(buttons[1]); // ▶

		expect(onPageChange).toHaveBeenCalledWith(1, 10);
	});

	it("на первой странице кнопка «назад» заблокирована", () => {
		const { container } = renderPaged();
		const buttons = container.querySelectorAll(".nt-pagination-btn");
		expect(buttons[0]).toBeDisabled();
		expect(buttons[1]).not.toBeDisabled();
	});

	it("на последней странице кнопка «вперёд» заблокирована", () => {
		const { container } = renderPaged(vi.fn(), 2); // страница 3 из 3
		const buttons = container.querySelectorAll(".nt-pagination-btn");
		expect(buttons[1]).toBeDisabled();
	});

	it("ввод номера страницы + Enter вызывает onPageChange", () => {
		const { container, onPageChange } = renderPaged();

		const input = container.querySelector(".nt-pagination-input")!;
		fireEvent.change(input, { target: { value: "2" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onPageChange).toHaveBeenCalledWith(1, 10);
	});

	it("игнорирует нечисловой ввод страницы", () => {
		const { container, onPageChange } = renderPaged();

		const input = container.querySelector(".nt-pagination-input")!;
		fireEvent.change(input, { target: { value: "abc" } });
		expect(input).toHaveValue("");

		fireEvent.keyDown(input, { key: "Enter" });
		expect(onPageChange).not.toHaveBeenCalled();
	});

	it("смена размера страницы вызывает onPageChange(0, newSize)", () => {
		const { container, onPageChange } = renderPaged();

		fireEvent.change(container.querySelector(".nt-pagination-pagesize")!, { target: { value: "25" } });
		expect(onPageChange).toHaveBeenCalledWith(0, 25);
	});

	it("показывает данные текущей страницы", () => {
		const { container } = renderPaged();
		expect(cellText(container, 0, 0)).toBe("Page1-1");
		expect(cellText(container, 1, 0)).toBe("Page1-2");
	});
});
