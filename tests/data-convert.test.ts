import { describe, expect, it } from "vitest";
import { cellsToSaveRows, dataToCells, generateTempId, isTempRowId } from "../src/utils/data-convert";
import { cellKey } from "../src/utils/cell-addr";
import type { ColumnDef } from "../src/utils/types";

const columns: ColumnDef[] = [
	{ name: "name", type: "text" },
	{ name: "price", type: "number" },
	{ name: "active", type: "boolean" },
	{ name: "tags", type: "array" },
];

const data = [
	{ id: 1, name: "Alpha", price: 10, active: true, tags: ["a", "b"] },
	{ id: 2, name: "Beta", price: "20.5", active: 0, tags: "x, y" },
	{ id: 3, name: "Gamma", price: null, active: undefined },
];

describe("dataToCells", () => {
	it("собирает rowIds, размеры и листовые колонки", () => {
		const res = dataToCells(data, columns);
		expect(res.rows).toBe(3);
		expect(res.cols).toBe(4);
		expect(res.rowIds).toEqual([1, 2, 3]);
		expect(res.leafNames).toEqual(["name", "price", "active", "tags"]);
	});

	it("конвертирует значения по типам колонок", () => {
		const res = dataToCells(data, columns);
		expect(res.initialData[cellKey(0, 1)]?.value).toBe(10);
		expect(res.initialData[cellKey(1, 1)]?.value).toBe(20.5);
		expect(res.initialData[cellKey(2, 1)]?.value).toBeNull();
		expect(res.initialData[cellKey(0, 2)]?.value).toBe(true);
		expect(res.initialData[cellKey(1, 2)]?.value).toBe(false);
		expect(res.initialData[cellKey(0, 3)]?.value).toEqual(["a", "b"]);
		expect(res.initialData[cellKey(1, 3)]?.value).toEqual(["x", "y"]);
	});

	it("не создаёт ячейки для отсутствующих значений", () => {
		const res = dataToCells(data, columns);
		expect(res.initialData[cellKey(2, 2)]).toBeUndefined();
	});

	it("генерирует временный id, если rowKey отсутствует", () => {
		const res = dataToCells([{ name: "NoId" }], columns);
		expect(String(res.rowIds[0])).toMatch(/^new_/);
	});

	it("разворачивает вложенные children-колонки", () => {
		const nested: ColumnDef[] = [
			{ name: "a", type: "text" },
			{ label: "Group", children: [{ name: "b", type: "number" }, { name: "c", type: "text" }] },
		];
		const res = dataToCells([{ id: 1, a: "x", b: 5, c: "y" }], nested);
		expect(res.leafNames).toEqual(["a", "b", "c"]);
		expect(res.cols).toBe(3);
	});
});

describe("cellsToSaveRows", () => {
	it("группирует ячейки по строкам с именами колонок", () => {
		const conv = dataToCells(data, columns);
		const rows = cellsToSaveRows(conv.initialData, conv.leafNames, conv.rowIds);
		expect(rows).toHaveLength(3);
		expect(rows[0].rowId).toBe(1);
		expect(rows[0].values).toMatchObject({ name: "Alpha", price: 10, active: true, tags: ["a", "b"] });
	});

	it("для строк без rowId генерирует temp-id", () => {
		const rows = cellsToSaveRows(
			{ [cellKey(0, 0)]: { value: "New" } },
			["name"],
			[],
		);
		expect(rows).toHaveLength(1);
		expect(isTempRowId(rows[0].rowId)).toBe(true);
	});
});

describe("isTempRowId / generateTempId", () => {
	it("распознаёт временные id", () => {
		expect(isTempRowId(generateTempId())).toBe(true);
		expect(isTempRowId("id-123")).toBe(false);
		expect(isTempRowId(42)).toBe(false);
	});
});
