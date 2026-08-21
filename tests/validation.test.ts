import { describe, expect, it } from "vitest";
import { validateCell } from "../src/utils/validation";

describe("validateCell", () => {
	it("required: пустое значение — ошибка", () => {
		expect(validateCell("", "x", { required: true }, [])).toBe("Поле не может быть пустым");
		expect(validateCell(null, "x", { required: true }, [])).toBe("Поле не может быть пустым");
	});

	it("required: непустое значение — ок", () => {
		expect(validateCell("abc", null, { required: true }, [])).toBeNull();
	});

	it("pattern: несоответствие возвращает patternMessage", () => {
		const rules = { pattern: "^\\d+$", patternMessage: "Только цифры" };
		expect(validateCell("abc", null, rules, [])).toBe("Только цифры");
		expect(validateCell("123", null, rules, [])).toBeNull();
	});

	it("pattern: невалидный regex игнорируется", () => {
		expect(validateCell("abc", null, { pattern: "[unclosed" }, [])).toBeNull();
	});

	it("minLength/maxLength", () => {
		expect(validateCell("ab", null, { minLength: 3 }, [])).toContain("Минимальное");
		expect(validateCell("abc", null, { minLength: 3 }, [])).toBeNull();
		expect(validateCell("abcd", null, { maxLength: 3 }, [])).toContain("Максимальное");
		expect(validateCell("abc", null, { maxLength: 3 }, [])).toBeNull();
	});

	it("unique: дубликат в колонке — ошибка", () => {
		const values = ["alpha", "alpha", "beta"];
		expect(validateCell("alpha", null, { unique: true }, values)).toBe("Значение ячейки должно быть уникальным");
		expect(validateCell("gamma", null, { unique: true }, values)).toBeNull();
	});

	it("правила не проверяются, если значение не изменилось (кроме required)", () => {
		expect(validateCell("ab", "ab", { minLength: 3 }, [])).toBeNull();
		expect(validateCell("", "", { required: true }, [])).toBe("Поле не может быть пустым");
	});
});
