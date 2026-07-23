// ── Виртуальный рендерер таблицы ─────────────────────────────────────────────
//
// Рендерит только видимые строки и колонки (+ буфер BUFFER_ROWS/BUFFER_COLS).
// DOM-структура (все элементы позиционируются через position: absolute):
//
//   .nt-container (flex column)
//     └─ .nt-root (position: relative)
//          ├─ .nt-corner      — угловая кнопка «выделить всё»
//          ├─ .nt-header-row  — заголовки колонок (фиксированы по Y, скроллятся по X)
//          ├─ .nt-header-col  — заголовки строк (фиксированы по X, скроллятся по Y)
//          └─ .nt-inner       — общий контейнер тела таблицы
//               └─ .nt-body   — скролл-вьюпорт (overflow: auto)
//                    └─ .nt-cells-layer — слой с ячейками
//                         ├─ .nt-row (строка) → .nt-cell (ячейки)
//                         ├─ .nt-range      (оверлей выделения)
//                         └─ .nt-editor     (редактор)

import { colToLetter } from "../utils/cell-addr";
import { formatCellDisplay, getCellAlign } from "../utils/column-utils";
import {
	BUFFER_COLS,
	BUFFER_ROWS,
	DEFAULT_COL_WIDTH,
	DEFAULT_ROW_HEIGHT,
	EXPAND_COLS_BY,
	EXPAND_ROWS_BY,
	HEADER_ROW_HEIGHT,
	HEADER_WIDTH,
	OVERSCAN_COLS,
	OVERSCAN_ROWS,
} from "../utils/consts";
import type { HeaderCell } from "../utils/column-tree";
import { flattenColumns } from "../utils/column-tree";
import type { SheetModel } from "./model";
import type { Cell, ColumnDef } from "../utils/types";

interface RowElementPool {
	row: number;
	el: HTMLDivElement;
	cells: HTMLDivElement[];
}

export class Renderer {
	/** Контейнер .nt-root — position: relative, сюда вложены все слои */
	readonly container: HTMLDivElement;
	/** Скролл-вьюпорт — overflow: auto, настоящий скроллбар */
	readonly bodyDiv: HTMLDivElement;
	/** Слой ячеек, оверлея и редактора */
	cellsLayer: HTMLDivElement;

	private inner: HTMLDivElement;       // .nt-inner — общий контейнер тела (задаёт totalHeight)
	private headerRow: HTMLDivElement;    // .nt-header-row(s) — контейнер заголовков колонок
	private headerRows: HTMLDivElement[] = []; // строки шапки (многоуровневая)
	private headerCol: HTMLDivElement;    // .nt-header-col — заголовки строк (фиксированы)
	private corner: HTMLDivElement;       // .nt-corner — кнопка «выделить всё»
	private rows: RowElementPool[] = [];  // пул видимых строк (переиспользуются при скролле)
	private headerGrid: HeaderCell[] = []; // сетка ячеек шапки (из flattenColumns)
	private maxDepth = 1;                  // глубина иерархии колонок
	private headerH = 28;                  // общая высота шапки = maxDepth * HEADER_ROW_HEIGHT
	private colWidths: number[];          // ширина каждой колонки
	private colLeftCache: number[] = [];  // префикс-суммы: colLeft(col) = colLeftCache[col]
	private rowHeights: number[] = [];    // высота каждой строки (может различаться)
	private rowTopCache: number[] = [];   // префикс-суммы: rowTop(row) = rowTopCache[row]
	private currentStartRow = 0;          // текущее окно виртуализации
	private currentEndRow = -1;
	private currentStartCol = 0;
	private currentEndCol = -1;
	private onScrollCallback?: () => void;
	/** Колбэк при расширении rows/cols (чтобы уведомить SheetView). */
	onExpand?: () => void;
	private onScrollHandler: () => void;
	private model: SheetModel;
	private columns: ColumnDef[];
	/** Маппинг для сортировки/фильтрации: displayRow → dataRow */
	rowMap: number[] = [];
	/** Базовое количество строк (без учёта фильтра) */
	baseRowCount: number;
	/** Исходное количество строк (до overscan) — для маркировки фантомных */
	initialRowCount = 0;
	/** Есть ли явно заданные колонки (не дефолтный режим A,B,C...) */
	hasExplicitColumns = false;
	/** Количество data-колонок (без фантомных) */
	dataColCount = 0;
	/** Разрешить добавление новых строк при скролле */
	allowAddRows = true;
	/** Таблица только для чтения */
	readonlyTable = false;
	/** Перенос текста в заголовках */
	headerWrap = false;
	/** Индексы заблокированных строк */
	disabledRows: Set<number> = new Set();
	/** Ошибки валидации: cellKey → список сообщений */
	validationErrors: Record<string, string[]> = {};
	/** Ширины из IndexedDB (восстанавливаются после setColumns) */
	initialWidths: Record<string, number> = {};
	selectedRect?: import("../utils/types").SelectionRect;

