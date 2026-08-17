// ── Конвертация data[] ↔ внутренний формат ─────────────────────────────────

import { cellKey, parseCellKey } from "./cell-addr";
import { flattenColumns } from "./column-tree";
import type { ColumnDef, Cell, ScalarCellValue, DataChange, SaveRow } from "./types";

/** Результат конвертации data[] + ColumnDef[] во внутренний формат NativeSheet. */
export interface DataConvertResult {
	/** Количество строк данных */
	rows: number;
	/** Количество листовых колонок */
	cols: number;
	/** ID строк: rowIds[r] = data[r][rowKey] (временный — для новых строк) */
	rowIds: (string | number)[];
	/** Ячейки: A1-ключ ("C5") → Cell */
	initialData: Record<string, Cell>;
	/** Имена листовых колонок в порядке отображения */
	leafNames: string[];
}

/**
 * Собирает листовые колонки с name и type.
 * Возвращает плоский массив и leafCols.
 */
function leafColumns(columns: ColumnDef[]): { names: string[]; types: Record<string, string> } {
	const flat = flattenColumns(columns);
	const names: string[] = [];
	const types: Record<string, string> = {};
	for (const col of flat.flatColumns) {
		const name = col.name ?? "";
		if (name) {
			names.push(name);
			types[name] = col.type ?? "text";
		}
	}
	return { names, types };
}

/** Преобразовать data[] + ColumnDef[] → внутренний формат */
export function dataToCells(
	data: Record<string, unknown>[],
	columns: ColumnDef[],
	rowKey = "id",
): DataConvertResult {
	const { names, types } = leafColumns(columns);
	const rowIds = data.map((row) => (row[rowKey] ?? generateTempId()) as string | number);
	const cells: Record<string, Cell> = {};

	for (let r = 0; r < data.length; r++) {
		const row = data[r];
		for (let c = 0; c < names.length; c++) {
			const raw = row[names[c]];
			if (raw === undefined) continue;
			const key = cellKey(r, c);
			cells[key] = { value: formatValue(raw, types[names[c]]) };
		}
	}

	return {
		rows: data.length,
		cols: names.length,
		rowIds,
		initialData: cells,
		leafNames: names,
	};
}

/** A1-изменения → структурированные DataChange[] */
export function cellChangesToDataChanges(
	changedCells: Record<string, { old: Cell | null; new: Cell | null }>,
	leafNames: string[],
	rowIds: (string | number)[],
): DataChange[] {
	const result: DataChange[] = [];
	const tempIds = new Map<number, string>();
	for (const [key, { old, new: newCell }] of Object.entries(changedCells)) {
		const parsed = parseCellKey(key);
		if (!parsed || parsed.col >= leafNames.length) continue;
		if (!tempIds.has(parsed.row)) tempIds.set(parsed.row, generateTempId());
		result.push({
			rowId: rowIds[parsed.row] ?? tempIds.get(parsed.row)!,
			columnName: leafNames[parsed.col],
			oldValue: old?.value ?? null,
			newValue: newCell?.value ?? null,
		});
	}
	return result;
}

/** Все ячейки → SaveRow[] */
export function cellsToSaveRows(
	allCells: Record<string, Cell>,
	leafNames: string[],
	rowIds: (string | number)[],
): SaveRow[] {
	const tempIds = new Map<number, string>();
	const rows = new Map<string | number, SaveRow>();

	for (const [key, cell] of Object.entries(allCells)) {
		const parsed = parseCellKey(key);
		if (!parsed || parsed.col >= leafNames.length) continue;
		let rowId: string | number | undefined = rowIds[parsed.row];
		if (rowId === undefined || rowId === null) {
			rowId = tempIds.get(parsed.row);
			if (rowId === undefined) {
				rowId = generateTempId();
				tempIds.set(parsed.row, rowId);
			}
		}
		const colName = leafNames[parsed.col];
		if (!rows.has(rowId)) rows.set(rowId, { rowId, values: {} });
		rows.get(rowId)!.values[colName] = cell.value ?? null;
	}

	return Array.from(rows.values());
}

// ── Хелперы ──────────────────────────────────────────────────────────────────

let _seq = 0;

/** Сгенерировать уникальный временный ID для новой строки (формат: new_timestamp_counter). */
export function generateTempId(): string {
	return "new_" + Date.now() + "_" + (++_seq);
}

/** Является ли rowId временным (новая строка, ещё не сохранённая). */
export function isTempRowId(rowId: string | number): boolean {
	return typeof rowId === "string" && rowId.startsWith("new_");
}

function formatValue(raw: unknown, type: string): ScalarCellValue {
	if (raw === null || raw === undefined) return null;
	if (type === "boolean") return Boolean(raw);
	if (type === "number") {
		const n = Number(raw);
		return Number.isNaN(n) ? String(raw) : n;
	}
	if (type === "array") {
		if (Array.isArray(raw)) return raw as unknown as ScalarCellValue;
		if (typeof raw === "string") return raw.split(",").map((s) => s.trim()) as unknown as ScalarCellValue;
		return [] as unknown as ScalarCellValue;
	}
	if (type === "json") {
		if (typeof raw === "string") {
			try { return JSON.parse(raw) as unknown as ScalarCellValue; }
			catch { return raw as ScalarCellValue; }
		}
		if (typeof raw === "object" && raw !== null) return JSON.stringify(raw) as ScalarCellValue;
		return raw as ScalarCellValue;
	}
	if (type === "date" && typeof raw === "string") {
		const d = new Date(raw);
		return Number.isNaN(d.getTime()) ? raw : raw;
	}
	return raw as ScalarCellValue;
}
