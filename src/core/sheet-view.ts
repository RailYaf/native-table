// ── Слой представления: сортировка и фильтрация ──────────────────────────────
//
// SheetView — прослойка между моделью (SheetModel) и рендерером.
// Управляет rowMap[] — маппингом displayRow → dataRow.
// Поддерживает многоуровневую сортировку (sortStack) и фильтры по колонкам.

import type { SheetModel } from "./model";
import type { Cell, ColumnFilter, FilterOp, ScalarCellValue, SortDirection, SortEntry } from "../utils/types";

export class SheetView {
	private model: SheetModel;
	private _totalRows: number;

	/** Граница данных: строки с индексом < _dataRowCount — реальные данные, остальные — свободные строки бесконечного скролла. */
	private _dataRowCount: number;

	/** Строки, только что вставленные и временно исключённые из фильтрации. */
	private _freshRows = new Set<number>();

	/** Стек сортировки: первый элемент — первичная сортировка. */
	sortStack: SortEntry[] = [];

	/** Фильтры по колонкам. */
	filters = new Map<number, ColumnFilter>();

	/** displayRow → dataRow (перестраивается при изменении sort/filter). */
	rowMap: number[] = [];

	/** При true rebuild() не применяет сортировку/фильтр (для server-side пагинации). */
	skipSortFilter = false;

	constructor(model: SheetModel, totalRows: number) {
		this.model = model;
		this._totalRows = totalRows;
		this._dataRowCount = totalRows;
		this.rebuild();
	}

	/** Заменить модель (данные). Сортировка/фильтр не сбрасываются. */
	setModel(model: SheetModel): void {
		this.model = model;
	}

	/** Обновить общее количество строк (при авто-расширении).
	 * Перестраивает rowMap с новым лимитом. */
	setTotalRows(n: number): void {
		if (n <= this._totalRows) return;
		this._totalRows = n;
		this.rebuild();
	}

	/** Количество строк после фильтрации. */
	get totalRows(): number {
		return this.rowMap.length;
	}

	/** Преобразовать displayRow в индекс исходной строки данных. */
	dataRow(displayRow: number): number {
		return this.rowMap[displayRow] ?? displayRow;
	}

	/** Получить ячейку через маппинг display → data. */
	get(displayRow: number, col: number): Cell {
		return this.model.get(this.dataRow(displayRow), col);
	}

	/** Все уникальные значения колонки (для UI фильтра по значениям). */
	getUniqueValues(col: number): string[] {
		const seen = new Set<string>();
		const limit = Math.min(this._totalRows, this._dataRowCount);
		for (let r = 0; r < limit; r++) {
			const v = this.model.get(r, col).value;
			if (isBlank(v)) continue;
			const sv = (typeof v === "object" && v !== null && !Array.isArray(v))
				? JSON.stringify(v)
				: String(v);
			if (sv !== "") seen.add(sv);
		}
		return Array.from(seen).sort();
	}

	/**
	 * Установить сортировку для колонки.
	 * "none" — убрать из стека, "asc"/"desc" — добавить/обновить.
	 */
	setSort(col: number, direction: SortDirection): void {
		this.applySort(col, direction);
		this.rebuild();
	}

	/** Установить или убрать фильтр для колонки. */
	setFilter(col: number, filter: ColumnFilter | null): void {
		this._freshRows.clear();
		this.applyFilter(col, filter);
		this.rebuild();
	}

	/** Установить сортировку и фильтр колонки за одну перестройку rowMap. */
	setSortAndFilter(col: number, direction: SortDirection, filter: ColumnFilter | null): void {
		this._freshRows.clear();
		this.applySort(col, direction);
		this.applyFilter(col, filter);
		this.rebuild();
	}

	/** Сбросить и сортировку, и фильтр для колонки. */
	clearColumn(col: number): void {
		this._freshRows.clear();
		this.applySort(col, "none");
		this.applyFilter(col, null);
		this.rebuild();
	}

	/** Текущее направление сортировки колонки. */
	sortOf(col: number): SortDirection {
		const entry = this.sortStack.find((s) => s.col === col);
		if (!entry) return "none";
		return entry.asc ? "asc" : "desc";
	}

	/** Порядковый номер колонки в стеке сортировки (-1 — не сортируется). */
	sortIndex(col: number): number {
		return this.sortStack.findIndex((s) => s.col === col);
	}

	/** Принудительно перестроить rowMap (после смены модели или структуры строк). */
	forceRebuild(): void {
		this.rebuild();
	}