	constructor(
		container: HTMLDivElement,
		model: SheetModel,
		public totalRows: number,
		public totalCols: number,
		colWidth = DEFAULT_COL_WIDTH,
		rowH = DEFAULT_ROW_HEIGHT,
		columns: ColumnDef[] = [],
		allowAddRows = true,
		readonlyTable = false,
	) {
		this.rowHeights = new Array(totalRows).fill(rowH);
		this.rebuildRowTopCache();
		this.container = container;
		this.model = model;
		this.columns = columns;
		this.allowAddRows = allowAddRows;
		this.readonlyTable = readonlyTable;

		// Развернуть иерархию колонок (если есть children)
		const flat = flattenColumns(columns);
		this.columns = flat.flatColumns;
		this.headerGrid = flat.headerGrid;
		this.maxDepth = flat.maxDepth || 1;
		this.headerH = this.maxDepth * HEADER_ROW_HEIGHT;
		this.totalCols = this.columns.length; // листовые колонки = data-колонки
		this.hasExplicitColumns = columns.length > 0;
		this.dataColCount = this.totalCols;

		this.baseRowCount = totalRows;
		this.initialRowCount = totalRows;
		this.rowMap = Array.from({ length: totalRows }, (_, i) => i);
		// Инициализация ширин: берём из ColumnDef, если задана, иначе defaultColWidth
		this.colWidths = Array.from(
			{ length: this.totalCols },
			(_, i) => this.columns[i]?.width ?? colWidth,
		);
		this.rebuildColLeftCache();
		if (!this.hasExplicitColumns) this.ensureCols(this.totalCols);
		if (this.allowAddRows) this.ensureRows(this.baseRowCount);
		container.classList.add("nt-root");

		this.corner = document.createElement("div");
		this.corner.className = "nt-corner";
		applyStyle(this.corner, {
			position: "absolute",
			top: "0",
			left: "0",
			width: `${HEADER_WIDTH}px`,
			height: `${this.headerH}px`,
			zIndex: String(6 + this.maxDepth),
		});
		container.append(this.corner);

		// ── Column-header rows (top, fixed, left:HW) ──────────────────────
		for (let r = 0; r < this.maxDepth; r++) {
			const row = document.createElement("div");
			row.className = "nt-header-row";
			applyStyle(row, {
				position: "absolute",
				top: `${r * HEADER_ROW_HEIGHT}px`,
				left: "0",
				right: "0",
				height: `${HEADER_ROW_HEIGHT}px`,
				overflow: "visible",
				zIndex: String(5 + (this.maxDepth - r)),
			});
			container.append(row);
			this.headerRows.push(row);
		}
		this.headerRow = this.headerRows[0]; // for backward compat

		// ── Row-number column (left, fixed, top:HH) ───────────────────────
		this.headerCol = document.createElement("div");
		this.headerCol.className = "nt-header-col";
		applyStyle(this.headerCol, {
			position: "absolute",
			top: `${this.headerH}px`,
			left: "0",
			bottom: "0",
			width: `${HEADER_WIDTH}px`,
			overflow: "hidden",
			zIndex: "7",
		});
		container.append(this.headerCol);

		// ── Body scroll viewport ──────────────────────────────────────────
		this.bodyDiv = document.createElement("div");
		this.bodyDiv.className = "nt-body";
		applyStyle(this.bodyDiv, {
			position: "absolute",
			top: `${this.headerH}px`,
			left: "0",
			right: "0",
			bottom: "0",
			overflow: "auto",
		});
		container.append(this.bodyDiv);

		// ── Scroll-content sizer ──────────────────────────────────────────
		this.inner = document.createElement("div");
		this.inner.className = "nt-inner";
		applyStyle(this.inner, {
			position: "relative",
			width: `${this.totalWidth()}px`,
			height: `${this.totalHeight()}px`,
		});
		this.bodyDiv.append(this.inner);

		// ── Cell canvas (absolute at 0,0 within inner) ────────────────────
		this.cellsLayer = document.createElement("div");
		this.cellsLayer.className = "nt-cells";
		applyStyle(this.cellsLayer, {
			position: "absolute",
			top: "0",
			left: `${HEADER_WIDTH}px`,
			width: `${this.totalWidth()}px`,
			height: `${this.totalHeight()}px`,
		});
		this.inner.append(this.cellsLayer);

		this.onScrollHandler = () => {
			this.autoExpand();
			this.render();
			this.onScrollCallback?.();
		};
		this.bodyDiv.addEventListener("scroll", this.onScrollHandler, {
			passive: true,
		});
	}

	// ──────────────────────────────────────────────────────────────────────
	// Public API
	// ──────────────────────────────────────────────────────────────────────

	setOnScroll(cb: () => void): void {
		this.onScrollCallback = cb;
	}

	setModel(model: SheetModel): void {
		this.model = model;
		this.render(true);
	}

	setColumns(columns: ColumnDef[]): void {
		const flat = flattenColumns(columns);
		this.columns = flat.flatColumns;
		this.headerGrid = flat.headerGrid;
		this.maxDepth = flat.maxDepth || 1;
		this.totalCols = this.columns.length;
		this.hasExplicitColumns = columns.length > 0;
		this.dataColCount = this.totalCols;
		this.colWidths = Array.from({ length: this.totalCols }, (_, i) => this.columns[i]?.width ?? DEFAULT_COL_WIDTH);
		if (!this.hasExplicitColumns) this.ensureCols(this.totalCols);
		this.rebuildColLeftCache();
		// Восстановить ширины из IndexedDB (только в пределах текущих колонок)
		for (const [c, w] of Object.entries(this.initialWidths)) {
			const idx = Number(c);
			if (idx < this.totalCols) this.colWidths[idx] = Math.max(30, w);
		}
		// Очистить старые DOM-ячейки (могли остаться от overscan)
		this.render(true);
	}

