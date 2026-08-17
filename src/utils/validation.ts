// ── Клиентская валидация ──────────────────────────────────────────────────────

import type { ScalarCellValue, ValidationRules } from "./types";

/**
 * Проверить значение ячейки по правилам валидации.
 * @returns сообщение об ошибке или null (значение валидно).
 */
export function validateCell(
	value: ScalarCellValue,
	oldValue: ScalarCellValue,
	rules: ValidationRules,
	allColumnValues: ScalarCellValue[],
): string | null {
	// required — проверяется всегда, независимо от изменения
	if (rules.required === true && (value === null || value === undefined || value === "")) {
		return "Поле не может быть пустым";
	}

	// Остальные правила — только если значение изменилось
	if (value === oldValue) return null;

	const sv = String(value ?? "");

	if (rules.minLength !== null && rules.minLength !== undefined && sv.length < rules.minLength) {
		return `Минимальное количество символов — ${rules.minLength}`;
	}

	if (rules.maxLength !== null && rules.maxLength !== undefined && sv.length > rules.maxLength) {
		return `Максимальное количество символов — ${rules.maxLength}`;
	}

	if (rules.unique === true) {
		const other = allColumnValues.filter((v) => String(v ?? "") === sv);
		if (other.length > 1) {
			return "Значение ячейки должно быть уникальным";
		}
	}

	if (rules.pattern) {
		try {
			if (!new RegExp(rules.pattern).test(sv)) {
				return rules.patternMessage ?? "Не соответствует шаблону";
			}
		} catch {
			// невалидный regex — пропускаем
		}
	}

	return null;
}