	/** Сдвинуть границу данных при вставке/удалении строк. */
	shiftDataRowCount(delta: number): void {
		this._dataRowCount = Math.max(0, this._dataRowCount + delta);
	}

	/** Пометить строку как только что вставленную — она не будет скрыта фильтром. */
	markRowFresh(row: number): void {
		this._freshRows.add(row);
	}

	// ── Сериализация состояния (для undo/redo) ────────────────────────────────

	/** Снимок сортировки и фильтров. */
	snapshot(): string {
		return JSON.stringify({
			sort: this.sortStack.map((s) => ({ col: s.col, asc: s.asc })),
			filters: Array.from(this.filters.entries()).map(([col, f]) => ({
				col,
				op: f.op,
				value: f.value,
				value2: f.value2,
				values: f.values ? Array.from(f.values) : undefined,
			})),
		});
	}

	/** Восстановить сортировку и фильтры из снимка. */
	restore(snapshot: string): void {
		const state = JSON.parse(snapshot) as {
			sort: Array<{ col: number; asc: boolean }>;
			filters: Array<{ col: number; op: FilterOp; value?: string; value2?: string; values?: string[] }>;
		};
		this.sortStack = state.sort.map((s) => ({ col: s.col, asc: s.asc }));
		this.filters.clear();
		for (const f of state.filters) {
			const filter: ColumnFilter = { op: f.op, value: f.value, value2: f.value2 };
			if (f.values) filter.values = new Set(f.values);
			this.filters.set(f.col, filter);
		}
		this.rebuild();
	}

	private applySort(col: number, direction: SortDirection): void {
		this.sortStack = this.sortStack.filter((s) => s.col !== col);
		if (direction === "asc") this.sortStack.push({ col, asc: true });
		else if (direction === "desc") this.sortStack.push({ col, asc: false });
	}

	private applyFilter(col: number, filter: ColumnFilter | null): void {
		if (filter) this.filters.set(col, filter);
		else this.filters.delete(col);
	}

	// ── Приватные ─────────────────────────────────────────────────────────────

	/**
	 * Перестроить rowMap:
	 * 1. Оставить строки, прошедшие все фильтры (остальные скрыты)
	 * 2. Отсортировать их по sortStack (многоуровневая сортировка)
	 *
	 * Фильтрация применяется только к реальным данным (r < _dataRowCount);
	 * свободные строки бесконечного скролла проходят всегда.
	 * Пустая ячейка внутри данных не проходит ни один фильтр (включая «не равно»).
	 */
	private rebuild(): void {
		// Быстрый путь: нет ни сортировки, ни фильтров — тождественный маппинг
		if (this.sortStack.length === 0 && this.filters.size === 0) {
			this.rowMap = Array.from({ length: this._totalRows }, (_, i) => i);
			return;
		}

		// Server-side режим: sortStack/filters хранятся только для отображения индикаторов,
		// данные приходят уже отсортированными/отфильтрованными с сервера
		if (this.skipSortFilter) {
			this.rowMap = Array.from({ length: this._totalRows }, (_, i) => i);
			return;
		}

		let matching: number[] = Array.from({ length: this._totalRows }, (_, i) => i);

		for (const [col, filter] of this.filters) {
			matching = matching.filter((r) => {
				// Свободные строки (за границей данных) и только что вставленные проходят всегда
				if (r >= this._dataRowCount || this._freshRows.has(r)) return true;
				const v = this.model.get(r, col).value ?? null;
				// Пустая ячейка внутри данных не проходит фильтр
				if (isBlank(v)) return false;
				if (filter.op === "values") return filter.values?.has(String(v)) ?? true;
				return matchFilterOp(v, filter);
			});
		}

		if (this.sortStack.length > 0) {
			const columns = this.sortStack.map(({ col, asc }) => {
				const values = new Map<number, ScalarCellValue>();
				for (const r of matching) values.set(r, this.model.get(r, col).value ?? null);
				return { asc, values };
			});

			matching.sort((a, b) => {
				for (const { asc, values } of columns) {
					const va = values.get(a) ?? null;
					const vb = values.get(b) ?? null;
					const aEmpty = isBlank(va);
					const bEmpty = isBlank(vb);
					if (aEmpty && bEmpty) continue;
					if (aEmpty) return 1; // пустые — всегда в конец
					if (bEmpty) return -1;
					const cmp = compareValues(va, vb);
					if (cmp !== 0) return asc ? cmp : -cmp;
				}
				return a - b; // стабильная сортировка по исходному индексу
			});
		}

		this.rowMap = matching;
	}
}