	private dataRow(displayRow: number): number {
		return this.rowMap[displayRow] ?? displayRow;
	}

	/** Количество строк после фильтрации. */
	visibleRowCount(): number {
		return this.rowMap.length;
	}

	/** Описание колонки по индексу. */
	getColumn(col: number): ColumnDef | undefined {
		const def = this.columns[col];
		if (def) return def;
		if (this.hasExplicitColumns) return { type: "text", readOnly: true };
		return undefined;
	}

	/** Подсветка заголовков строк/столбцов, попадающих в выделение */
	highlightHeaders(selection: import("../utils/types").SelectionRect): void {
		if (!selection.start || !selection.end) return;
		const sr = Math.min(selection.start.row, selection.end.row);
		const er = Math.max(selection.start.row, selection.end.row);
		const sc = Math.min(selection.start.col, selection.end.col);
		const ec = Math.max(selection.start.col, selection.end.col);

		for (const row of this.headerRows) {
			for (const el of Array.from(row.children)) {
				const cell = el as HTMLDivElement;
				if (cell.style.display === "none") continue;
				const col = Number(cell.dataset.col);
				const span = Number(cell.dataset.colSpan) || 1;
				const cellEnd = col + span - 1;
				cell.classList.toggle("nt-header-cell--selected", col <= ec && cellEnd >= sc);
			}
		}
		for (const el of Array.from(this.headerCol.children)) {
			const cell = el as HTMLDivElement;
			if (cell.style.display === "none") continue;
			const row = Number(cell.dataset.row);
			cell.classList.toggle("nt-header-cell--selected", row >= sr && row <= er);
		}
	}

	destroy(): void {
		this.bodyDiv.removeEventListener("scroll", this.onScrollHandler);
		this.container.innerHTML = "";
		this.container.classList.remove("nt-root");
		this.rows = [];
	}

	/** Получить (или задать через setRowHeight) индивидуальную высоту строки. */
	getRowHeight(row?: number): number {
		return row !== undefined ? (this.rowHeights[row] ?? DEFAULT_ROW_HEIGHT) : DEFAULT_ROW_HEIGHT;
	}

	/** Левая граница колонки в пикселях (префикс-сумма). */
	colLeft(col: number): number {
		return this.colLeftCache[col] ?? 0;
	}

	/** Верхняя граница строки в пикселях (префикс-сумма). */
	rowTop(row: number): number {
		return this.rowTopCache[row] ?? 0;
	}

	/** Установить ширину колонки (мин. 30px). Перестраивает colLeftCache и ширины контейнеров. */
	setColWidth(col: number, width: number): void {
		if (this.hasExplicitColumns && col >= this.dataColCount) return;
		this.colWidths[col] = Math.max(30, width);
		this.rebuildColLeftCache();
	}

	getColWidth(col: number): number {
		return this.colWidths[col];
	}

	/** Установить высоту одной строки (мин. 20px). Перестраивает rowTopCache. */
	setRowHeight(row: number, h: number): void {
		this.rowHeights[row] = Math.max(20, h);
		this.rebuildRowTopCache();
		this.updateContainerSizes();
		this.render(true);
	}

	/** Перестроить кеш rowTopCache — префикс-суммы высот строк для бинарного поиска. */
	private rebuildRowTopCache(): void {
		this.rowTopCache = new Array(this.rowHeights.length + 1).fill(0);
		for (let i = 0; i < this.rowHeights.length; i++) {
			this.rowTopCache[i + 1] = this.rowTopCache[i] + this.rowHeights[i];
		}
	}

	/** Кеш высот строк (копия, чтобы не мутировали снаружи). */
	getRowHeights(): number[] { return [...this.rowHeights]; }
	/** Установить массив высот (после загрузки из IndexedDB). */
	setRowHeights(heights: number[]): void {
		this.ensureRows(heights.length - 1);
		for (let r = 0; r < Math.min(heights.length, this.totalRows); r++) {
			this.rowHeights[r] = Math.max(20, heights[r]);
		}
		this.rebuildRowTopCache();
		this.updateContainerSizes();
		this.render(true);
	}

	/** Гарантировать, что существует как минимум строка с индексом `row`. */
	ensureRows(row: number): void {
		if (row < this.totalRows) return;
		const needed = row + 1 + OVERSCAN_ROWS;
		while (this.rowHeights.length < needed) {
			this.rowHeights.push(DEFAULT_ROW_HEIGHT);
		}
		const oldTotal = this.totalRows;
		this.totalRows = this.rowHeights.length;
		for (let i = oldTotal; i < this.totalRows; i++) {
			this.rowMap.push(i);
		}
		this.baseRowCount = this.totalRows;
		this.rebuildRowTopCache();
		this.onExpand?.();
	}

