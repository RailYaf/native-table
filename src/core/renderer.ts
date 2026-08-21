// ── Виртуальный рендерер таблицы ─────────────────────────────────────────────
//
// Рендерит только видимые строки и колонки (+ буфер BUFFER_ROWS/BUFFER_COLS).
// DOM-структура (все элементы позиционируются через position: absolute):

import { formatCellDisplay, getCellAlign } from "../utils/column-utils";
import {
	BUFFER_COLS,
	BUFFER_ROWS,
	DEFAULT_COL_WIDTH,
	DEFAULT_ROW_HEIGHT,
	EXPAND_ROWS_BY,
	HEADER_ROW_HEIGHT,
	INDEX_HEADER_WIDTH,
	MIN_COL_WIDTH,
	OVERSCAN_ROWS,
} from "../utils/consts";
import type { HeaderCell } from "../utils/column-tree";
import { flattenColumns } from "../utils/column-tree";
import type { SheetModel } from "./model";
import type { Cell, ColumnDef, ScalarCellValue } from "../utils/types";
import { filterDefaultSvg } from "../ui/icons";

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
	private headerRows: HTMLDivElement[] = []; // строки шапки (многоуровневая)
	private headerCol: HTMLDivElement;    // .nt-header-col — заголовки строк (фиксированы)
	private corner: HTMLDivElement;       // .nt-corner — кнопка «выделить всё»
	private noDataEl: HTMLDivElement;     // плашка «Нет данных»
	private rows: RowElementPool[] = [];  // пул видимых строк (переиспользуются при скролле)
	private headerGrid: HeaderCell[] = []; // сетка ячеек шапки (из flattenColumns)
	private maxDepth = 1;                  // глубина иерархии колонок
	headerH = 28;                           // общая высота шапки = maxDepth * HEADER_ROW_HEIGHT
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
	private onContainerWheel: (e: WheelEvent) => void;
	/** Кастомный тултип полного текста обрезанной ячейки */
	private cellTooltip: HTMLDivElement;
	private onCellMouseOver: (ev: Event) => void;
	private onCellMouseOut: () => void;
	private onCellMouseDown: () => void;
	private model: SheetModel;
	private columns: ColumnDef[];
	/** Маппинг для сортировки/фильтрации: displayRow → dataRow */
	rowMap: number[] = [];
	/** Базовое количество строк (без учёта фильтра) */
	baseRowCount: number;
	/** Исходное количество строк (до overscan) — для маркировки фантомных */
	initialRowCount = 0;
	/** Количество data-колонок (без фантомных) */
	dataColCount = 0;
	/** Разрешить добавление новых строк при скролле */
	allowAddRows = true;
	/** Таблица только для чтения */
	readOnly = false;
	/** Зебра — чередующаяся расцветка строк */
	striped = false;
	/** Колонки с фиксированной шириной (ручной ресайз/сохранённый лейаут) — не участвуют в % распределении */
	private manualColWidths = new Set<number>();
	/** Последняя доступная ширина, под которую пересчитаны ширины (см. syncColWidths) */
	private lastViewportW = -1;
	/** Прокомпьюченные минимальные высоты строк (по всем колонкам) */
	private autoRowHeights: number[] = [];
	/** Приостановить пересчёт авто-высот (на время ресайза) */
	suspendAutoHeights = false;
	/** Офскрин-элемент для замера высоты текста */
	private measureEl: HTMLSpanElement | null = null;
	/** Кеш замеров текста: "width|text" → px */
	private measureCache = new Map<string, number>();
	/** Кеш высот строк шапки (по уровням), чтобы не пересчитывать на каждом скролле */
	private cachedHeaderMaxH: number[] = [];
	private headerHeightsDirty = true;
	/** Настройка шапки: ellipsis + позиции label/иконки */
	headerConfig?: import("../utils/types").HeaderConfig;
	/** Настройки ячеек */
	cellConfig?: import("../utils/types").CellConfig;
	/** id записей, запрещённых к редактированию */
	disabledRows: Set<string | number> = new Set();
	/** Ошибки валидации: cellKey → список сообщений */
	validationErrors: Record<string, string[]> = {};
	/** Предупреждения валидации: cellKey → список сообщений */
	validationWarnings: Record<string, string[]> = {};
	/** Тема: "light" | "dark" */
	theme: "light" | "dark" = "light";
	/** Ширины из внешнего источника (восстанавливаются после setColumns) */
	columnWidths: Record<string, number> = {};
	/** ID строк для ключей валидации. rowIds[r] = dataSource[r]["id"] */
	rowIds: (string | number)[] | undefined;
	selectedRect?: import("../utils/types").SelectionRect;
	/** Все fixed-left колонки (в порядке следования) — для per-column sticky */
	fixedLeftCols: number[] = [];
	/** Компактные смещения для каждой fixed-left колонки внутри слоя */
	fixedLeftCompact: number[] = [];
	/** Суммарная ширина всех fixed-left колонок */
	fixedLeftTotalW = 0;
	/** Число прилипших (stuck) fixed-left колонок на текущем рендере */
	currentStuckCount = 0;
	fixedLeftCount = 0;
	/** Все fixed-right колонки (в порядке следования) — для per-column sticky */
	fixedRightCols: number[] = [];
	/** Компактные смещения от левого края fixed-right слоя */
	fixedRightCompact: number[] = [];
	/** Суммарная ширина всех fixed-right колонок */
	fixedRightTotalW = 0;
	/** Число прилипших (stuck) fixed-right колонок (считается с правого края) */
	currentRightStuckCount = 0;
	/** Заглушка правого края шапки: закрывает зазор между fixed-right header и вертикальным скроллбаром */
	private fixedRightHeaderCap: HTMLDivElement | null = null;
	/** Оверлей для left-fixed колонок (вне bodyDiv — не прыгает при скролле) */
	private fixedLeftLayer: HTMLDivElement | null = null;
	private fixedRightLayer: HTMLDivElement | null = null;
	private fixedLeftInner: HTMLDivElement | null = null;
	private fixedRightInner: HTMLDivElement | null = null;
	private fixedLeftRows: RowElementPool[] = [];
	private fixedRightRows: RowElementPool[] = [];
	/** Оверлей выделения внутри fixed-слоя (аналог .nt-range в cellsLayer) */
	private fixedLeftRange: HTMLDivElement | null = null;
	private fixedRightRange: HTMLDivElement | null = null;
	/** Режим редактирования ячейки: прячет рамку выделения и в fixed-слоях */
	private editing = false;
	/** Ячейка под редактором (display-координаты): у неё не рисуем заливку */
	editingCell: { row: number; col: number } | null = null;

	/**
	 * Создать рендерер: строит DOM-каркас таблицы (шапка, тело, fixed-слои,
	 * тултип), разворачивает иерархию колонок и инициализирует кеши позиций.
	 */
	constructor(
		container: HTMLDivElement,
		model: SheetModel,
		public totalRows: number,
		public totalCols: number,
		columns: ColumnDef[] = [],
		allowAddRows = true,
		readOnly = false,
		striped = false,
	) {
		this.rowHeights = new Array(totalRows).fill(DEFAULT_ROW_HEIGHT);
		this.container = container;
		this.model = model;
		this.columns = columns;
		this.allowAddRows = allowAddRows;
		this.readOnly = readOnly;
		this.striped = striped;

		// Развернуть иерархию колонок (если есть children)
		const flat = flattenColumns(columns);
		this.columns = flat.flatColumns;
		this.headerGrid = flat.headerGrid;
		this.maxDepth = flat.maxDepth || 1;
		this.headerH = this.maxDepth * HEADER_ROW_HEIGHT;
		this.totalCols = this.columns.length; // листовые колонки = data-колонки
		this.dataColCount = this.totalCols;

		this.baseRowCount = totalRows;
		this.initialRowCount = totalRows;
		this.rowMap = Array.from({ length: totalRows }, (_, i) => i);
		this.rebuildRowTopCache();
		// Инициализация ширин: из width, без width — дефолт
		// (актуальные ширины под вьюпорт вычислит syncColWidths на первом рендере)
		this.colWidths = Array.from(
			{ length: this.totalCols },
			(_, i) => this.columns[i]?.width ?? DEFAULT_COL_WIDTH,
		);
		this.rebuildColLeftCache();
		this.computeFixedCols();
		if (this.allowAddRows) this.ensureRows(this.baseRowCount);
		container.classList.add("nt-root");

		this.corner = document.createElement("div");
		this.corner.className = "nt-corner";
		applyStyle(this.corner, {
			position: "absolute",
			top: "0",
			left: "0",
			width: `${INDEX_HEADER_WIDTH}px`,
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
		// ── Row-number column (left, fixed, top:HH) ───────────────────────
		this.headerCol = document.createElement("div");
		this.headerCol.className = "nt-header-col";
		applyStyle(this.headerCol, {
			position: "absolute",
			top: `${this.headerH}px`,
			left: "0",
			bottom: "0",
			width: `${INDEX_HEADER_WIDTH}px`,
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
			overflow: "scroll",
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
			left: `${INDEX_HEADER_WIDTH}px`,
			width: `${this.totalWidth()}px`,
			height: `${this.totalHeight()}px`,
		});
		this.inner.append(this.cellsLayer);

		// ── Кастомный тултип для обрезанного текста ──────────────────────
		this.cellTooltip = document.createElement("div");
		this.cellTooltip.className = "nt-cell-tooltip";
		applyStyle(this.cellTooltip, {
			position: "absolute",
			zIndex: "120",
			display: "none",
			pointerEvents: "none",
		});
		this.cellsLayer.append(this.cellTooltip);

		this.onCellMouseOver = (ev: Event) => this.handleCellMouseOver(ev as MouseEvent);
		this.onCellMouseOut = () => this.hideCellTooltip();
		this.onCellMouseDown = () => this.hideCellTooltip();
		// Слушатели на контейнере: события fixed-слоёв не всплывают в cellsLayer
		this.container.addEventListener("mouseover", this.onCellMouseOver);
		this.container.addEventListener("mouseout", this.onCellMouseOut);
		this.cellsLayer.addEventListener("mousedown", this.onCellMouseDown);

		this.noDataEl = document.createElement("div");
		this.noDataEl.className = "nt-no-data";
		this.noDataEl.textContent = "Нет данных";
		this.bodyDiv.append(this.noDataEl);

		this.onScrollHandler = () => {
			this.autoExpand();
			this.hideCellTooltip();
			this.render();
			this.onScrollCallback?.();
		};
		this.bodyDiv.addEventListener("scroll", this.onScrollHandler, {
			passive: true,
		});

		// Wheel events на fixed-слоях (вне bodyDiv) пробрасываем в bodyDiv
		this.onContainerWheel = (e: WheelEvent) => {
			if (!this.bodyDiv.contains(e.target as Node)) {
				if (e.shiftKey && e.deltaY !== 0) {
					// Shift + колесо над fixed-колонкой — горизонтальный скролл
					this.bodyDiv.scrollLeft += e.deltaY;
				} else {
					this.bodyDiv.scrollLeft += e.deltaX;
					this.bodyDiv.scrollTop += e.deltaY;
				}
			}
		};
		this.container.addEventListener("wheel", this.onContainerWheel, { passive: true });

		this.setupFixedLayers();
	}

	// ──────────────────────────────────────────────────────────────────────
	// Публичные методы
	// ──────────────────────────────────────────────────────────────────────

	/** Задать колбэк, вызываемый при скролле таблицы. */
	setOnScroll(cb: () => void): void {
		this.onScrollCallback = cb;
	}

	/** Заменить модель данных и перерисовать таблицу. */
	setModel(model: SheetModel): void {
		this.model = model;
		this.render(true);
	}

	/**
	 * Заменить колонки: развернуть иерархию, пересчитать ширины/фиксации,
	 * восстановить сохранённые ширины по именам колонок и перерисовать.
	 */
	setColumns(columns: ColumnDef[]): void {
		const flat = flattenColumns(columns);
		// Сохранить вручную изменённые ширины по имени колонки: setColumns может
		// прийти с тем же составом (обновление defs) — ресайз сбрасывать нельзя
		const oldManualByName = new Map<string, number>();
		for (let c = 0; c < this.totalCols; c++) {
			if (!this.manualColWidths.has(c)) continue;
			const name = this.columns[c]?.name;
			if (name) oldManualByName.set(name, this.colWidths[c]);
		}
		this.columns = flat.flatColumns;
		this.headerGrid = flat.headerGrid;
		this.maxDepth = flat.maxDepth || 1;
		this.totalCols = this.columns.length;
		this.dataColCount = this.totalCols;
		this.measureCache.clear();
		this.manualColWidths.clear();
		this.lastViewportW = -1; // состав колонок изменился — пересчитать ширины под вьюпорт
		this.colWidths = Array.from(
			{ length: this.totalCols },
			(_, i) => this.columns[i]?.width ?? DEFAULT_COL_WIDTH,
		);
		this.rebuildColLeftCache();
		this.computeFixedCols();
		this.setupFixedLayers();
		// Вручную изменённые ширины (по имени) приоритетнее внешнего лейаута —
		// сохранённый columnWidths мог устареть после свежего ресайза
		for (let c = 0; c < this.totalCols; c++) {
			const name = this.columns[c]?.name;
			const manual = name ? oldManualByName.get(name) : undefined;
			if (manual !== undefined) {
				this.colWidths[c] = manual;
				this.manualColWidths.add(c);
				continue;
			}
			const storedWidth = name ? this.columnWidths[name] : undefined;
			if (storedWidth !== undefined) {
				this.colWidths[c] = Math.max(MIN_COL_WIDTH, storedWidth);
				this.manualColWidths.add(c); // сохранённый лейаут — фиксируем
			}
		}
		this.headerHeightsDirty = true;
		// Очистить старые DOM-ячейки (могли остаться от overscan)
		this.render(true);
	}

	/** Перевести display-строку в data-строку через rowMap (сортировка/фильтр). */
	private dataRow(displayRow: number): number {
		return this.rowMap[displayRow] ?? displayRow;
	}

	/** id записи для data-строки (из rowIds или фолбэк dataRow + 1). */
	private rowIdAt(dataRow: number): string | number {
		return this.rowIds?.[dataRow] ?? dataRow + 1;
	}

	/** Количество строк после фильтрации. */
	visibleRowCount(): number {
		return this.rowMap.length;
	}

	/** Описание колонки по индексу. */
	getColumn(col: number): ColumnDef | undefined {
		const def = this.columns[col];
		if (def) return def;
		return { type: "text", readOnly: true };
	}

	/** Найти индекс колонки по имени. Возвращает -1 если не найдено. */
	colIndexByName(name: string): number {
		return this.columns.findIndex((c) => c.name === name);
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

	/** Уничтожить рендерер: снять слушатели, убрать все DOM-ноды из контейнера. */
	destroy(): void {
		this.bodyDiv.removeEventListener("scroll", this.onScrollHandler);
		this.container.removeEventListener("wheel", this.onContainerWheel);
		this.container.removeEventListener("mouseover", this.onCellMouseOver);
		this.container.removeEventListener("mouseout", this.onCellMouseOut);
		this.cellsLayer.removeEventListener("mousedown", this.onCellMouseDown);
		this.hideErrorPopup();
		this.hideCellTooltip();
		this.container.replaceChildren();
		this.container.classList.remove("nt-root");
		this.rows = [];
		this.fixedLeftRows = [];
		this.fixedRightRows = [];
		this.fixedLeftLayer = null;
		this.fixedRightLayer = null;
		this.fixedLeftInner = null;
		this.fixedRightInner = null;
		this.fixedLeftRange = null;
		this.fixedRightRange = null;
		this.fixedRightHeaderCap = null;
		this.measureEl = null;
	}

	/** Наведение на ячейку с обрезанным текстом — показать тултип с полным текстом. */
	private handleCellMouseOver(ev: MouseEvent): void {
		const cell = (ev.target as HTMLElement).closest<HTMLElement>(".nt-cell");
		const tip = cell?.dataset.ntTip;
		if (!cell || !tip) {
			this.hideCellTooltip();
			return;
		}
		// Показываем только если текст реально обрезан
		const ts = cell.querySelector<HTMLElement>(".nt-cell-text");
		if (!ts) {
			this.hideCellTooltip();
			return;
		}
		const truncated = ts.scrollWidth > ts.clientWidth + 1 || ts.scrollHeight > ts.clientHeight + 1;
		if (!truncated) {
			this.hideCellTooltip();
			return;
		}
		const col = Number(cell.dataset.col);
		const row = Number(cell.dataset.row);
		if (Number.isNaN(col) || Number.isNaN(row)) {
			this.hideCellTooltip();
			return;
		}
		this.showCellTooltip(tip, col, row);
	}

	/** Показать тултип полного текста под ячейкой (по центру, с клампом по видимой области). */
	private showCellTooltip(text: string, col: number, row: number): void {
		const t = this.cellTooltip;
		t.textContent = text;
		t.style.display = "block";

		// X ячейки в координатах cellsLayer: для прилипших fixed-колонок —
		// компактная позиция в fixed-слое, иначе — обычная позиция контента
		const fixedLeftIdx = this.fixedLeftCols.indexOf(col);
		const fixedRightIdx = this.fixedRightCols.indexOf(col);
		const nR = this.fixedRightCols.length;
		const startIdxR = nR - this.currentRightStuckCount;
		const isStuckLeft = fixedLeftIdx >= 0 && fixedLeftIdx < this.currentStuckCount;
		const isStuckRight = fixedRightIdx >= 0 && fixedRightIdx >= startIdxR;
		let cellCenterX: number;
		if (isStuckLeft) {
			cellCenterX = this.fixedLeftCompact[fixedLeftIdx] + this.getColWidth(col) / 2 + this.bodyDiv.scrollLeft;
		} else if (isStuckRight) {
			const layerW = this.fixedRightTotalW - this.fixedRightCompact[startIdxR];
			const p = this.fixedRightCompact[fixedRightIdx] - this.fixedRightCompact[startIdxR];
			cellCenterX = this.bodyDiv.clientWidth - layerW + p + this.getColWidth(col) / 2 - INDEX_HEADER_WIDTH + this.bodyDiv.scrollLeft;
		} else {
			cellCenterX = this.colLeft(col) + this.getColWidth(col) / 2;
		}

		// По центру ячейки, под ней; клампим по границам видимой области
		const left = Math.min(
			cellCenterX,
			this.cellsLayer.clientWidth - t.offsetWidth - 4,
		);
		const top = Math.min(
			this.rowTop(row) + this.getRowHeight(row) + 4,
			this.bodyDiv.clientHeight - t.offsetHeight - 4,
		);
		t.style.left = `${Math.max(4, left)}px`;
		t.style.top = `${Math.max(4, top)}px`;
	}

	/** Скрыть тултип полного текста. */
	private hideCellTooltip(): void {
		this.cellTooltip.style.display = "none";
	}

	/** Высота строки: авто-подстройка по тексту, минимум DEFAULT_ROW_HEIGHT. */
	getRowHeight(row: number): number {
		const dr = this.dataRow(row);
		const base = this.rowHeights[dr] ?? DEFAULT_ROW_HEIGHT;
		return Math.max(base, this.autoRowHeights[dr] ?? DEFAULT_ROW_HEIGHT);
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
		if (col >= this.dataColCount) return;
		this.colWidths[col] = Math.max(MIN_COL_WIDTH, width);
		this.manualColWidths.add(col); // ручная ширина — фиксируем, % больше не применяется
		this.rebuildColLeftCache();
		this.headerHeightsDirty = true;
		// Состав ручных ширин изменился — пересчитать заполнение вьюпорта
		this.lastViewportW = -1;
	}

	/**
	 * Сужение колонки с передачей дельты соседу: общая ширина таблицы не меняется.
	 * col получает max(30, newWidth), сосед растёт на разницу. Обе колонки
	 * становятся «пользовательскими» (фиксируются в px).
	 */
	resizeColPair(col: number, newWidth: number, neighborCol: number): void {
		if (col >= this.dataColCount || neighborCol >= this.dataColCount) return;
		const old = this.colWidths[col] ?? DEFAULT_COL_WIDTH;
		const next = Math.max(MIN_COL_WIDTH, newWidth);
		this.colWidths[col] = next;
		this.colWidths[neighborCol] = Math.max(MIN_COL_WIDTH, (this.colWidths[neighborCol] ?? DEFAULT_COL_WIDTH) + (old - next));
		this.manualColWidths.add(col);
		this.manualColWidths.add(neighborCol);
		this.rebuildColLeftCache();
		this.headerHeightsDirty = true;
		// Состав ручных ширин изменился — пересчитать заполнение вьюпорта
		this.lastViewportW = -1;
	}

	/** Ширина колонки в px (дефолт DEFAULT_COL_WIDTH). */
	getColWidth(col: number): number {
		return this.colWidths[col] ?? DEFAULT_COL_WIDTH;
	}

	/** Зафиксирована ли ширина колонки вручную (не участвует в % распределении). */
	isManualColWidth(col: number): boolean {
		return this.manualColWidths.has(col);
	}

	/** Перестроить кеш rowTopCache — префикс-суммы высот строк для бинарного поиска. */
	private rebuildRowTopCache(): void {
		const count = this.visibleRowCount();
		this.rowTopCache = new Array(count + 1).fill(0);
		for (let i = 0; i < count; i++) {
			this.rowTopCache[i + 1] = this.rowTopCache[i] + this.getRowHeight(i);
		}
	}

	/** Гарантировать, что существует как минимум строка с индексом `row`. */
	ensureRows(row: number): void {
		if (!this.allowAddRows || row < this.totalRows) return;
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

	/** Дополнить rowHeights до n элементов, не меняя totalRows/rowMap. */
	padRowHeights(n: number): void {
		while (this.rowHeights.length < n) {
			this.rowHeights.push(DEFAULT_ROW_HEIGHT);
		}
		this.rebuildRowTopCache();
	}

	/**
	 * Переустановить строки при смене данных: сбросить высоты/rowMap/авто-высоты
	 * под новое количество строк и расширить, если разрешено добавление.
	 */
	setDataRows(count: number): void {
		this.rowHeights = new Array(count).fill(DEFAULT_ROW_HEIGHT);
		this.autoRowHeights = new Array(count).fill(DEFAULT_ROW_HEIGHT);
		this.totalRows = count;
		this.baseRowCount = count;
		this.initialRowCount = count;
		this.rowMap = Array.from({ length: count }, (_, i) => i);
		this.rebuildRowTopCache();
		if (this.allowAddRows) this.ensureRows(count);
	}

	/**
	 * Автоматически расширить строки при скролле к нижней границе.
	 * Вызывается на каждое событие скролла.
	 */
	private autoExpand(): void {
		const { scrollTop, clientHeight } = this.bodyDiv;
		const viewBottom = scrollTop + clientHeight;

		// Расширить строки вниз, если скролл вплотную к концу
		const lastRowTop = this.rowTop(this.totalRows);
		if (this.allowAddRows && viewBottom + clientHeight > lastRowTop) {
			this.ensureRows(this.totalRows + EXPAND_ROWS_BY - 1);
		}
	}

	/** Обновить размеры всех контейнеров (после изменения totalHeight/totalWidth). */
	updateContainerSizes(): void {
		const h = this.totalHeight();
		const w = this.totalWidth();
		this.inner.style.height = `${this.allowAddRows ? this.headerH + h : h}px`;
		this.inner.style.width = `${INDEX_HEADER_WIDTH + w}px`;
		this.cellsLayer.style.height = `${h}px`;
		this.cellsLayer.style.width = `${w}px`;
		this.headerCol.style.height = `${h}px`;
		// headerRow === headerRows[0], поэтому обновляем только через цикл
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

	/** Пересчитать fixedLeftCols / fixedRightCols и их компактные смещения по текущему columns[]. */
	private computeFixedCols(): void {
		// Собрать все fixed-left колонки (в любых позициях) и вычислить компактные смещения.
		this.fixedLeftCols = [];
		for (let c = 0; c < this.dataColCount; c++) {
			if (this.columns[c]?.fixed === "left") this.fixedLeftCols.push(c);
		}
		this.fixedLeftCompact = [];
		let acc = 0;
		for (const c of this.fixedLeftCols) {
			this.fixedLeftCompact.push(acc);
			acc += this.colWidths[c] ?? DEFAULT_COL_WIDTH;
		}
		this.fixedLeftTotalW = acc;
		this.fixedLeftCount = this.fixedLeftCols.length;

		// Собрать все fixed-right колонки (в любых позициях) и вычислить компактные смещения.
		this.fixedRightCols = [];
		for (let c = 0; c < this.dataColCount; c++) {
			if (this.columns[c]?.fixed === "right") this.fixedRightCols.push(c);
		}
		let accR = 0;
		this.fixedRightCompact = [];
		for (const c of this.fixedRightCols) {
			this.fixedRightCompact.push(accR);
			accR += this.colWidths[c] ?? DEFAULT_COL_WIDTH;
		}
		this.fixedRightTotalW = accR;
	}

	/** Создать/пересоздать DOM-оверлеи для fixed колонок (вызывать после computeFixedCols). */
	private setupFixedLayers(): void {
		this.fixedLeftLayer?.remove();
		this.fixedRightLayer?.remove();
		this.fixedRightHeaderCap?.remove();
		this.fixedLeftRows = [];
		this.fixedRightRows = [];
		this.fixedLeftLayer = null;
		this.fixedLeftInner = null;
		this.fixedRightLayer = null;
		this.fixedRightInner = null;
		this.fixedRightHeaderCap = null;

		if (this.fixedLeftCols.length > 0) {
			this.fixedLeftLayer = document.createElement("div");
			applyStyle(this.fixedLeftLayer, {
				position: "absolute",
				top: `${this.headerH}px`,
				left: `${INDEX_HEADER_WIDTH}px`,
				width: `${this.fixedLeftTotalW}px`,
				bottom: "0",
				overflow: "hidden",
				zIndex: "5",
				pointerEvents: "none",
				display: "none",
			});
			this.fixedLeftInner = document.createElement("div");
			this.fixedLeftInner.style.position = "relative";
			this.fixedLeftRange = document.createElement("div");
			this.fixedLeftRange.className = "nt-range";
			this.fixedLeftRange.style.display = "none";
			this.fixedLeftInner.append(this.fixedLeftRange);
			this.fixedLeftLayer.append(this.fixedLeftInner);
			this.container.append(this.fixedLeftLayer);
		} else {
			this.fixedLeftRange = null;
		}

		if (this.fixedRightCols.length > 0) {
			this.fixedRightLayer = document.createElement("div");
			applyStyle(this.fixedRightLayer, {
				position: "absolute",
				top: `${this.headerH}px`,
				right: "0",
				width: `${this.fixedRightTotalW}px`,
				bottom: "0",
				overflow: "hidden",
				zIndex: "5",
				pointerEvents: "none",
				display: "none",
			});
			this.fixedRightInner = document.createElement("div");
			this.fixedRightInner.style.position = "relative";
			this.fixedRightRange = document.createElement("div");
			this.fixedRightRange.className = "nt-range";
			this.fixedRightRange.style.display = "none";
			this.fixedRightInner.append(this.fixedRightRange);
			this.fixedRightLayer.append(this.fixedRightInner);
			this.container.append(this.fixedRightLayer);
		} else {
			this.fixedRightRange = null;
		}

		// Закрывает зазор шириной scrollbarW между шапкой и краем контейнера (всегда нужен)
		this.fixedRightHeaderCap = document.createElement("div");
		applyStyle(this.fixedRightHeaderCap, {
			position: "absolute",
			top: "0",
			right: "0",
			width: "0",
			zIndex: "12",
			background: "var(--nt-bg-header)",
			borderBottom: "1px solid var(--nt-border-light)",
			display: "none",
		});
		this.container.append(this.fixedRightHeaderCap);
	}

	/** Обновить fixed-слои: позиции, размеры, ячейки (вызывается на каждый render). */
	private layoutFixedLayers(sr: number, er: number): void {
		const scrollTop = this.bodyDiv.scrollTop;
		const scrollbarW = this.bodyDiv.offsetWidth - this.bodyDiv.clientWidth;
		const scrollbarH = this.bodyDiv.offsetHeight - this.bodyDiv.clientHeight;

		if (this.fixedRightHeaderCap) {
			if (scrollbarW > 0) {
				this.fixedRightHeaderCap.style.display = "";
				this.fixedRightHeaderCap.style.width = `${scrollbarW}px`;
				this.fixedRightHeaderCap.style.height = `${this.headerH}px`;
			} else {
				this.fixedRightHeaderCap.style.display = "none";
			}
		}

		const shadowLeft = this.theme === "dark"
			? "2px 0 6px rgba(255,255,255,0.10)"
			: "2px 0 6px rgba(0,0,0,0.10)";
		const shadowRight = this.theme === "dark"
			? "-2px 0 6px rgba(255,255,255,0.10)"
			: "-2px 0 6px rgba(0,0,0,0.10)";

		if (this.fixedLeftLayer && this.fixedLeftInner) {
			const scrollLeft = this.bodyDiv.scrollLeft;
			// Per-column sticky: определяем сколько колонок прилипло
			let stuckCount = 0;
			for (let i = 0; i < this.fixedLeftCols.length; i++) {
				const c = this.fixedLeftCols[i];
				if (scrollLeft >= this.colLeft(c) - this.fixedLeftCompact[i]) {
					stuckCount = i + 1;
				} else break;
			}
			this.currentStuckCount = stuckCount;

			if (stuckCount === 0) {
				this.fixedLeftLayer.style.display = "none";
			} else {
				const last = stuckCount - 1;
				const stuckWidth = this.fixedLeftCompact[last] + (this.colWidths[this.fixedLeftCols[last]] ?? DEFAULT_COL_WIDTH);
				this.fixedLeftLayer.style.display = "";
				this.fixedLeftLayer.style.top = `${this.headerH}px`;
				this.fixedLeftLayer.style.bottom = `${scrollbarH}px`;
				this.fixedLeftLayer.style.left = `${INDEX_HEADER_WIDTH}px`;
				this.fixedLeftLayer.style.width = `${stuckWidth}px`;
				this.fixedLeftLayer.style.boxShadow = shadowLeft;
				this.fixedLeftInner.style.transform = `translateY(${-scrollTop}px)`;
				this.layoutFixedPoolByList(
					this.fixedLeftRows, this.fixedLeftInner,
					sr, er,
					this.fixedLeftCols.slice(0, stuckCount),
					this.fixedLeftCompact,
				);
				this.updateFixedLayerRangeByList(
					this.fixedLeftRange,
					this.fixedLeftCols.slice(0, stuckCount),
					this.fixedLeftCompact,
					"left",
				);
			}
		}

		if (this.fixedRightLayer && this.fixedRightInner) {
			const scrollLeft = this.bodyDiv.scrollLeft;
			const bodyWidth = this.bodyDiv.clientWidth;
			const nR = this.fixedRightCols.length;
			// Per-column sticky справа: правая колонка прилипает первой
			let rightStuckCount = 0;
			for (let i = nR - 1; i >= 0; i--) {
				const c = this.fixedRightCols[i];
				const cw = this.colWidths[c] ?? DEFAULT_COL_WIDTH;
				const compactFromRight = this.fixedRightTotalW - this.fixedRightCompact[i] - cw;
				if (scrollLeft + bodyWidth < INDEX_HEADER_WIDTH + this.colLeft(c) + cw + compactFromRight) {
					rightStuckCount++;
				} else {
					break;
				}
			}
			this.currentRightStuckCount = rightStuckCount;

			if (rightStuckCount === 0) {
				this.fixedRightLayer.style.display = "none";
			} else {
				const startIdx = nR - rightStuckCount;
				const baseCompact = this.fixedRightCompact[startIdx];
				const layerW = this.fixedRightTotalW - baseCompact;
				const stuckCols = this.fixedRightCols.slice(startIdx);
				const stuckCompacts = this.fixedRightCompact.slice(startIdx).map(c => c - baseCompact);

				this.fixedRightLayer.style.display = "";
				this.fixedRightLayer.style.top = `${this.headerH}px`;
				this.fixedRightLayer.style.bottom = `${scrollbarH}px`;
				this.fixedRightLayer.style.right = `${scrollbarW}px`;
				this.fixedRightLayer.style.width = `${layerW}px`;
				this.fixedRightLayer.style.boxShadow = shadowRight;
				this.fixedRightInner.style.transform = `translateY(${-scrollTop}px)`;
				this.layoutFixedPoolByList(
					this.fixedRightRows, this.fixedRightInner,
					sr, er, stuckCols, stuckCompacts, "right",
				);
				this.updateFixedLayerRangeByList(
					this.fixedRightRange, stuckCols, stuckCompacts, "right",
				);
			}
		}
	}

	/** Рендер fixed-left/right колонок по произвольному списку с компактными позициями (per-column sticky). */
	private layoutFixedPoolByList(
		pool: RowElementPool[],
		container: HTMLDivElement,
		sr: number, er: number,
		cols: number[],
		compacts: number[],
		side: "left" | "right" = "left",
	): void {
		const needed = er - sr + 1;
		while (pool.length > needed) pool.pop()?.el.remove();
		while (pool.length < needed) {
			const el = document.createElement("div");
			el.className = "nt-row";
			container.append(el);
			pool.push({ row: -1, el, cells: [] });
		}

		for (let i = 0; i < needed; i++) {
			const row = sr + i;
			const p = pool[i];
			p.row = row;
			p.el.style.top = `${this.rowTop(row)}px`;
			p.el.style.height = `${this.getRowHeight(row)}px`;
			p.el.classList.toggle("nt-row--disabled", this.disabledRows.has(this.rowIdAt(this.dataRow(row))));
			p.el.classList.toggle("nt-row--striped", this.striped && row % 2 === 0);

			while (p.cells.length < cols.length) {
				const cell = document.createElement("div");
				cell.className = "nt-cell";
				cell.style.pointerEvents = "auto";
				p.el.append(cell);
				p.cells.push(cell);
			}

			const dr = this.dataRow(row);
			for (let ci = 0; ci < cols.length; ci++) {
				const c = cols[ci];
				const colDef = this.columns[c];
				const el = p.cells[ci];
				el.style.width = `${this.colWidths[c]}px`;
				el.style.height = `${this.getRowHeight(row)}px`;
				el.style.transform = `translateX(${compacts[ci]}px)`;
				el.style.display = "";
				el.dataset.col = String(c);
				el.dataset.row = String(row);
				el.classList.toggle("nt-cell--fixed-left", side === "left");
				el.classList.toggle("nt-cell--fixed-right", side === "right");
				el.classList.toggle("nt-cell--disabled", this.disabledRows.has(this.rowIdAt(dr)));
				el.classList.toggle("nt-cell--readonly", !this.readOnly && !!colDef?.readOnly);
				el.style.cursor = this.readOnly ? "default" : "";
				renderCellContent(el, this.model.get(dr, c), colDef, this.cellConfig, this.editingCell);
				this.updateCellError(el, c, dr);
			}
			for (let ci = cols.length; ci < p.cells.length; ci++) {
				p.cells[ci].style.display = "none";
			}
		}
	}

	/** Оверлей выделения для произвольного списка stuck-колонок (per-column sticky). */
	private updateFixedLayerRangeByList(
		rangeEl: HTMLDivElement | null,
		stuckCols: number[],
		compacts: number[],
		side: "left" | "right",
	): void {
		if (!rangeEl || stuckCols.length === 0) {
			if (rangeEl) rangeEl.style.display = "none";
			return;
		}
		if (this.editing) { rangeEl.style.display = "none"; return; }
		const selStart = this.selectedRect?.start;
		const selEnd = this.selectedRect?.end;
		if (!selStart || !selEnd) { rangeEl.style.display = "none"; return; }
		const overallSc = Math.min(selStart.col, selEnd.col);
		const overallEc = Math.max(selStart.col, selEnd.col);
		const sr = Math.min(selStart.row, selEnd.row);
		const er = Math.max(selStart.row, selEnd.row);

		let leftCompact = -1, rightEnd = 0;
		for (let i = 0; i < stuckCols.length; i++) {
			const c = stuckCols[i];
			if (c >= overallSc && c <= overallEc) {
				if (leftCompact < 0) leftCompact = compacts[i];
				rightEnd = compacts[i] + (this.colWidths[c] ?? DEFAULT_COL_WIDTH);
			}
		}
		if (leftCompact < 0) { rangeEl.style.display = "none"; return; }

		rangeEl.style.left = `${leftCompact}px`;
		rangeEl.style.top = `${this.rowTop(sr)}px`;
		rangeEl.style.width = `${rightEnd - leftCompact}px`;
		rangeEl.style.height = `${this.rowTop(er) + this.getRowHeight(er) - this.rowTop(sr)}px`;
		rangeEl.style.display = "block";
		if (side === "left") {
			rangeEl.style.borderRight = overallEc > stuckCols[stuckCols.length - 1] ? "none" : "";
		} else {
			rangeEl.style.borderLeft = overallSc < stuckCols[0] ? "none" : "";
		}
	}


	/** translateX ячейки с учётом фиксации. scrollLeft/clientWidth — из bodyDiv. */
	private cellTranslateX(c: number, scrollLeft: number, clientWidth: number): number {
		const fixedLeftIdx = this.fixedLeftCols.indexOf(c);
		if (fixedLeftIdx >= 0 && fixedLeftIdx < this.currentStuckCount) {
			// Прилипшая fixed-left: редактор открывается на компактной позиции в слое
			return scrollLeft + this.fixedLeftCompact[fixedLeftIdx];
		}
		const fixedRightIdx = this.fixedRightCols.indexOf(c);
		if (fixedRightIdx >= 0) {
			const nR = this.fixedRightCols.length;
			const startIdx = nR - this.currentRightStuckCount;
			if (fixedRightIdx >= startIdx) {
				// Stuck fixed-right: позиция в компактном слое справа
				const layerW = this.fixedRightTotalW - this.fixedRightCompact[startIdx];
				const p = this.fixedRightCompact[fixedRightIdx] - this.fixedRightCompact[startIdx];
				return scrollLeft + clientWidth - layerW + p;
			}
		}
		return this.colLeft(c);
	}

	/** Обновить height всех контейнеров после изменения rowMap */
	updateLayout(): void {
		this.rebuildRowTopCache();
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
		const { scrollLeft, scrollTop, clientWidth } = this.bodyDiv;
		const bodyY = offsetY + scrollTop;
		const row = Math.min(Math.max(0, this.rowIndexAt(Math.max(bodyY, 0))), this.visibleRowCount() - 1);

		// Fixed-left: клик в прилипшей зоне (per-column sticky)
		if (this.currentStuckCount > 0) {
			const last = this.currentStuckCount - 1;
			const stuckWidth = this.fixedLeftCompact[last] + (this.colWidths[this.fixedLeftCols[last]] ?? DEFAULT_COL_WIDTH);
			if (offsetX >= INDEX_HEADER_WIDTH && offsetX < INDEX_HEADER_WIDTH + stuckWidth) {
				const localX = offsetX - INDEX_HEADER_WIDTH;
				// Найти ближайшую stuck-колонку по localX
				let col = this.fixedLeftCols[0];
				for (let i = this.currentStuckCount - 1; i >= 0; i--) {
					if (localX >= this.fixedLeftCompact[i]) { col = this.fixedLeftCols[i]; break; }
				}
				return { row, col };
			}
		}

		// Fixed-right: клик в зоне прилипшего слоя справа
		if (this.currentRightStuckCount > 0) {
			const nR = this.fixedRightCols.length;
			const startIdx = nR - this.currentRightStuckCount;
			const layerW = this.fixedRightTotalW - this.fixedRightCompact[startIdx];
			if (offsetX >= clientWidth - layerW) {
				const localX = offsetX - (clientWidth - layerW);
				const stuckCols = this.fixedRightCols.slice(startIdx);
				const baseCompact = this.fixedRightCompact[startIdx];
				let col = stuckCols[stuckCols.length - 1];
				for (let i = stuckCols.length - 1; i >= 0; i--) {
					const p = this.fixedRightCompact[startIdx + i] - baseCompact;
					if (localX >= p) { col = stuckCols[i]; break; }
				}
				return { row, col };
			}
		}

		// Обычная ячейка
		const bodyX = offsetX + scrollLeft - INDEX_HEADER_WIDTH;
		const col = Math.min(Math.max(0, this.findColByOffset(Math.max(bodyX, 0))), this.colWidths.length - 1);
		return { row, col };
	}

	/** Бинарный поиск колонки по смещению X (O(log N) по colLeftCache). */
	private findColByOffset(bodyX: number): number {
		let lo = 0;
		let hi = this.totalCols - 1;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (this.colLeftCache[mid + 1] <= bodyX) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	/** Бинарный поиск строки по смещению Y (использует rowTopCache). */
	private rowIndexAt(bodyY: number): number {
		if (bodyY <= 0) return 0;
		let lo = 0;
		let hi = this.visibleRowCount();
		while (lo < hi) {
			const mid = Math.floor((lo + hi) / 2);
			if (this.rowTop(mid + 1) <= bodyY) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	/** Прямоугольник ячейки в координатах cellsLayer (учитывает скролл и fixed-колонки). */
	bodyBox(
		row: number,
		col: number,
	): { left: number; top: number; width: number; height: number } {
		// Для fixed-колонок возвращаем позицию в координатах cellsLayer с учётом скролла,
		// чтобы редактор открывался прямо над ячейкой (не уходил за пределы вьюпорта).
		const { scrollLeft, clientWidth } = this.bodyDiv;
		return {
			left: this.cellTranslateX(col, scrollLeft, clientWidth),
			top: this.rowTop(row),
			width: this.getColWidth(col),
			height: this.getRowHeight(row),
		};
	}

	/**
	 * Прокрутить вьюпорт так, чтобы ячейка была видна.
	 * Не скроллит, если ячейка уже в зоне видимости.
	 */
	scrollToCell(row: number, col: number): void {
		const top = this.rowTop(row);
		const bottom = top + this.getRowHeight(row);
		const { scrollTop, scrollLeft, clientWidth, clientHeight } = this.bodyDiv;
		if (top < scrollTop) {
			this.bodyDiv.scrollTop = top;
		} else if (bottom > scrollTop + clientHeight) {
			this.bodyDiv.scrollTop = bottom - clientHeight;
		}
		// Прилипшие fixed-left/right всегда видимы — горизонтальный скролл не нужен
		const fixedLeftIdx = this.fixedLeftCols.indexOf(col);
		const isStuckLeft = fixedLeftIdx >= 0 && fixedLeftIdx < this.currentStuckCount;
		const fixedRightIdx = this.fixedRightCols.indexOf(col);
		const nR = this.fixedRightCols.length;
		const isStuckRight = fixedRightIdx >= 0 && fixedRightIdx >= nR - this.currentRightStuckCount;
		if (isStuckLeft || isStuckRight) return;
		const cellLeft = this.colLeft(col);
		const cellRight = cellLeft + this.getColWidth(col);
		// Учесть ширину прилипшей зоны
		const fixedLeftW = this.currentStuckCount > 0
			? this.fixedLeftCompact[this.currentStuckCount - 1] + (this.colWidths[this.fixedLeftCols[this.currentStuckCount - 1]] ?? DEFAULT_COL_WIDTH)
			: 0;
		const startIdxR = nR - this.currentRightStuckCount;
		const fixedRightW = this.currentRightStuckCount > 0
			? this.fixedRightTotalW - this.fixedRightCompact[startIdxR] : 0;
		if (cellLeft - fixedLeftW < scrollLeft) {
			this.bodyDiv.scrollLeft = cellLeft - fixedLeftW;
		} else if (INDEX_HEADER_WIDTH + cellRight + fixedRightW > scrollLeft + clientWidth) {
			this.bodyDiv.scrollLeft = INDEX_HEADER_WIDTH + cellRight + fixedRightW - clientWidth;
		}
	}

	/**
	 * Главный метод рендеринга.
	 * Вычисляет окно видимости → если изменилось, перекладывает строки/ячейки.
	 * Заголовки перекладываются всегда (скролл-оффсет меняется).
	 */
	render(force = false): void {
		this.syncColWidths();
		this.dropRowsBeyondData();
		if (force && !this.suspendAutoHeights) this.recalcAutoRowHeights();
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

	// Fixed-слои синхронизируются всегда (scrollTop, размеры колонок могут меняться)
		this.layoutFixedLayers(sr, er);
	// Шапка: расширяем диапазон чтобы fixed-колонки всегда рендерились в headerRow
		const hsc = this.fixedLeftCount > 0 ? 0 : sc;
		const hec = this.fixedRightCols.length > 0 ? this.totalCols - 1 : ec;
		this.layoutHeader(hsc, hec);
		this.layoutRowHeader(sr, er);
		this.fitContainerHeight();
		const noRows = this.visibleRowCount() === 0;
		this.noDataEl.style.display = (!this.allowAddRows && noRows) ? "" : "none";
	}

	/**
	 * Подогнать ширины колонок под вьюпорт. Таблица всегда
	 * занимает 100% ширины — пустоты справа не бывает.
	 * - manual-колонки (ручной ресайз/сохранённый лейаут) — точные px, не трогаем;
	 * - остальные: числовой width → px, без width → DEFAULT_COL_WIDTH (равные доли);
	 * - хватает места → растягиваем не-manual до 100%;
	 * - не хватает → естественные ширины + горизонтальный скролл;
	 * - фолбэк: если не-manual колонок нет, а сумма manual меньше вьюпорта —
	 *   растягиваем manual пропорционально (пустота недопустима).
	 * Пересчёт — только при изменении доступной ширины.
	 */
	private syncColWidths(): void {
		const available = this.bodyDiv.clientWidth - INDEX_HEADER_WIDTH;
		if (available <= 0 || available === this.lastViewportW) return;
		this.lastViewportW = available;

		let manualSum = 0;
		const flexible: number[] = [];
		for (let c = 0; c < this.dataColCount; c++) {
			if (this.manualColWidths.has(c)) {
				manualSum += this.colWidths[c] ?? DEFAULT_COL_WIDTH;
				continue;
			}
			flexible.push(c);
		}

		const remaining = Math.max(0, available - manualSum);

		// Фолбэк: нет гибких колонок, а ручные уже совокупно — заполняем 100% за счёт их самих
		if (flexible.length === 0) {
			if (manualSum <= 0 || manualSum >= available) return;
			const scale = available / manualSum;
			for (let c = 0; c < this.dataColCount; c++) {
				this.colWidths[c] = Math.max(MIN_COL_WIDTH, Math.round((this.colWidths[c] ?? DEFAULT_COL_WIDTH) * scale));
			}
			this.rebuildColLeftCache();
			this.updateContainerSizes();
			return;
		}

		const desired = new Map<number, number>();
		for (const c of flexible) {
			desired.set(c, this.columns[c]?.width ?? DEFAULT_COL_WIDTH);
		}

		const total = Array.from(desired.values()).reduce((s, v) => s + v, 0);
		if (total <= 0) return;

		// Хватает места — заполняем 100%; не хватает — естественные ширины + скролл
		const scale = total <= remaining ? remaining / total : 1;
		for (const [c, w] of desired) {
			this.colWidths[c] = Math.max(MIN_COL_WIDTH, Math.round(w * scale));
		}
		this.rebuildColLeftCache();
		this.updateContainerSizes();
	}

	/**
	 * Когда добавление строк запрещено, отбросить строки, выходящие за пределы
	 * исходных данных. rowMap фильтруется, а не пересоздаётся — иначе сбрасывались
	 * бы активные сортировка и фильтр.
	 */
	private dropRowsBeyondData(): void {
		if (this.allowAddRows || this.totalRows <= this.initialRowCount) return;
		this.rowHeights.length = this.initialRowCount;
		this.rowMap = this.rowMap.filter((r) => r < this.initialRowCount);
		this.totalRows = this.initialRowCount;
		this.baseRowCount = this.totalRows;
		this.rebuildRowTopCache();
	}

	/** Подогнать высоту контейнера под содержимое (шапка + строки + отступ). */
	private fitContainerHeight(): void {
		const noRows = this.visibleRowCount() === 0;
		const contentH = this.headerH + this.totalHeight() + (noRows ? 100 : 20);
		this.container.style.height = `${Math.max(0, contentH)}px`;
	}

	/** Включить/выключить режим редактирования: рамка выделения прячется и в fixed-слоях. */
	setEditing(on: boolean): void {
		if (this.editing === on) return;
		this.editing = on;
		this.render();
	}

	/** Перерисовать содержимое видимых ячеек без перекладки окна (изменения модели). */
	refreshValues(): void {
		this.recalcAutoRowHeights();
		for (const pool of this.rows) {
			const dr = this.dataRow(pool.row);
			for (let ci = 0; ci < pool.cells.length; ci++) {
				const c = this.currentStartCol + ci;
				if (c > this.currentEndCol) break;
				renderCellContent(pool.cells[ci], this.model.get(dr, c), this.columns[c], this.cellConfig, this.editingCell);
				this.updateCellError(pool.cells[ci], c, dr);
			}
		}
		// Fixed-слои не входят в this.rows: перерисовать прилипшие ячейки
		// по dataset.col, иначе заливка/правки на fixed-колонках не видны до скролла
		for (const pool of this.fixedLeftRows) {
			this.refreshFixedPoolRow(pool);
		}
		for (const pool of this.fixedRightRows) {
			this.refreshFixedPoolRow(pool);
		}
		this.rebuildRowTopCache();
		this.updateContainerSizes();
		for (const pool of this.rows) {
			if (pool.row < 0) continue;
			pool.el.style.top = `${this.rowTop(pool.row)}px`;
			// Авто-высоты могли измениться — обновить и высоты строк/ячеек
			const h = this.getRowHeight(pool.row);
			pool.el.style.height = `${h}px`;
			for (const cellEl of pool.cells) {
				if (cellEl.style.display === "none") continue;
				cellEl.style.height = `${h}px`;
			}
		}
		for (const pool of this.fixedLeftRows) {
			this.refreshFixedPoolRowHeight(pool);
		}
		for (const pool of this.fixedRightRows) {
			this.refreshFixedPoolRowHeight(pool);
		}
		this.onScrollCallback?.();
	}

	/** Перерисовать содержимое строки fixed-пула по dataset.col ячеек. */
	private refreshFixedPoolRow(pool: RowElementPool): void {
		if (pool.row < 0) return;
		const dr = this.dataRow(pool.row);
		for (const cellEl of pool.cells) {
			if (cellEl.style.display === "none") continue;
			const c = Number(cellEl.dataset.col);
			if (Number.isNaN(c)) continue;
			renderCellContent(cellEl, this.model.get(dr, c), this.columns[c], this.cellConfig, this.editingCell);
			this.updateCellError(cellEl, c, dr);
		}
	}

	/** Обновить позицию и высоту строки fixed-пула после пересчёта авто-высот. */
	private refreshFixedPoolRowHeight(pool: RowElementPool): void {
		if (pool.row < 0) return;
		pool.el.style.top = `${this.rowTop(pool.row)}px`;
		const h = this.getRowHeight(pool.row);
		pool.el.style.height = `${h}px`;
		for (const cellEl of pool.cells) {
			if (cellEl.style.display === "none") continue;
			cellEl.style.height = `${h}px`;
		}
	}

	/** Прокомпьютить минимальные высоты строк по тексту ВСЕХ колонок (не зависит от скролла). */
	recalcAutoRowHeights(): void {
		const capLines = this.cellConfig?.ellipsis
			? Math.max(1, this.cellConfig.capLines ?? 1)
			: Infinity;
		this.autoRowHeights = new Array(this.totalRows).fill(DEFAULT_ROW_HEIGHT);
		for (let dr = 0; dr < this.totalRows; dr++) {
			let maxPx = DEFAULT_ROW_HEIGHT;
			for (let c = 0; c < this.dataColCount; c++) {
				const colDef = this.columns[c];
				if (!colDef || colDef.type === "boolean") continue;
				const cell = this.model.get(dr, c);
				const text = cell?.display ?? formatCellDisplay(cell?.value ?? null, colDef);
				if (!text) continue;
				const colW = this.colWidths[c] ?? DEFAULT_COL_WIDTH;
				// Эвристика: короткий текст заведомо в одну строку — замер не нужен
				// (8px/символ — консервативно для кириллицы)
				const approxChars = Math.floor((colW - 16) / 8) - 1;
				if (String(text).length <= approxChars) continue;
				const raw = this.measureTextPx(String(text), colW);
				const px = Math.min(raw + 8, capLines * 17 + 8);
				if (px > maxPx) maxPx = px;
			}
			this.autoRowHeights[dr] = maxPx;
		}
		this.rebuildRowTopCache();
		this.updateContainerSizes();
	}

	/** Точная высота текста в px при заданной ширине колонки (условия как в ячейке). */
	private measureTextPx(text: string, colWidth: number, multiline = false): number {
		const cacheKey = `${multiline ? "m" : "s"}:${Math.round(colWidth)}|${text}`;
		const cached = this.measureCache.get(cacheKey);
		if (cached !== undefined) return cached;
		if (!this.measureEl) {
			this.measureEl = document.createElement("span");
			this.measureEl.className = "nt-cell-text";
			this.measureEl.style.position = "absolute";
			this.measureEl.style.visibility = "hidden";
			this.container.append(this.measureEl);
		}
		if (this.cellConfig?.ellipsis && !multiline) {
			this.measureEl.style.display = "-webkit-box";
			this.measureEl.style.webkitBoxOrient = "vertical";
			this.measureEl.style.webkitLineClamp = "unset";
		} else {
			this.measureEl.style.display = "block";
			this.measureEl.style.webkitBoxOrient = "";
			this.measureEl.style.webkitLineClamp = "";
		}
		this.measureEl.style.width = `${Math.max(20, colWidth - 16)}px`;
		this.measureEl.textContent = text;
		const px = this.measureEl.scrollHeight;
		if (this.measureCache.size > 50000) this.measureCache.clear();
		this.measureCache.set(cacheKey, px);
		return px;
	}

	// ──────────────────────────────────────────────────────────────────────
	// Приватные методы
	// ──────────────────────────────────────────────────────────────────────

	/** Подсветить ячейку шапки (строку или колонку), если она попадает в выделение. */
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

	/** Перестроить кеш левых границ колонок (colLeftCache) и компактные смещения fixed-колонок. */
	rebuildColLeftCache(): void {
		this.colLeftCache = new Array(this.totalCols + 1).fill(0);
		for (let i = 0; i < this.totalCols; i++) {
			this.colLeftCache[i + 1] = this.colLeftCache[i] + this.colWidths[i];
		}
		// Пересчитать компактные позиции fixed-left (ширины могли измениться)
		let acc = 0;
		for (let i = 0; i < this.fixedLeftCols.length; i++) {
			this.fixedLeftCompact[i] = acc;
			acc += this.colWidths[this.fixedLeftCols[i]] ?? DEFAULT_COL_WIDTH;
		}
		this.fixedLeftTotalW = acc;
		if (this.fixedLeftLayer) this.fixedLeftLayer.style.width = `${this.fixedLeftTotalW}px`;
		// Пересчитать компактные позиции fixed-right
		let accR = 0;
		for (let i = 0; i < this.fixedRightCols.length; i++) {
			this.fixedRightCompact[i] = accR;
			accR += this.colWidths[this.fixedRightCols[i]] ?? DEFAULT_COL_WIDTH;
		}
		this.fixedRightTotalW = accR;
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

		// Первая видимая колонка — бинарным поиском по префикс-суммам
		let sc = Math.max(0, this.findColByOffset(Math.max(scrollLeft, 0)) - BUFFER_COLS);
		const colBufW = this.totalCols > 0 ? this.totalWidth() / this.totalCols : DEFAULT_COL_WIDTH;
		const rightEdge = this.colLeft(sc) + clientWidth + BUFFER_COLS * colBufW;
		let ec = Math.min(this.totalCols - 1, this.findColByOffset(rightEdge) + 1);

		// Fixed-left и fixed-right рендерятся в отдельных слоях поверх тела (per-column sticky).
		// Тело рендерит их в своих координатах — слои перекрывают их при прилипании.

		return { sr, er, sc, ec };
	}

	/** Обновить индикатор ошибки валидации на ячейке. */
	private updateCellError(el: HTMLElement, col: number, dataRow: number): void {
		const colName = this.columns[col]?.name ?? String(col);
		const rowId = this.rowIds?.[dataRow] ?? `new_${dataRow + 1}`;
		const key = `${colName}|${rowId}`;
		const errors = this.validationErrors[key];
		const warnings = this.validationWarnings[key];
		const hasError = errors && errors.length > 0;
		const hasWarning = warnings && warnings.length > 0;

		let indicator = el.querySelector(".nt-cell-error, .nt-cell-warning") as HTMLElement | null;
		if (hasError) {
			if (!indicator || !indicator.classList.contains("nt-cell-error")) {
				indicator?.remove();
				indicator = document.createElement("div");
				indicator.className = "nt-cell-error";
				indicator.addEventListener("mouseenter", (ev) => {
					const target = ev.currentTarget as HTMLElement;
					const current = this.validationErrors[target.dataset.cellKey ?? ""];
					if (current?.length) this.showErrorPopup(target, current, "error");
				});
				indicator.addEventListener("mouseleave", () => this.hideErrorPopup());
				el.append(indicator);
			}
			indicator.dataset.cellKey = key;
			indicator.style.display = "";
		} else if (hasWarning) {
			if (!indicator || !indicator.classList.contains("nt-cell-warning")) {
				indicator?.remove();
				indicator = document.createElement("div");
				indicator.className = "nt-cell-warning";
				indicator.addEventListener("mouseenter", (ev) => {
					const target = ev.currentTarget as HTMLElement;
					const current = this.validationWarnings[target.dataset.cellKey ?? ""];
					if (current?.length) this.showErrorPopup(target, current, "warning");
				});
				indicator.addEventListener("mouseleave", () => this.hideErrorPopup());
				el.append(indicator);
			}
			indicator.dataset.cellKey = key;
			indicator.style.display = "";
		} else if (indicator) {
			indicator.style.display = "none";
		}
	}

	private errorPopup: HTMLDivElement | null = null;

	/** Показать попап с текстом ошибки/предупреждения рядом с индикатором ячейки. */
	private showErrorPopup(anchor: HTMLElement, errors: string[], type: "error" | "warning" = "error"): void {
		this.hideErrorPopup();
		const popup = document.createElement("div");
		const cls = type === "warning" ? "nt-error-popup nt-warning-popup" : "nt-error-popup";
		popup.className = `${cls}${this.theme === "dark" ? " nt-dark" : ""}`;
		for (const message of errors) {
			const item = document.createElement("div");
			item.className = "nt-error-popup-item";
			item.textContent = message;
			popup.append(item);
		}
		const rect = anchor.getBoundingClientRect();
		document.body.append(popup);
		this.errorPopup = popup;

		// Кламп по видимой области: попап не должен выходить за края окна
		const pw = popup.offsetWidth;
		const ph = popup.offsetHeight;
		const maxLeft = window.innerWidth - pw - 8;
		if (rect.right + 4 > maxLeft) {
			// Не помещается справа — показать слева от маркера
			popup.style.left = `${Math.max(8, rect.left - pw - 4)}px`;
		} else {
			popup.style.left = `${rect.right + 4}px`;
		}
		popup.style.top = `${Math.min(Math.max(8, rect.top), window.innerHeight - ph - 8)}px`;
	}

	/** Скрыть попап ошибки/предупреждения. */
	private hideErrorPopup(): void {
		if (this.errorPopup) { this.errorPopup.remove(); this.errorPopup = null; }
	}

	/**
	 * Переложить DOM-строки и ячейки под новое окно виртуализации.
	 * Использует пул RowElementPool — переиспользует созданные ранее ноды.
	 */
	private layoutRows(sr: number, er: number, sc: number, ec: number): void {
		const needed = er - sr + 1;

		// Удалить лишние DOM-ноды строк
		while (this.rows.length > needed) {
			const pool = this.rows.pop();
			pool?.el.remove();
		}

		// Добрать или переиспользовать пулы
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
			pool.el.classList.toggle("nt-row--disabled", this.disabledRows.has(this.rowIdAt(this.dataRow(row))));
			pool.el.classList.toggle("nt-row--striped", this.striped && row % 2 === 0);
			this.renderRowContents(pool, row, sc, ec);
		}
	}

	/** Обновить ячейки одной строки пула под колоночное окно sc..ec (виртуализация по колонкам). */
	private renderRowContents(
		pool: RowElementPool,
		row: number,
		sc: number,
		ec: number,
	): void {
		const count = Math.max(0, ec - sc + 1);

		// Добрать ячейки в пуле
		while (pool.cells.length < count) {
			const cell = document.createElement("div");
			cell.className = "nt-cell";
			pool.el.append(cell);
			pool.cells.push(cell);
		}

		// Обновить видимые ячейки
		for (let i = 0; i < count; i++) {
			const c = sc + i;
			const colDef = this.columns[c];
			const el = pool.cells[i];
			el.style.width = `${this.colWidths[c]}px`;
			el.style.height = `${this.getRowHeight(row)}px`;
			el.style.transform = `translateX(${this.colLeft(c)}px)`;
			el.style.display = "";
			el.dataset.col = String(c);
			el.dataset.row = String(row);
			el.style.zIndex = "";
			el.classList.remove("nt-cell--fixed-left", "nt-cell--fixed-right");
			const isDisabledRow = this.disabledRows.has(this.rowIdAt(this.dataRow(row)));
			const isReadOnlyCol = !this.readOnly && !!colDef?.readOnly;
			el.classList.toggle("nt-cell--disabled", isDisabledRow);
			el.classList.toggle("nt-cell--readonly", isReadOnlyCol);
			el.style.cursor = this.readOnly ? "default" : "";
			renderCellContent(el, this.model.get(this.dataRow(row), c), colDef, this.cellConfig, this.editingCell);
			// Индикатор ошибки валидации
			this.updateCellError(el, c, this.dataRow(row));
		}

		// Скрыть лишние ячейки
		for (let i = count; i < pool.cells.length; i++) {
			pool.cells[i].style.display = "none";
		}
	}

	/** Переложить ячейки шапки под колоночное окно sc..ec с учётом rowSpan/colSpan сетки headerGrid. */
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
					cells.push({ col: h.col, colSpan: h.colSpan, rowSpan: h.rowSpan, label: h.label || "" });
					for (let rr = level + 1; rr < level + h.rowSpan && rr < this.maxDepth; rr++) {
						for (let cc = h.col; cc < h.col + h.colSpan; cc++) {
							covered.add(`${rr},${cc}`);
						}
					}
					c += h.colSpan;
				} else {
					const phantomRowSpan = this.maxDepth - level;
					cells.push({ col: c, colSpan: 1, rowSpan: phantomRowSpan, label: "", phantom: true });
					for (let rr = level + 1; rr < level + phantomRowSpan && rr < this.maxDepth; rr++) {
						covered.add(`${rr},${c}`);
					}
					c++;
				}
			}

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
					spanWidth += this.getColWidth(ci);
				}

				let label = el.querySelector(".nt-header-label") as HTMLSpanElement | null;
				if (!label) {
					el.textContent = "";
					label = document.createElement("span");
					label.className = "nt-header-label";
					el.append(label);

					const cellBottom = level + cellInfo.rowSpan - 1;

				if (cellBottom === leafLevel && cellInfo.colSpan === 1 && !cellInfo.phantom) {
					const btn = document.createElement("span");
					btn.className = "nt-header-filter-sort-btn";
					btn.innerHTML = filterDefaultSvg();
					el.append(btn);
				}
					if (cellBottom === leafLevel && cellInfo.colSpan === 1 && !cellInfo.phantom) {
						const resizer = document.createElement("div");
						resizer.className = "nt-resize-handle";
						el.append(resizer);
					}
				}

				// Обновить data-col на всех дочерних элементах (при реюзе ячейки для другой колонки)
			const sortBtn = el.querySelector(".nt-header-filter-sort-btn") as HTMLElement | null;
			if (sortBtn) sortBtn.dataset.col = String(cellInfo.col);
				const resizer = el.querySelector(".nt-resize-handle") as HTMLElement | null;
				if (resizer) resizer.dataset.col = String(cellInfo.col);
			label.textContent = cellInfo.label;
			label.style.width = "";
			label.style.flex = "0 1 auto";
			label.style.minWidth = "0";
			label.style.maxWidth = "100%";
			const ellipsis = this.headerConfig?.ellipsis;
			const layout = this.headerConfig?.layout;
			label.style.whiteSpace = ellipsis ? "nowrap" : "normal";
			label.style.wordBreak = ellipsis ? "" : "break-word";
			label.style.textOverflow = ellipsis ? "ellipsis" : "";
			el.style.width = `${spanWidth}px`;
			if (!ellipsis) {
				el.style.height = `${cellInfo.rowSpan * (this.cachedHeaderMaxH[level] || HEADER_ROW_HEIGHT)}px`;
			} else {
				el.style.height = `${cellInfo.rowSpan * HEADER_ROW_HEIGHT}px`;
			}
			el.style.padding = ellipsis ? "0 8px" : "4px 8px";
			el.style.justifyContent = layout?.horizontal ?? "center";
			// Позиционирование label по вертикали
			const labelV = layout?.label ?? "center";
			if (labelV === "top") el.style.alignItems = "flex-start";
			else if (labelV === "bottom") el.style.alignItems = "flex-end";
			else el.style.alignItems = "center";
			// Позиционирование иконки
			const iconV = layout?.icon ?? "center";
			if (sortBtn) {
				if (iconV === "bottom") {
					sortBtn.style.alignSelf = "flex-end";
					sortBtn.style.marginTop = "auto";
				} else if (iconV === "top") {
					sortBtn.style.alignSelf = "flex-start";
				} else {
					sortBtn.style.alignSelf = "center";
					sortBtn.style.marginTop = "";
				}
			}
				const col = cellInfo.col;
				// Per-column sticky: проверяем stuck-колонки
				const fixedLeftIdx = this.fixedLeftCols.indexOf(col);
				if (fixedLeftIdx >= 0 && fixedLeftIdx < this.currentStuckCount) {
					// Прилипла: позиция — компактный offset в fixed-слое
					el.style.left = `${INDEX_HEADER_WIDTH + this.fixedLeftCompact[fixedLeftIdx]}px`;
					el.style.zIndex = "12";
					el.classList.add("nt-header-cell--fixed-left");
					el.classList.remove("nt-header-cell--fixed-right");
				} else {
					const fixedRightIdx = this.fixedRightCols.indexOf(col);
					const nR = this.fixedRightCols.length;
					const startIdxR = nR - this.currentRightStuckCount;
					if (fixedRightIdx >= 0 && fixedRightIdx >= startIdxR && !cellInfo.phantom) {
						// Прилипшая fixed-right: позиция в fixed-right слое (layer right = bodyDiv.clientWidth)
						const layerW = this.fixedRightTotalW - this.fixedRightCompact[startIdxR];
						const p = this.fixedRightCompact[fixedRightIdx] - this.fixedRightCompact[startIdxR];
						el.style.left = `${this.bodyDiv.clientWidth - layerW + p}px`;
						el.style.zIndex = "12";
						el.classList.remove("nt-header-cell--fixed-left");
						el.classList.add("nt-header-cell--fixed-right");
						// Тень только у граничного (самого левого) stuck right столбца
						el.style.boxShadow = fixedRightIdx === startIdxR ? "" : "none";
					} else {
						el.style.left = `${INDEX_HEADER_WIDTH + this.colLeft(col) - sl}px`;
						el.style.zIndex = "";
						el.style.boxShadow = "";
						el.classList.remove("nt-header-cell--fixed-left", "nt-header-cell--fixed-right");
					}
				}
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

		if (!this.headerConfig?.ellipsis) {
			this._recalcHeaderHeights();
		}
	}

	/**
	 * Пересчитать высоты уровней шапки по тексту заголовков: из кеша, если ничего
	 * не менялось, иначе детерминированно по ширине колонок (без scrollHeight).
	 */
	private _recalcHeaderHeights(): void {
		if (!this.headerHeightsDirty && this.cachedHeaderMaxH.length === this.maxDepth) {
			// Использовать кеш — без замера scrollHeight (источник нестабильности при скролле)
			let totalH = 0;
			for (let level = 0; level < this.maxDepth; level++) {
				const maxH = this.cachedHeaderMaxH[level];
				this.headerRows[level].style.height = `${maxH}px`;
				this.headerRows[level].style.top = `${totalH}px`;
				for (const el of Array.from(this.headerRows[level].children)) {
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
		} else {
			// Пересчитать по тексту всех колонок (детерминированно, без scrollHeight)
			let totalH = 0;
			this.cachedHeaderMaxH = [];
			for (let level = 0; level < this.maxDepth; level++) {
				let maxH = HEADER_ROW_HEIGHT;
				for (const h of this.headerGrid) {
					if (h.row !== level || h.colSpan === 0) continue;
					const spanW = this.colWidths.slice(h.col, h.col + h.colSpan).reduce((a, b) => a + b, 0);
					const iconW = (h.colSpan === 1 && !this.columns[h.col]?.children) ? 18 : 0;
					const availableW = Math.max(40, spanW - 20 - iconW);
					// Реальная высота текста с переносом (детерминированно, с кешем)
					const cellH = this.measureTextPx(h.label || "", availableW, true) + 16;
					if (cellH > maxH) maxH = cellH;
				}
				this.cachedHeaderMaxH.push(maxH);
				this.headerRows[level].style.height = `${maxH}px`;
				this.headerRows[level].style.top = `${totalH}px`;
				for (const el of Array.from(this.headerRows[level].children)) {
					const ht = el as HTMLElement;
					if (ht.style.display === "none") continue;
					ht.style.height = `${maxH}px`;
				}
				totalH += maxH;
			}
			this.headerHeightsDirty = false;
			if (totalH !== this.headerH) {
				this.headerH = totalH;
				this.bodyDiv.style.top = `${this.headerH}px`;
				this.headerCol.style.top = `${this.headerH}px`;
				this.corner.style.height = `${this.headerH}px`;
			}
		}
		// Ячейки с rowSpan — сумма высот всех охватываемых строк
		for (const h of this.headerGrid) {
			if (h.rowSpan <= 1) continue;
			const row = this.headerRows[h.row];
			let sumH = 0;
			for (let r = h.row; r < h.row + h.rowSpan && r < this.maxDepth; r++) {
				sumH += Number.parseFloat(this.headerRows[r].style.height) || HEADER_ROW_HEIGHT;
			}
			for (const el of Array.from(row.children)) {
				const ht = el as HTMLElement;
				if (Number(ht.dataset.col) === h.col && ht.style.display !== "none") {
					ht.style.height = `${sumH}px`;
				}
			}
		}
		if (this.selectedRect) this.highlightHeaders(this.selectedRect);
	}

	/** Переложить колонку номеров строк под строковое окно sr..er (виртуализация по строкам). */
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
			setElementText(el, String(r + 1));
			el.style.height = `${this.getRowHeight(r)}px`;
			el.style.width = `${INDEX_HEADER_WIDTH}px`;
			el.style.top = `${this.rowTop(r) - st}px`;
			el.style.display = "";
			el.dataset.row = String(r);
			this.toggleHeaderClass(el, r, "row");
		}
		for (let i = needed; i < this.headerCol.children.length; i++) {
			(this.headerCol.children[i] as HTMLDivElement).style.display = "none";
		}
	}
}

/** Применить набор CSS-стилей к элементу через el.style. */
function applyStyle(
	el: HTMLElement,
	styles: Partial<CSSStyleDeclaration>,
): void {
	for (const [k, v] of Object.entries(styles)) {
		(el.style as unknown as Record<string, string>)[k] = v as string;
	}
}

/** Цвет колонки: строка или функция от значения ячейки; null/undefined — «не применять». */
function resolveColumnColor(
	spec: string | ((value: ScalarCellValue) => string | null | undefined) | undefined,
	value: ScalarCellValue | undefined,
): string | undefined {
	if (!spec) return undefined;
	const c = typeof spec === "function" ? spec(value ?? null) : spec;
	return c || undefined;
}

/**
 * Отрендерить содержимое ячейки: цвета колонки, выравнивание, чекбокс для boolean
 * или текст (с ограничением строк/многоточием при cellConfig.ellipsis).
 */
function renderCellContent(
	el: HTMLDivElement,
	cell: Cell,
	colDef?: ColumnDef,
	cellConfig?: import("../utils/types").CellConfig,
	editingCell?: { row: number; col: number } | null,
): void {
	// Применить стили ячейки: пользовательский (тулбар) побеждает цвет колонки
	const style = cell.style;
	// Ячейка под редактором: заливку не рисуем — белый фон, как у остальных
	// редакторов (сквозь прозрачный select-триггер просвечивали заливка и
	// зелёная подсветка выделения)
	const isEdited = !!editingCell
		&& el.dataset.row !== undefined
		&& Number(el.dataset.row) === editingCell.row
		&& Number(el.dataset.col) === editingCell.col;
	el.style.backgroundColor = isEdited
		? ""
		: style?.background ?? resolveColumnColor(colDef?.backgroundColor, cell.value) ?? "";
	el.style.color = style?.color ?? resolveColumnColor(colDef?.color, cell.value) ?? "";
	// Выравнивание из дефолта колонки (flex-контейнеру нужен justify-content)
	const align = colDef ? getCellAlign(colDef) : undefined;
	if (align === "right") el.style.justifyContent = "flex-end";
	else if (align === "center") el.style.justifyContent = "center";
	else el.style.justifyContent = "flex-start";

	const isBool = colDef?.type === "boolean";
	const isNullableBool = isBool && colDef?.nullable;
	el.classList.toggle("nt-cell--boolean", isBool);

	if (isBool) {
		el.querySelector(".nt-cell-text")?.remove();
		setElementText(el, "");
		let cb = el.querySelector<HTMLInputElement>("input.nt-checkbox");
		if (!cb) {
			cb = document.createElement("input");
			cb.type = "checkbox";
			cb.className = "nt-checkbox";
			cb.tabIndex = -1;
			el.append(cb);
		}
		const val = cell.value;
		const isTrue = val === true || val === "true" || val === 1;
		const isFalse = val === false || val === "false" || val === 0;
		cb.checked = isTrue;
		(cb as HTMLInputElement & { indeterminate?: boolean }).indeterminate = !!(isNullableBool && !isTrue && !isFalse);
		cb.disabled = !!(colDef?.readOnly || el.classList.contains("nt-cell--disabled") || el.classList.contains("nt-cell--readonly"));
		return;
	}

	el.querySelector("input.nt-checkbox")?.remove();
	const displayText = colDef?.type === "boolean" ? "" : cell.display ?? formatCellDisplay(cell.value ?? null, colDef);

	let textSpan = el.querySelector<HTMLElement>(".nt-cell-text");
	if (!textSpan) {
		const first = el.firstChild;
		if (first?.nodeType === Node.TEXT_NODE) first.remove();
		textSpan = document.createElement("span");
		textSpan.className = "nt-cell-text";
		el.prepend(textSpan);
	}
	textSpan.textContent = displayText;
	// ellipsis: ограничение строк многоточием; полный текст — в dataset для кастомного тултипа
	if (cellConfig?.ellipsis) {
		textSpan.style.display = "-webkit-box";
		textSpan.style.webkitBoxOrient = "vertical";
		textSpan.style.overflow = "hidden";
		textSpan.style.webkitLineClamp = String(Math.max(1, cellConfig.capLines ?? 1));
		if (displayText) el.dataset.ntTip = displayText;
		else delete el.dataset.ntTip;
	} else {
		// Полный текст с переносом. display: block обязателен — -webkit-box
		// ломает перенос длинных слитных слов и замер высоты строки
		textSpan.style.display = "block";
		textSpan.style.webkitBoxOrient = "";
		textSpan.style.overflow = "";
		textSpan.style.webkitLineClamp = "";
		delete el.dataset.ntTip;
	}
}

/**
 * Задать текст элемента, не трогая дочерние элементы.
 *
 * el.textContent = "…" удалил бы индикатор ошибки и чекбокс, из-за чего они
 * пересоздавались бы на каждом кадре скролла вместе со своими слушателями.
 */
function setElementText(el: HTMLElement, text: string): void {
	const first = el.firstChild;
	if (first?.nodeType === Node.TEXT_NODE) {
		if (first.nodeValue !== text) first.nodeValue = text;
		return;
	}
	if (text === "") return;
	el.prepend(document.createTextNode(text));
}