/** Значение считается пустым (не участвует в сравнении и проходит любой фильтр). */
function isBlank(v: ScalarCellValue | undefined): boolean {
	return v === null || v === undefined || v === "";
}

// ── Сравнение значений фильтра ───────────────────────────────────────────────

/** Проверить, проходит ли значение условие фильтра. */
function matchFilterOp(v: ScalarCellValue, f: ColumnFilter): boolean {
	const sv = String(v ?? "");
	const n = Number(sv);
	const isNum = !Number.isNaN(n) && sv.trim() !== "";
	const fv = f.value ?? "";
	const fn = Number(fv);
	const fnum = !Number.isNaN(fn) && fv.trim() !== "";

	switch (f.op) {
		case "eq": {
			if (f.values?.size) return f.values.has(sv);
			return isNum && fnum ? n === fn : sv === fv;
		}
		case "neq": {
			if (f.values?.size) return !f.values.has(sv);
			return isNum && fnum ? n !== fn : sv !== fv;
		}
		case "gt": return isNum && fnum ? n > fn : sv > fv;
		case "gte": return isNum && fnum ? n >= fn : sv >= fv;
		case "lt": return isNum && fnum ? n < fn : sv < fv;
		case "lte": return isNum && fnum ? n <= fn : sv <= fv;
		case "between": {
			const fv2 = f.value2 ?? "";
			const fn2 = Number(fv2);
			if (isNum && !Number.isNaN(fn2)) return n >= fn && n <= fn2;
			return sv >= fv && sv <= fv2;
		}
		case "mask": return matchesSimilarToMaskMulti(sv, fv, f.values, false);
		case "nmask": return !matchesSimilarToMaskMulti(sv, fv, f.values, false);
		case "imask": return matchesSimilarToMaskMulti(sv, fv, f.values, true);
		case "nimask": return !matchesSimilarToMaskMulti(sv, fv, f.values, true);
		default: return true;
	}
}

// ── Компаратор для сортировки ────────────────────────────────────────────────

/**
 * Сравнить два значения: числа (в т.ч. записанные строкой) — как числа,
 * boolean — как 0/1, остальное — через localeCompare.
 */
function compareValues(a: ScalarCellValue, b: ScalarCellValue): number {
	if (a === null || a === undefined) return 1;
	if (b === null || b === undefined) return -1;
	if (typeof a === "number" && typeof b === "number") return a - b;
	if (typeof a === "boolean" || typeof b === "boolean") return Number(a) - Number(b);
	if (Array.isArray(a) && Array.isArray(b)) {
		const diff = a.length - b.length;
		return diff !== 0 ? diff : String(a).localeCompare(String(b));
	}

	const sa = String(a);
	const sb = String(b);
	const na = Number(sa);
	const nb = Number(sb);
	// "10" и "9" должны сравниваться как числа, а не лексикографически
	if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
	return sa.localeCompare(sb);
}

// ── Маска (SQL SIMILAR TO) ──────────────────────────────────────────────────

const SIMILAR_TO_CHARS = new Set(["|", "(", ")"]);

/** Конвертировать SQL SIMILAR TO маску в RegExp. */
function similarToMaskToRegExp(pattern: string, ignoreCase: boolean): RegExp | null {
	let regex = "^";
	for (const ch of pattern) {
		if (ch === "%") { regex += ".*"; continue; }
		if (ch === "_") { regex += "."; continue; }
		if (SIMILAR_TO_CHARS.has(ch)) { regex += ch; continue; }
		regex += ch.replace(/[.*+?^${}[\]\\]/g, "\\$&");
	}
	regex += "$";
	try { return new RegExp(regex, ignoreCase ? "i" : undefined); }
	catch { return null; }
}

/** Проверить значение на соответствие SQL SIMILAR TO маске. */
function matchesSimilarToMask(value: string, pattern: string, ignoreCase: boolean): boolean {
	const re = similarToMaskToRegExp(pattern, ignoreCase);
	return re ? re.test(value) : false;
}

/** Multi-value версия: если есть набор patterns — OR-логика, иначе один pattern. */
function matchesSimilarToMaskMulti(value: string, pattern: string, values: Set<string> | undefined, ignoreCase: boolean): boolean {
	if (values?.size) return Array.from(values).some((p) => matchesSimilarToMask(value, p, ignoreCase));
	return matchesSimilarToMask(value, pattern, ignoreCase);
}