	/** Гарантировать, что существует как минимум колонка с индексом `col`. */
	ensureCols(col: number): void {
		if (col < this.totalCols) return;
		const needed = col + 1 + OVERSCAN_COLS;
		while (this.colWidths.length < needed) {
			this.colWidths.push(DEFAULT_COL_WIDTH);
		}
		this.totalCols = this.colWidths.length;
		this.rebuildColLeftCache();
	}


	/**
	 * Автоматически расширить строки/колонки при скролле к границе.
	 * Вызывается на каждое событие скролла.
	 */
	private autoExpand(): void {
		const { scrollTop, scrollLeft, clientHeight, clientWidth } = this.bodyDiv;
		const viewBottom = scrollTop + clientHeight;
		const viewRight = scrollLeft + clientWidth;

		// Расширить строки вниз, если скролл вплотную к концу
		const lastRowTop = this.rowTop(this.totalRows);
		// Расширить строки вниз, если скролл вплотную к концу (только если allowAddRows)
		if (this.allowAddRows) {
			if (viewBottom + clientHeight > lastRowTop) {
				this.ensureRows(this.totalRows + EXPAND_ROWS_BY - 1);
			}
		}

		// Расширить колонки вправо (только без явных колонок)
		if (!this.hasExplicitColumns) {
			const lastColLeft = this.colLeft(this.totalCols);
			if (viewRight + clientWidth > lastColLeft) {
				this.ensureCols(this.totalCols + EXPAND_COLS_BY - 1);
			}
		}
	}

	/** Обновить размеры всех контейнеров (после изменения totalHeight/totalWidth). */
	updateContainerSizes(): void {
		const h = this.totalHeight();
		const w = this.totalWidth();
		this.inner.style.height = `${this.allowAddRows ? this.headerH + h : h}px`;
		this.inner.style.width = `${HEADER_WIDTH + w}px`;
		this.cellsLayer.style.height = `${h}px`;
		this.cellsLayer.style.width = `${w}px`;
		this.headerCol.style.height = `${h}px`;
		this.headerRow.style.width = `${w}px`;
		for (const row of this.headerRows) {
			row.style.width = `${w}px`;
		}
	}

	/** Общая ширина всех колонок (для задания размеров контейнеров). */
	totalWidth(): number {
		return this.colLeftCache[this.totalCols] ?? 0;
	}

	/** Общая высота всех строк (для скролл-вьюпорта). */
	totalHeight(): number {
		return this.rowTopCache[this.visibleRowCount()] ?? 0;
	}

	/** Обновить height всех контейнеров после изменения rowMap */
	updateLayout(): void {
		this.updateContainerSizes();
		this.render(true);
	}

	/**
	 * Определить, в какой ячейке находится точка (offsetX, offsetY)
	 * относительно bodyDiv. Учитывает скролл.
	 */
	cellAt(
		offsetX: number,
		offsetY: number,
	): { row: number; col: number } | null {
		const bodyX = offsetX + this.bodyDiv.scrollLeft - HEADER_WIDTH;
		const bodyY = offsetY + this.bodyDiv.scrollTop;
		const col = Math.min(
			Math.max(0, this.findColByOffset(Math.max(bodyX, 0))),
			this.colWidths.length - 1,
		);
		const row = Math.min(
			Math.max(0, this.rowIndexAt(Math.max(bodyY, 0))),
			this.visibleRowCount() - 1,
		);
		return { row, col };
	}

	/** Линейный поиск колонки по смещению X. */
	private findColByOffset(bodyX: number): number {
		let remaining = bodyX;
		for (let c = 0; c < this.colWidths.length; c++) {
			if (remaining < this.colWidths[c]) return c;
			remaining -= this.colWidths[c];
		}
		return this.colWidths.length - 1;
	}

