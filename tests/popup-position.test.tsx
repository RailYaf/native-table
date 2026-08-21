// ── Позиционирование попапов внутри таблицы (флипы у краёв) ─────────────────

import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { NativeTable } from "../src";
import type { ColumnDef } from "../src/utils/types";
import { flipNearBox, hostViewport } from "../src/ui/popup-utils";
import { cellCenter, findCell } from "./helpers";

const box = (left: number, top: number, width = 100, height = 28) => ({ left, top, width, height });
const vp = (left = 0, top = 0, right = 800, bottom = 600) => ({ left, top, right, bottom });

describe("flipNearBox", () => {
	it("снизу и справа хватает места — попап ниже и слева-выровнен", () => {
		expect(flipNearBox(box(100, 100), 150, 80, vp())).toEqual({ left: 100, top: 128 });
	});

	it("не влезает снизу — флип вверх", () => {
		expect(flipNearBox(box(100, 560), 150, 80, vp())).toEqual({ left: 100, top: 480 });
	});

	it("не влезает справа — правый край попапа по правому краю ячейки", () => {
		// ячейка 200..300, попап 150: 200+150=350 > 300 — флип влево к x=150
		const smallVp = vp(0, 0, 300, 600);
		expect(flipNearBox(box(200, 100), 150, 80, smallVp)).toEqual({ left: 150, top: 128 });
	});

	it("не влезает и снизу, и справа — оба флипа", () => {
		const smallVp = vp(0, 0, 300, 200);
		expect(flipNearBox(box(200, 180), 150, 80, smallVp)).toEqual({ left: 150, top: 100 });
	});

	it("флип вверх не уводит выше вьюпорта — кламп к top", () => {
		const smallVp = vp(0, 0, 300, 120);
		// box.top=30: снизу 58+80 > 120 → вверх 30-80=-50 → кламп к 0
		expect(flipNearBox(box(100, 30), 150, 80, smallVp)).toEqual({ left: 100, top: 0 });
	});
});

describe("hostViewport", () => {
	it("считает границы видимости в координатах cellsLayer (со скроллом)", () => {
		const host = document.createElement("div");
		host.style.left = "48px";
		const body = document.createElement("div");
		body.className = "nt-body";
		body.append(host);
		// jsdom-патчи дают clientWidth/Height 800/600
		const v = hostViewport(host);
		expect(v).toEqual({ left: -48, top: 0, right: 752, bottom: 600 });
	});
});

describe("NativeTable: позиционирование array/json-редакторов", () => {
	const columns: ColumnDef[] = [
		{ name: "tags", label: "Теги", type: "array", subtype: "text", width: 120 },
		{ name: "meta", label: "Мета", type: "json", width: 120 },
	];
	const data = [{ id: 1, tags: ["a"], meta: { k: 1 } }];

	it("array-редактор не выходит за нижний/правый край вьюпорта", () => {
		const { container } = render(<NativeTable data={data} columns={columns} />);

		fireEvent.dblClick(findCell(container, 0, 0), cellCenter(findCell(container, 0, 0)));

		const arr = container.querySelector<HTMLElement>(".nt-editor--array")!;
		expect(arr).toBeTruthy();
		// jsdom-размер попапа 800×600 → флип вверх (кламп к 0) и влево к краю вьюпорта
		expect(parseFloat(arr.style.top)).toBeLessThanOrEqual(0);
		expect(parseFloat(arr.style.left)).toBeLessThanOrEqual(-48 + 1);
	});

	it("json-редактор не выходит за нижний/правый край вьюпорта", () => {
		const { container } = render(<NativeTable data={data} columns={columns} />);

		fireEvent.dblClick(findCell(container, 0, 1), cellCenter(findCell(container, 0, 1)));

		const json = container.querySelector<HTMLElement>(".nt-editor--json")!;
		expect(json).toBeTruthy();
		expect(parseFloat(json.style.top)).toBeLessThanOrEqual(0);
		expect(parseFloat(json.style.left)).toBeLessThanOrEqual(-48 + 1);
	});
});

describe("NativeTable: позиционирование select-дропдауна", () => {
	const columns: ColumnDef[] = [
		{
			name: "status", label: "Статус", type: "select", width: 150,
			options: [
				{ value: "todo", label: "К выполнению" },
				{ value: "done", label: "Готово" },
			],
		},
	];

	it("дропдаун не выходит за нижний/правый край вьюпорта", () => {
		const { container } = render(
			<NativeTable data={[{ id: 1, status: "todo" }]} columns={columns} />,
		);

		fireEvent.dblClick(findCell(container, 0, 0), cellCenter(findCell(container, 0, 0)));

		const dd = container.querySelector<HTMLElement>(".nt-select-dropdown")!;
		// jsdom-размеры попапа 800×600, вьюпорт 800×600 → флип вверх и кламп
		const ddLeft = parseFloat(dd.style.left);
		const ddTop = parseFloat(dd.style.top);
		expect(Number.isFinite(ddLeft)).toBe(true);
		expect(Number.isFinite(ddTop)).toBe(true);
		// Верх попапа не ниже ячейки (флип вверх) и не выше начала вьюпорта
		expect(ddTop).toBeLessThanOrEqual(0);
		expect(ddTop).toBeGreaterThanOrEqual(-1);
		// Попап не уходит правее вьюпорта
		expect(ddLeft + 800).toBeLessThanOrEqual(752 + 1);
	});
});
