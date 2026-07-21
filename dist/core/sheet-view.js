// ── Слой представления: сортировка и фильтрация ──────────────────────────────
//
// SheetView — прослойка между моделью (SheetModel) и рендерером.
// Управляет rowMap[] — маппингом displayRow → dataRow.
// Поддерживает многоуровневую сортировку (sortStack) и фильтры по колонкам.
export class SheetView {
    constructor(model, totalRows) {
        /** Стек сортировки: первый элемент — первичная сортировка. */
        this.sortStack = [];
        /** Фильтры по колонкам. */
        this.filters = new Map();
        /** displayRow → dataRow (перестраивается при изменении sort/filter). */
        this.rowMap = [];
        this.model = model;
        this._totalRows = totalRows;
        this.rebuild();
    }
    /** Заменить модель (данные). Сортировка/фильтр не сбрасываются. */
    setModel(model) {
        this.model = model;
    }
    /**
     * Обновить общее количество строк (при авто-расширении).
     * Перестраивает rowMap с новым лимитом.
     */
    setTotalRows(n) {
        if (n <= this._totalRows)
            return;
        this._totalRows = n;
        this.rebuild();
    }
    /** Количество строк после фильтрации. */
    get totalRows() {
        return this.rowMap.length;
    }
    /** Преобразовать displayRow в индекс исходной строки данных. */
    dataRow(displayRow) {
        return this.rowMap[displayRow] ?? displayRow;
    }
    /** Получить ячейку через маппинг display → data. */
    get(displayRow, col) {
        return this.model.get(this.dataRow(displayRow), col);
    }
    /** Все уникальные значения колонки (для UI фильтра по значениям). */
    getUniqueValues(col) {
        const seen = new Set();
        for (let r = 0; r < this._totalRows; r++) {
            const v = this.model.get(r, col).value;
            if (v !== null && v !== undefined && v !== "") {
                seen.add(String(v));
            }
        }
        return Array.from(seen).sort();
    }
    /**
     * Установить сортировку для колонки.
     * "none" — убрать из стека, "asc"/"desc" — добавить/обновить.
     */
    setSort(col, direction) {
        this.sortStack = this.sortStack.filter((s) => s.col !== col);
        if (direction === "asc") {
            this.sortStack.push({ col, asc: true });
        }
        else if (direction === "desc") {
            this.sortStack.push({ col, asc: false });
        }
        this.rebuild();
    }
    /** Установить или убрать фильтр для колонки. */
    setFilter(col, filter) {
        if (filter) {
            this.filters.set(col, filter);
        }
        else {
            this.filters.delete(col);
        }
        this.rebuild();
    }
    /** Сбросить и сортировку, и фильтр для колонки. */
    clearColumn(col) {
        this.sortStack = this.sortStack.filter((s) => s.col !== col);
        this.filters.delete(col);
        this.rebuild();
    }
    // ── Приватные ─────────────────────────────────────────────────────────────
    /**
     * Перестроить rowMap:
     * 1. Применить все фильтры (matching строки проходят, остальные — в конец)
     * 2. Отсортировать matching по sortStack
     * 3. Объединить: matching + nonMatching
     */
    rebuild() {
        let matching = Array.from({ length: this._totalRows }, (_, i) => i);
        const nonMatching = [];
        // Фильтрация: для каждого фильтра разделяем matching на прошедшие/непрошедшие
        for (const [col, filter] of this.filters) {
            const nextMatching = [];
            for (const r of matching) {
                const v = this.model.get(r, col).value;
                const isEmpty = v === null || v === undefined || v === "";
                if (isEmpty) {
                    nextMatching.push(r);
                    continue;
                }
                if (filter.op === "values") {
                    if (filter.values?.has(String(v)))
                        nextMatching.push(r);
                    else
                        nonMatching.push(r);
                }
                else {
                    if (matchFilterOp(v, filter))
                        nextMatching.push(r);
                    else
                        nonMatching.push(r);
                }
            }
            matching = nextMatching;
        }
        // Сортировка matching по sortStack (многоуровневая)
        if (this.sortStack.length > 0) {
            matching.sort((a, b) => {
                for (const { col, asc } of this.sortStack) {
                    const va = this.model.get(a, col).value ?? null;
                    const vb = this.model.get(b, col).value ?? null;
                    const aEmpty = va === null || va === undefined || va === "";
                    const bEmpty = vb === null || vb === undefined || vb === "";
                    if (aEmpty && bEmpty)
                        continue;
                    if (aEmpty)
                        return 1; // пустые — в конец
                    if (bEmpty)
                        return -1;
                    const cmp = compareValues(va, vb);
                    if (cmp !== 0)
                        return asc ? cmp : -cmp;
                }
                return a - b; // стабильная сортировка по исходному индексу
            });
        }
        // matching + nonMatching (непрошедшие фильтр — в конец)
        this.rowMap = [...matching, ...nonMatching];
    }
}
// ── Сравнение значений фильтра ───────────────────────────────────────────────
/** Проверить, проходит ли значение условие фильтра. */
function matchFilterOp(v, f) {
    const sv = String(v ?? "");
    const n = Number(sv);
    const isNum = !Number.isNaN(n) && sv.trim() !== "";
    const fv = f.value ?? "";
    const fn = Number(fv);
    const fnum = !Number.isNaN(fn) && fv.trim() !== "";
    switch (f.op) {
        case "eq": return isNum && fnum ? n === fn : sv === fv;
        case "neq": return isNum && fnum ? n !== fn : sv !== fv;
        case "gt": return isNum && fnum ? n > fn : sv > fv;
        case "gte": return isNum && fnum ? n >= fn : sv >= fv;
        case "lt": return isNum && fnum ? n < fn : sv < fv;
        case "lte": return isNum && fnum ? n <= fn : sv <= fv;
        case "between": {
            const fv2 = f.value2 ?? "";
            const fn2 = Number(fv2);
            if (isNum && !Number.isNaN(fn2))
                return n >= fn && n <= fn2;
            return sv >= fv && sv <= fv2;
        }
        default: return true;
    }
}
// ── Компаратор для сортировки ────────────────────────────────────────────────
/** Сравнить два значения: числа как числа, строки через localeCompare. */
function compareValues(a, b) {
    if (a === null || a === undefined)
        return 1;
    if (b === null || b === undefined)
        return -1;
    if (typeof a === "string" && typeof b === "string")
        return a.localeCompare(b);
    if (typeof a === "number" && typeof b === "number")
        return a - b;
    return String(a).localeCompare(String(b));
}
//# sourceMappingURL=sheet-view.js.map