	/** Бинарный поиск строки по смещению Y (использует rowTopCache). */
	private rowIndexAt(bodyY: number): number {
		if (bodyY <= 0) return 0;
		let lo = 0, hi = this.visibleRowCount();
		while (lo < hi) {
			const mid = Math.floor((lo + hi) / 2);
			if (this.rowTop(mid + 1) <= bodyY) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	bodyBox(
		row: number,
		col: number,
	): { left: number; top: number; width: number; height: number } {
		return {
			left: this.colLeft(col),
			top: this.rowTop(row),
			width: this.colWidths[col],
			height: this.getRowHeight(row),
		};
	}

	/**
	 * Прокрутить вьюпорт так, чтобы ячейка была видна.
	 * Не скроллит, если ячейка уже в зоне видимости.
	 */
	scrollToCell(row: number, col: number): void {
		const top = this.rowTop(row);
		const left = HEADER_WIDTH + this.colLeft(col);
		const right = left + this.colWidths[col];
		const bottom = top + this.getRowHeight(row);
		const { scrollTop, scrollLeft, clientWidth, clientHeight } = this.bodyDiv;
		if (top < scrollTop) {
			this.bodyDiv.scrollTop = top;
		} else if (bottom > scrollTop + clientHeight) {
			this.bodyDiv.scrollTop = bottom - clientHeight;
		}
		if (left < scrollLeft) {
			this.bodyDiv.scrollLeft = left;
		} else if (right > scrollLeft + clientWidth) {
			this.bodyDiv.scrollLeft = right - clientWidth;
		}
	}

	/**
	 * Главный метод рендеринга.
	 * Вычисляет окно видимости → если изменилось, перекладывает строки/ячейки.
	 * Заголовки перекладываются всегда (скролл-оффсет меняется).
	 */
	render(force = false): void {
		// Заполнить viewport фантомными колонками (только если allowAddRows)
		if (this.hasExplicitColumns) {
			const bodyW = this.bodyDiv.clientWidth;
			if (bodyW > 0) {
				// Удалить старые фантомы
				this.colWidths = this.colWidths.slice(0, this.dataColCount);
				this.totalCols = this.dataColCount;
				const totalW = this.totalWidth();
				if (totalW < bodyW) {
					const colW = DEFAULT_COL_WIDTH;
					const count = Math.ceil((bodyW - totalW) / colW);
					for (let i = 0; i < count; i++) this.colWidths.push(colW);
					this.totalCols = this.colWidths.length;
				}
				this.rebuildColLeftCache();
				this.updateContainerSizes();
			}
		}
		// Заполнить viewport по вертикали (allowAddRows=false)
		if (!this.allowAddRows) {
			const bodyH = this.bodyDiv.clientHeight;
			if (bodyH > 0) {
				this.rowHeights = this.rowHeights.slice(0, this.initialRowCount);
				this.rowMap = this.rowMap.slice(0, this.initialRowCount);
				this.totalRows = this.initialRowCount;
				const targetH = Math.max(bodyH - 2, 0);
				const totalH = this.totalHeight();
				if (totalH < targetH) {
					const gap = targetH - totalH;
					const fullRows = Math.floor(gap / DEFAULT_ROW_HEIGHT);
					const remainder = gap - fullRows * DEFAULT_ROW_HEIGHT;
					for (let i = 0; i < fullRows; i++) {
						this.rowHeights.push(DEFAULT_ROW_HEIGHT);
						this.rowMap.push(this.totalRows + i);
					}
					if (remainder > 0) {
						this.rowHeights.push(remainder);
						this.rowMap.push(this.totalRows + fullRows);
					}
					this.totalRows = this.rowHeights.length;
					this.baseRowCount = this.totalRows;
				}
				this.rebuildRowTopCache();
				this.updateContainerSizes();
			}
		}
		const { sr, er, sc, ec } = this.computeWindow();
		const windowChanged =
			force ||
			sr !== this.currentStartRow ||
			er !== this.currentEndRow ||
			sc !== this.currentStartCol ||
			ec !== this.currentEndCol ||
			this.rows.length === 0;

		if (windowChanged) {
			this.currentStartRow = sr;
			this.currentEndRow = er;
			this.currentStartCol = sc;
			this.currentEndCol = ec;
			this.layoutRows(sr, er, sc, ec);
		} else {
			this.refreshValues();
		}

		// Headers always re-laid-out (scroll offset may have changed)
		this.layoutHeader(sc, ec);
		this.layoutRowHeader(sr, er);
	}

	refreshValues(): void {
		for (const pool of this.rows) {
			const dr = this.dataRow(pool.row);
			for (let ci = 0; ci < pool.cells.length; ci++) {
				const c = this.currentStartCol + ci;
				if (c > this.currentEndCol) break;
				renderCellContent(pool.cells[ci], this.model.get(dr, c), this.columns[c]);
				this.updateCellError(pool.cells[ci], c, dr);
			}
		}
	}

	// ──────────────────────────────────────────────────────────────────────
	// Private
	// ──────────────────────────────────────────────────────────────────────

	private toggleHeaderClass(el: HTMLElement, idx: number, axis: "col" | "row"): void {
		if (!this.selectedRect?.start || !this.selectedRect?.end) return;
		if (axis === "col") {
			const sc = Math.min(this.selectedRect.start.col, this.selectedRect.end.col);
			const ec = Math.max(this.selectedRect.start.col, this.selectedRect.end.col);
			const span = Number(el.dataset.colSpan) || 1;
			const cellEnd = idx + span - 1;
			el.classList.toggle("nt-header-cell--selected", idx <= ec && cellEnd >= sc);
		} else {
			const sr = Math.min(this.selectedRect.start.row, this.selectedRect.end.row);
			const er = Math.max(this.selectedRect.start.row, this.selectedRect.end.row);
			el.classList.toggle("nt-header-cell--selected", idx >= sr && idx <= er);
		}
	}

	rebuildColLeftCache(): void {
		this.colLeftCache = new Array(this.totalCols + 1).fill(0);
		for (let i = 0; i < this.totalCols; i++) {
			this.colLeftCache[i + 1] = this.colLeftCache[i] + this.colWidths[i];
		}
	}

	/**
	 * Вычислить прямоугольник видимых ячеек с учётом буфера.
	 * sr/er — строки (startRow, endRow), sc/ec — колонки (startCol, endCol).
	 */
	private computeWindow(): { sr: number; er: number; sc: number; ec: number } {
		const { scrollTop, scrollLeft, clientWidth, clientHeight } = this.bodyDiv;
		let sr = this.rowIndexAt(scrollTop) - BUFFER_ROWS;
		sr = Math.max(0, sr);

		let er = sr;
		let y = this.rowTop(sr);
		while (er < this.visibleRowCount() - 1 && y < scrollTop + clientHeight + this.getRowHeight(er) * BUFFER_ROWS) {
			y += this.getRowHeight(er);
			er++;
		}
		er = Math.min(this.visibleRowCount() - 1, er);

		// Find first visible column
		let sc = 0;
		{
			let rem = scrollLeft;
			while (sc < this.totalCols && rem >= this.colWidths[sc]) {
				rem -= this.colWidths[sc];
				sc++;
			}
			sc = Math.max(0, sc - BUFFER_COLS);
		}
		let ec = sc;
		let acc = 0;
		const colBufW = this.totalCols > 0 ? this.totalWidth() / this.totalCols : DEFAULT_COL_WIDTH;
		while (
			ec < this.totalCols &&
			acc < clientWidth + BUFFER_COLS * colBufW
		) {
			acc += this.colWidths[ec];
			ec++;
		}
		ec = Math.min(this.totalCols - 1, ec);
		return { sr, er, sc, ec };
	}

	/**
	 * Переложить DOM-строки и ячейки под новое окно виртуализации.
	 * Использует пул RowElementPool — переиспользует созданные ранее ноды.
	 */
	/** Обновить индикатор ошибки валидации на ячейке. */
	private updateCellError(el: HTMLElement, col: number, dataRow: number): void {
		const cellKey = `${colToLetter(col)}${dataRow + 1}`;
		const errors = this.validationErrors[cellKey];
		let indicator = el.querySelector(".nt-cell-error") as HTMLElement | null;
		if (errors && errors.length > 0) {
			if (!indicator) {
				indicator = document.createElement("div");
				indicator.className = "nt-cell-error";
				indicator.addEventListener("mouseenter", () => this.showErrorPopup(indicator!, errors));
				indicator.addEventListener("mouseleave", () => this.hideErrorPopup());
				el.append(indicator);
			}
			indicator.style.display = "";
		} else if (indicator) {
			indicator.style.display = "none";
		}
	}

	private errorPopup: HTMLDivElement | null = null;

	private showErrorPopup(anchor: HTMLElement, errors: string[]): void {
		this.hideErrorPopup();
		const popup = document.createElement("div");
		popup.className = "nt-error-popup";
		popup.innerHTML = errors.map((e) => `<div class="nt-error-popup-item">${e}</div>`).join("");
		const rect = anchor.getBoundingClientRect();
		popup.style.left = `${rect.right + 4}px`;
		popup.style.top = `${rect.top}px`;
		document.body.append(popup);
		this.errorPopup = popup;
	}

	private hideErrorPopup(): void {
		if (this.errorPopup) { this.errorPopup.remove(); this.errorPopup = null; }
	}

	private layoutRows(sr: number, er: number, sc: number, ec: number): void {
		const needed = er - sr + 1;

		// Remove surplus row DOM nodes
		while (this.rows.length > needed) {
			const pool = this.rows.pop();
			pool?.el.remove();
		}

		// Grow or reuse pools
		while (this.rows.length < needed) {
			const el = document.createElement("div");
			el.className = "nt-row";
			el.style.height = `${DEFAULT_ROW_HEIGHT}px`;
			this.cellsLayer.append(el);
			this.rows.push({ row: -1, el, cells: [] });
		}

		for (let i = 0; i < needed; i++) {
			const row = sr + i;
			const pool = this.rows[i];
			pool.row = row;
			pool.el.style.top = `${this.rowTop(row)}px`;
			pool.el.style.height = `${this.getRowHeight(row)}px`;
			pool.el.classList.toggle("nt-row--disabled", this.disabledRows.has(this.dataRow(row)));
			this.renderRowContents(pool, row, sc, ec);
		}
	}

	private renderRowContents(
		pool: RowElementPool,
		row: number,
		sc: number,
		ec: number,
	): void {
		const count = ec - sc + 1;

		// Grow cell pool
		while (pool.cells.length < count) {
			const cell = document.createElement("div");
			cell.className = "nt-cell";
			pool.el.append(cell);
			pool.cells.push(cell);
		}

		// Update visible cells
		for (let i = 0; i < count; i++) {
			const c = sc + i;
			const colDef = this.columns[c];
			const el = pool.cells[i];
			el.style.width = `${this.colWidths[c]}px`;
			el.style.height = `${this.getRowHeight(row)}px`;
			el.style.transform = `translateX(${this.colLeft(c)}px)`;
			const align = getCellAlign(colDef);
			el.style.justifyContent = align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
			el.style.display = "";
			el.dataset.col = String(c);
			el.dataset.row = String(row);
			const isPhantom = this.hasExplicitColumns && !colDef;
			const isOverscanRow = !this.allowAddRows && row >= this.initialRowCount;
			const isDisabledRow = this.disabledRows.has(this.dataRow(row)) || isOverscanRow;
			const isReadOnlyCol = !this.readonlyTable && !!colDef?.readOnly && !isPhantom && !isOverscanRow;
			el.classList.toggle("nt-cell--phantom", isPhantom || isOverscanRow);
			el.classList.toggle("nt-cell--disabled", isDisabledRow);
			el.classList.toggle("nt-cell--readonly", isReadOnlyCol);
			el.style.cursor = (isPhantom || isOverscanRow || this.readonlyTable) ? "default" : "";
			renderCellContent(el, this.model.get(this.dataRow(row), c), colDef);
			// Индикатор ошибки валидации
			this.updateCellError(el, c, this.dataRow(row));
		}

		// Hide excess cells
		for (let i = count; i < pool.cells.length; i++) {
			pool.cells[i].style.display = "none";
		}
	}

	private layoutHeader(sc: number, ec: number): void {
		const sl = this.bodyDiv.scrollLeft;
		const leafLevel = this.maxDepth - 1;

		// Отслеживаем, какие колонки уже покрыты rowSpan с верхних уровней
		const covered = new Set<string>(); // key = "level,col"

		for (let level = 0; level < this.maxDepth; level++) {
			const row = this.headerRows[level];

			// Индекс headerGrid по (level, col) для быстрого поиска
			const gridMap = new Map<number, HeaderCell>();
			for (const h of this.headerGrid) {
				if (h.row === level) gridMap.set(h.col, h);
			}

			const cells: { col: number; colSpan: number; rowSpan: number; label: string; phantom?: boolean }[] = [];
			let c = sc;
			while (c <= ec) {
				if (covered.has(`${level},${c}`)) {
					c++;
					continue;
				}

				const h = gridMap.get(c);
				if (h && h.colSpan > 0) {
					cells.push({ col: h.col, colSpan: h.colSpan, rowSpan: h.rowSpan, label: h.label || colToLetter(h.col) });
					for (let rr = level + 1; rr < level + h.rowSpan && rr < this.maxDepth; rr++) {
						for (let cc = h.col; cc < h.col + h.colSpan; cc++) {
							covered.add(`${rr},${cc}`);
						}
					}
					c += h.colSpan;
				} else {
					const phantomRowSpan = this.maxDepth - level;
					cells.push({ col: c, colSpan: 1, rowSpan: phantomRowSpan, label: colToLetter(c), phantom: this.hasExplicitColumns });
					for (let rr = level + 1; rr < level + phantomRowSpan && rr < this.maxDepth; rr++) {
						covered.add(`${rr},${c}`);
					}
					c++;
				}
			}

			// Обеспечить достаточно DOM-нод
			while (row.children.length < cells.length) {
				const cell = document.createElement("div");
				cell.className = "nt-header-cell";
				row.append(cell);
			}

			for (let i = 0; i < cells.length; i++) {
				const cellInfo = cells[i];
				const el = row.children[i] as HTMLDivElement;

				let spanWidth = 0;
				for (let ci = cellInfo.col; ci < cellInfo.col + cellInfo.colSpan; ci++) {
					spanWidth += this.colWidths[ci];
				}

				let label = el.querySelector(".nt-header-label") as HTMLSpanElement | null;
				if (!label) {
					el.textContent = "";
					label = document.createElement("span");
					label.className = "nt-header-label";
					el.append(label);

					const cellBottom = level + cellInfo.rowSpan - 1;

					if (cellBottom === leafLevel && cellInfo.colSpan === 1 && !cellInfo.phantom) {
						const filterBtn = document.createElement("span");
						filterBtn.className = "nt-header-filter-btn";
						filterBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/></svg>`;
						el.append(filterBtn);

						const btn = document.createElement("span");
						btn.className = "nt-header-sort-btn";
						el.append(btn);
					}
					if (cellBottom === leafLevel && cellInfo.colSpan === 1 && !cellInfo.phantom) {
						const resizer = document.createElement("div");
						resizer.className = "nt-resize-handle";
						el.append(resizer);
					}
				}

				// Обновить data-col на всех дочерних элементах (при реюзе ячейки для другой колонки)
				const sortBtn = el.querySelector(".nt-header-sort-btn") as HTMLElement | null;
				if (sortBtn) sortBtn.dataset.col = String(cellInfo.col);
				const fBtn = el.querySelector(".nt-header-filter-btn") as HTMLElement | null;
				if (fBtn) fBtn.dataset.col = String(cellInfo.col);
				const resizer = el.querySelector(".nt-resize-handle") as HTMLElement | null;
				if (resizer) resizer.dataset.col = String(cellInfo.col);
				label.textContent = cellInfo.label;
				label.style.whiteSpace = this.headerWrap ? "normal" : "";
				label.style.wordBreak = this.headerWrap ? "break-word" : "";
				el.style.width = `${spanWidth}px`;
				el.style.height = `${cellInfo.rowSpan * HEADER_ROW_HEIGHT}px`;
				if (this.headerWrap) {
					el.style.height = "auto";
					el.style.minHeight = `${cellInfo.rowSpan * HEADER_ROW_HEIGHT}px`;
				} else {
					el.style.height = `${cellInfo.rowSpan * HEADER_ROW_HEIGHT}px`;
				}
				el.style.padding = this.headerWrap ? "4px 8px" : "0 8px";
				el.style.alignItems = this.headerWrap ? "flex-start" : "";
				el.style.left = `${HEADER_WIDTH + this.colLeft(cellInfo.col) - sl}px`;
				el.style.display = "";
				el.dataset.col = String(cellInfo.col);
				el.dataset.colSpan = String(cellInfo.colSpan);
				el.classList.toggle("nt-header-cell--phantom", !!cellInfo.phantom);
				el.style.cursor = cellInfo.phantom ? "default" : "";
				this.toggleHeaderClass(el, cellInfo.col, "col");
			}

			for (let i = cells.length; i < row.children.length; i++) {
				(row.children[i] as HTMLDivElement).style.display = "none";
			}
		}

		if (this.headerWrap) {
			this._fitHeaderRows();
		}
	}

	private _fitHeaderRows(): void {
		let totalH = 0;
		for (let level = 0; level < this.maxDepth; level++) {
			const row = this.headerRows[level];
			let maxH = HEADER_ROW_HEIGHT;
			for (const el of Array.from(row.children)) {
				const ht = el as HTMLElement;
				if (ht.style.display === "none") continue;
				const h = ht.offsetHeight;
				if (h > maxH) maxH = h;
			}
			row.style.height = `${maxH}px`;
			row.style.top = `${totalH}px`;
			for (const el of Array.from(row.children)) {
				const ht = el as HTMLElement;
				if (ht.style.display === "none") continue;
				ht.style.height = `${maxH}px`;
			}
			totalH += maxH;
		}
		if (totalH !== this.headerH) {
			this.headerH = totalH;
			this.bodyDiv.style.top = `${this.headerH}px`;
			this.headerCol.style.top = `${this.headerH}px`;
			this.corner.style.height = `${this.headerH}px`;
		}
	}

	private layoutRowHeader(sr: number, er: number): void {
		const needed = er - sr + 1;
		const st = this.bodyDiv.scrollTop;

		while (this.headerCol.children.length < needed) {
			const cell = document.createElement("div");
			cell.className = "nt-header-cell";
			this.headerCol.append(cell);
		}
		for (let i = 0; i < needed; i++) {
			const r = sr + i;
			const el = this.headerCol.children[i] as HTMLDivElement;
			el.textContent = String(r + 1);
			el.style.height = `${this.getRowHeight(r)}px`;
			el.style.width = `${HEADER_WIDTH}px`;
			el.style.top = `${this.rowTop(r) - st}px`;
			el.style.display = "";
			el.dataset.row = String(r);
			const isOverscan = !this.allowAddRows && r >= this.initialRowCount;
			// Resize handle — только не для фантомных строк
			if (!isOverscan) {
				let rh = el.querySelector(".nt-resize-handle-row") as HTMLElement | null;
				if (!rh) {
					rh = document.createElement("div");
					rh.className = "nt-resize-handle nt-resize-handle-row";
					rh.dataset.row = String(r);
					el.append(rh);
				}
			} else {
				const rh = el.querySelector(".nt-resize-handle-row") as HTMLElement | null;
				if (rh) rh.remove();
			}
			el.classList.toggle("nt-header-cell--disabled", isOverscan);
			el.style.cursor = isOverscan ? "default" : "";
			this.toggleHeaderClass(el, r, "row");
		}
		for (let i = needed; i < this.headerCol.children.length; i++) {
			(this.headerCol.children[i] as HTMLDivElement).style.display = "none";
		}
	}
}

function applyStyle(
	el: HTMLElement,
	styles: Partial<CSSStyleDeclaration>,
): void {
	for (const [k, v] of Object.entries(styles)) {
		(el.style as unknown as Record<string, string>)[k] = v as string;
	}
}

	function renderCellContent(
	el: HTMLDivElement,
	cell: Cell,
	colDef?: ColumnDef,
): void {
	// Apply cell styles
	const style = cell.style;
	el.style.backgroundColor = style?.background ?? "";
	el.style.color = style?.color ?? "";
	el.style.fontWeight = style?.bold ? "bold" : "normal";
	el.style.fontStyle = style?.italic ? "italic" : "normal";
	el.style.textDecoration = style?.underline ? "underline" : "none";
	el.style.whiteSpace = style?.wrap ? "normal" : "nowrap";
	el.style.wordBreak = style?.wrap ? "break-word" : "";
	if (style?.valign === "top") el.style.alignItems = "flex-start";
	else if (style?.valign === "bottom") el.style.alignItems = "flex-end";
	else el.style.alignItems = "center";
	// cell style align overrides column default (flex container needs justify-content)
	const align = style?.align ?? (colDef ? getCellAlign(colDef) : undefined);
	if (align === "right") el.style.justifyContent = "flex-end";
	else if (align === "center") el.style.justifyContent = "center";
	else el.style.justifyContent = "flex-start";

	const isBoolean = colDef?.type === "boolean";
	el.classList.toggle("nt-cell--boolean", isBoolean);

	if (isBoolean) {
		if (el.classList.contains("nt-cell--phantom")) {
			el.textContent = "";
			return;
		}
		const checked = cell.value === true || cell.value === "true" || cell.value === 1;
		let cb = el.firstElementChild as HTMLInputElement | null;
		if (!cb || cb.tagName !== "INPUT") {
			cb = document.createElement("input");
			cb.type = "checkbox";
			cb.className = "nt-checkbox";
			cb.tabIndex = -1;
			el.textContent = "";
			el.append(cb);
		}
		cb.checked = checked;
	} else {
		const text = cell.display ?? formatCellDisplay(cell.value ?? null, colDef);
		if (el.textContent !== text || el.firstElementChild) {
			el.textContent = text;
		}
	}
}
