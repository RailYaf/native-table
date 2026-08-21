import { describe, expect, it } from "vitest";
import { cellKey, colToLetter, letterToCol, parseCellKey } from "../src/utils/cell-addr";

describe("cell-addr", () => {
	it("colToLetter: базовые индексы", () => {
		expect(colToLetter(0)).toBe("A");
		expect(colToLetter(25)).toBe("Z");
		expect(colToLetter(26)).toBe("AA");
		expect(colToLetter(27)).toBe("AB");
		expect(colToLetter(701)).toBe("ZZ");
		expect(colToLetter(702)).toBe("AAA");
	});

	it("letterToCol: обратное преобразование", () => {
		expect(letterToCol("A")).toBe(0);
		expect(letterToCol("Z")).toBe(25);
		expect(letterToCol("AA")).toBe(26);
		expect(letterToCol("AB")).toBe(27);
		expect(letterToCol("AAA")).toBe(702);
	});

	it("cellKey: A1-стиль", () => {
		expect(cellKey(0, 0)).toBe("A1");
		expect(cellKey(4, 1)).toBe("B5");
		expect(cellKey(99, 26)).toBe("AA100");
	});

	it("parseCellKey: разбор A1", () => {
		expect(parseCellKey("B3")).toEqual({ row: 2, col: 1 });
		expect(parseCellKey("AA100")).toEqual({ row: 99, col: 26 });
		expect(parseCellKey("a1")).toBeNull();
		expect(parseCellKey("1A")).toBeNull();
		expect(parseCellKey("")).toBeNull();
	});

	it("round-trip: parseCellKey(cellKey(r, c)) === (r, c)", () => {
		for (const [r, c] of [[0, 0], [5, 3], [123, 45], [0, 701]]) {
			expect(parseCellKey(cellKey(r, c))).toEqual({ row: r, col: c });
		}
	});
});
