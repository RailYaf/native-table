import type { ColumnDef, ScalarCellValue } from "./types";

// ── Утилиты для работы с типами колонок ──────────────────────────────────────

/**
 * Форматирует значение ячейки для отображения:
 * - boolean: "Да" / "Нет"
 * - number: с учётом decimals
 * - select: label вместо value
 * - date: YYYY-MM-DD → DD.MM.YYYY
 * - datetime: YYYY-MM-DDTHH:MM → DD.MM.YYYY HH:MM
 */
export function formatCellDisplay(
	value: ScalarCellValue,
	colDef?: ColumnDef,
): string {
	// «Не определено» — только для nullable boolean (три состояния), иначе пусто
	if (value === null || value === undefined) {
		return colDef?.nullable && (colDef?.type ?? "text") === "boolean" ? "Не определено" : "";
	}

	const type = colDef?.type ?? "text";

	switch (type) {
		case "boolean":
			if (value === true || value === "true" || value === 1) return "Да";
			if (value === false || value === "false" || value === 0) return "Нет";
			return "";

		case "number": {
			const num = typeof value === "number" ? value : Number(value);
			if (Number.isNaN(num)) return String(value);
			if (colDef?.decimals !== undefined) return num.toFixed(colDef.decimals);
			return String(num);
		}

		case "select": {
			if (!colDef?.options) return String(value);
			const found = colDef.options.find(
				(o) => String(o.value) === String(value),
			);
			return found?.label ?? String(value);
		}

		case "date": {
			if (typeof value !== "string" || !value) return "";
			// Бэк может прислать полный ISO (2026-06-10T00:00:00) — берём только дату
			const datePart = value.slice(0, 10);
			const parts = datePart.split("-");
			if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
			return value;
		}

		case "datetime": {
			if (typeof value !== "string" || !value) return "";
			const datePart = value.slice(0, 10);
			const timePart = value.slice(11, 16);
			const parts = datePart.split("-");
			if (parts.length === 3 && timePart.length === 5) {
				return `${parts[2]}.${parts[1]}.${parts[0]} ${timePart}`;
			}
			return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : value;
		}

		case "array":
			if (Array.isArray(value)) return value.join(", ");
			return String(value);

		case "json":
			if (value === null || value === undefined) return "";
			try { return typeof value === "string" ? value : JSON.stringify(value); }
			catch { return String(value); }

		default:
			return String(value);
	}
}

/**
 * Возвращает текстовое представление значения для поля ввода при редактировании.
 * Для number — очищает NaN, для остальных — приводит к строке.
 */
export function getEditValue(
	value: ScalarCellValue,
	colDef?: ColumnDef,
): string {
	if (value === null || value === undefined) return "";
	const type = colDef?.type ?? "text";
	if (type === "number") {
		const num = typeof value === "number" ? value : Number(value);
		return Number.isNaN(num) ? "" : String(num);
	}
	return String(value);
}

/**
 * Возвращает выравнивание ячейки:
 * 1) Явно заданное в ColumnDef.align
 * 2) По умолчанию на основе типа: boolean → center, остальные → left.
 */
export function getCellAlign(colDef?: ColumnDef): "left" | "center" | "right" {
	if (colDef?.align) return colDef.align;
	const type = colDef?.type ?? "text";
	switch (type) {
		case "boolean":
			return "center";
		default:
			return "left";
	}
}

/** Проверяет, заблокирована ли колонка для редактирования. */
export function isReadOnly(colDef?: ColumnDef): boolean {
	return colDef?.readOnly === true;
}

/** Проверяет, является ли тип колонки boolean. */
export function isBoolean(colDef?: ColumnDef): boolean {
	return (colDef?.type ?? "text") === "boolean";
}

/** Получить значение по умолчанию для нового типа. */
export function getTypeDefault(colDef?: ColumnDef): ScalarCellValue {
	const type = colDef?.type ?? "text";
	if (type === "boolean") return false;
	if (type === "number") return null;
	if (type === "array") return [];
	if (type === "json") return null;
	return "";
}
