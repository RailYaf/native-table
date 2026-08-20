// ── NativeSheet — основной класс нативной таблицы ───────────────────────────
//
// Координирует подсистемы: Renderer (виртуальный DOM + скролл), SheetModel
// (данные), SheetView (сортировка/фильтр), Editor, SelectionOverlay,
// UndoManager, ContextMenu/SortFilterPopup. DOM нативный, рендерятся только
// видимые ячейки; лейаут отдаётся через onSave — персистенция на стороне адаптера.

import { UndoManager } from "../services/undo-manager";
import { ContextMenu, type ContextMenuItem } from "../ui/context-menu";
import { AutoScroller, startDragSession } from "../ui/drag";
import { Editor } from "../ui/editor";
import { handleKeyboard } from "../ui/keyboard";
import { SelectionOverlay } from "../ui/selection";
import { SortFilterPopup } from "../ui/sort-filter-popup";
import { filterDefaultSvg, filterActiveSvg, sortAscSvg, sortDescSvg, filterAscSvg, filterDescSvg } from "../ui/icons";
import { cellKey, parseCellKey } from "../utils/cell-addr";
import { formatCellDisplay, getTypeDefault, isBoolean, isReadOnly } from "../utils/column-utils";
import { flattenColumns } from "../utils/column-tree";
import { generateTempId } from "../utils/data-convert";
import { DEFAULT_ROW_HEIGHT, INDEX_HEADER_WIDTH, MIN_COL_WIDTH } from "../utils/consts";
import type {
	Cell,
	CellStyle,
	ChangeAction,
	ColumnDef,
	LayoutData,
	NativeSheetOptions,
	ScalarCellValue,
	SelectionRect,
	SortEntry,
	FilterOp,
	SortFilterState,
} from "../utils/types";
import { SheetModel } from "./model";
import { Renderer } from "./renderer";
import { SheetView } from "./sheet-view";

/** Изменения ячеек для колбэка onChange: ключ "A1" → было/стало. */
type CellChanges = Record<string, { old: Cell | null; new: Cell | null }>;

/** Прямоугольник выделения в display-координатах. */
interface Bounds {
	sr: number;
	er: number;
	sc: number;
	ec: number;
}

/** Типы колонок, которые в буфер обмена ОС уходят в человекочитаемом виде. */
const FORMATTED_TYPES = new Set(["select", "boolean", "date", "datetime"]);

export class NativeSheet {
	// ── Подсистемы ────────────────────────────────────────────────────────────
	private model: SheetModel;
	private view: SheetView;
	readonly renderer: Renderer;
	private editor: Editor;
	private overlay: SelectionOverlay;
	private contextMenu: ContextMenu;
	private sortFilterPopup: SortFilterPopup;
	private autoScroller: AutoScroller;
	private undoManager = new UndoManager();

	// ── Состояние ─────────────────────────────────────────────────────────────
	private selection: SelectionRect = { start: null, end: null };
	/** Скопированный диапазон (пунктирная рамка) */
	private copyRect: SelectionRect | null = null;
	/**
	 * Внутренний буфер обмена: хранит СЫРЫЕ значения, а не отображаемые.
	 * Иначе «Да»/подпись select после вставки записались бы в данные.
	 */
	private clipboard: {
		width: number;
		height: number;
		values: ScalarCellValue[][];
		styles: (CellStyle | null)[][];
	} | null = null;

	private options: NativeSheetOptions;
	private destroyed = false;

	/** Отписки, которые нужно выполнить в destroy() */
	private disposers: Array<() => void> = [];
	/** Отмена активной сессии перетаскивания */
	private cancelDrag: (() => void) | null = null;

	/** Тулбар (.nt-toolbar) текущей таблицы — для scoped поиска кнопок */
	private toolbarEl: HTMLElement | null = null;

	/** Строки, запрещённые к редактированию */
	disabledRows: Set<string | number>;

	/** Разрешено ли изменение ширины столбцов перетаскиванием */
	private columnResizable: boolean;

	/** rowId → rowIndex (обратный маппинг из options.rowIds) */
	private rowIdToIndex: Map<string, number> = new Map();

	/** Временные ID для строк без rowId (ручное добавление). */
	private _tempRowIds = new Map<number, string>();

	constructor(
		/** Контейнер .nt-root, созданный в NativeTable.tsx */
		private container: HTMLDivElement,
		options: NativeSheetOptions,
	) {
		this.options = options;
		this.disabledRows = new Set(options.disabledRows ?? []);
		this.columnResizable = options.resizableColumns ?? true;
		this.container.classList.toggle("nt-no-col-resize", !this.columnResizable);

		if (options.rowIds) {
			options.rowIds.forEach((id, idx) => this.rowIdToIndex.set(String(id), idx));
		}

		// ── Данные и представление ────────────────────────────────────────────
		this.model = new SheetModel(options.initialData);
		this.model.onChange = options.onChange;
		this.view = new SheetView(this.model, options.rows);
		if (options.serverSide) this.view.skipSortFilter = true;

		// Вычислить allowAddRows и лимит строк ДО создания Renderer,
		// чтобы ensureRows не сработал раньше времени на не-последней странице
		let effectiveAddRows = options.allowAddRows ?? true;
		let dataRows = options.rows;
		if (options.pagination && options.initialData) {
			const { page, pageSize, total } = options.pagination;
			const isLastPage = (page + 1) * pageSize >= total;
			dataRows = dataRowCount(options.initialData);
			effectiveAddRows = isLastPage ? (options.allowAddRows ?? true) : false;
		}

		// ── Рендерер ──────────────────────────────────────────────────────────
		this.renderer = new Renderer(
			container,
			this.model,
			options.rows,
			options.cols,
			options.columns,
			effectiveAddRows,
			options.readOnly,
			options.striped,
		);
		this.renderer.disabledRows = this.disabledRows;
		this.renderer.theme = options.theme ?? "light";
		this.renderer.headerConfig = options.header;
		this.renderer.cellConfig = options.cell;
		this.renderer.rowIds = options.rowIds;

		if (options.columnWidths) {
			this.renderer.columnWidths = options.columnWidths;
			const flat = flattenColumns(options.columns);
			for (let c = 0; c < flat.flatColumns.length; c++) {
				const name = flat.flatColumns[c]?.name;
				const w = name ? options.columnWidths[name] : undefined;
				if (w !== undefined) this.renderer.setColWidth(c, w);
			}
			this.renderer.updateContainerSizes();
		}
		if (options.cellStyles) this.applyStoredStyles(options.cellStyles);

		if (options.serverSide && options.sortFilter) {
			const sf = options.sortFilter;
			const idxByName = new Map<string, number>();
			(options.columns ?? []).forEach((c, i) => {
				if (c.name) idxByName.set(String(c.name), i);
			});
			const toIdx = (name: string | number) => typeof name === "string" ? (idxByName.get(name) ?? -1) : Number(name);

			this.view.sortStack = sf.sort
				.map((s) => { const c = toIdx(s.col); return c >= 0 ? { col: c, asc: s.dir === "asc" } : null; })
				.filter((s): s is SortEntry => s !== null);
			this.view.filters.clear();
			for (const [name, f] of Object.entries(sf.filters)) {
				const c = toIdx(name);
				if (c >= 0) {
					this.view.filters.set(c, {
						op: f.op as FilterOp,
						values: f.values ? new Set(f.values) : undefined,
						value: f.value,
						value2: f.value2,
					});
				}
			}
			this.view.forceRebuild();
		}

		// Бесконечный скролл: при расширении строк — уведомить SheetView
		this.renderer.onExpand = () => {
			this.view.setTotalRows(this.renderer.totalRows);
			this.extendRowIds();
			this.syncView();
		};
		// Начальные фантомные строки (ensureRows в конструкторе Renderer) —
		// они появились до назначения onExpand, поэтому temp-id выдаём сразу
		this.extendRowIds();
		this.view.setTotalRows(this.renderer.totalRows);
		this.renderer.rowMap = this.view.rowMap;

		// Пагинация: клипим строки до данных
		if (options.pagination && options.initialData) {
			this.renderer.totalRows = dataRows;
			this.renderer.initialRowCount = dataRows;
			this.renderer.padRowHeights(dataRows);
		}

		// ── UI-подсистемы ─────────────────────────────────────────────────────
		this.overlay = new SelectionOverlay(this.renderer.cellsLayer, this.renderer);
		this.autoScroller = new AutoScroller(this.renderer.bodyDiv);

		this.editor = new Editor(
			this.renderer.cellsLayer,
			this.model,
			(row, col) => this.renderer.bodyBox(row, col),
			(row, col, value, direction) => this.commitEdit(row, col, value, direction),
			() => this.cancelEdit(),
			// Низ видимой области в координатах cellsLayer — textarea не должна
			// расти за него (иначе внизу таблицы появляется пустое место)
			() => this.renderer.bodyDiv.scrollTop + this.renderer.bodyDiv.clientHeight,
		);
		this.editor.setView(this.view);

		this.contextMenu = new ContextMenu(options.theme);
		this.sortFilterPopup = new SortFilterPopup({
			getColumn: (col) => this.renderer.getColumn(col),
			getSort: (col) => this.view.sortOf(col),
			getFilter: (col) => this.view.filters.get(col),
			getUniqueValues: (col) => this.view.getUniqueValues(col),
			onApply: (col, state) => this.applySortFilter(col, state),
			onClear: (col) => this.clearSortFilter(col),
		}, options.theme);

		this.renderer.setOnScroll(() => {
			this.overlay.update(this.selection);
			// Рамка копирования — в координатах контейнера: обновить при скролле
			if (this.copyRect) this.overlay.showCopyRange(this.copyRect);
		});

		// ── События контейнера ────────────────────────────────────────────────
		container.tabIndex = 0;
		this.listen(container, "mousedown", (e) => this.onMouseDown(e as MouseEvent));
		this.listen(container, "dblclick", (e) => this.onDoubleClick(e as MouseEvent));
		this.listen(container, "click", (e) => this.onClick(e as MouseEvent));
		this.listen(container, "contextmenu", (e) => this.onContextMenu(e as MouseEvent));
		this.listen(container, "keydown", (e) => this.onKeyDown(e as KeyboardEvent));
		this.listen(container, "paste", (e) => this.onPaste(e as ClipboardEvent));

		// Тулбар ищем внутри своей .nt-table-wrapper, а не по всему документу:
		// иначе две таблицы на странице управляли бы кнопками друг друга
		this.toolbarEl = this.container.closest(".nt-table-wrapper")?.querySelector<HTMLElement>(".nt-toolbar") ?? null;

		this.renderer.render(true);
		if (options.serverSide && options.sortFilter) this.updateSortIndicators();
		this.setSelectionNoScroll({ start: { row: 0, col: 0 }, end: { row: 0, col: 0 } });
		this.updateToolbar();
	}

	// ──────────────────────────────────────────────────────────────────────────
	// Публичный API
	// ──────────────────────────────────────────────────────────────────────────

	/** Заменить данные, сохранив пользовательские стили непустых ячеек. */
	setData(data: Record<string, Cell>): void {
		const hasPagination = !!this.options.pagination;
		const oldStyles = hasPagination ? {} : this.collectStyles();
		this.model = new SheetModel(data);
		this.model.onChange = this.options.onChange;
		for (const [key, style] of Object.entries(oldStyles)) {
			const cell = this.model.getByKey(key);
			if (cell && cell.value !== null && cell.value !== undefined) {
				this.model.setSilentByKey(key, { ...cell, style });
			}
		}
		this.editor.setModel(this.model);
		this.renderer.setModel(this.model);
		this.view.setModel(this.model);
		this.editor.setView(this.view);

		// Синхронизировать количество строк с новыми данными.
		// renderer.totalRows уже включает фантомные строки (ensureRows) — view
		// должен знать общее число, иначе syncView схлопнет rowMap до одной строки
		const drc = dataRowCount(data);
		this.renderer.setDataRows(drc);
		this.view.resetRows(this.renderer.totalRows, drc);
		this.undoManager.clear();

		// Пагинация: управляем auto-expand и клипим строки
		if (hasPagination && this.options.pagination) {
			const { page, pageSize, total } = this.options.pagination;
			const isLastPage = (page + 1) * pageSize >= total;
			this.renderer.allowAddRows = isLastPage ? (this.options.allowAddRows ?? true) : false;
		}

		this.view.forceRebuild();
		this.syncView();
		this.updateToolbar();
	}

	setColumns(columns: ColumnDef[]): void {
		this.options = { ...this.options, columns };
		this.renderer.setColumns(columns);
		// Состав/ширины колонок изменились — рамка выделения должна пересчитаться
		this.refreshOverlay();
	}

	/** Обновить rowIds без пересоздания таблицы (при смене data). */
	updateRowIds(rowIds: (string | number)[]): void {
		this.options = { ...this.options, rowIds };
		this.renderer.rowIds = rowIds;
		this.rowIdToIndex.clear();
		rowIds.forEach((id, idx) => this.rowIdToIndex.set(String(id), idx));
	}

	/** Применить внешние ширины колонок (сохранённый лейаут) после создания таблицы. */
	setColumnWidths(widths: Record<string, number>): void {
		this.renderer.columnWidths = widths;
		const flat = flattenColumns(this.options.columns ?? []);
		for (let c = 0; c < flat.flatColumns.length; c++) {
			const name = flat.flatColumns[c]?.name;
			const w = name ? widths[name] : undefined;
			if (w !== undefined) this.renderer.setColWidth(c, w);
		}
		this.renderer.updateContainerSizes();
		this.renderer.render(true);
		// Ширины изменились — рамка выделения должна пересчитаться
		this.refreshOverlay();
	}

	/** Применить сохранённые стили ячеек (columnName|rowId → стиль) после создания таблицы. */
	setCellStyles(styles: Record<string, CellStyle>): void {
		this.applyStoredStyles(styles);
		// Полный рендер: refreshValues не перерисовывает fixed-слои,
		// а именно там обычно и находятся стилизованные колонки
		this.renderer.render(true);
		this.refreshOverlay();
	}

	/** Пересчитать оверлей выделения по текущему выделению (после изменения ширин/высот). */
	refreshOverlay(): void {
		this.overlay.update(this.selection);
	}

	hasActiveEditor(): boolean {
		return this.editor.isActive();
	}

	/** Полный снапшот сортировки/фильтра с именами колонок (для серверных колбэков). */
	private buildSortFilterSnapshot(): import("../utils/types").SortFilterSnapshot {
		return {
			sort: this.view.sortStack.map((s) => ({
				col: this.renderer.getColumn(s.col)?.name ?? s.col,
				dir: s.asc ? "asc" : "desc",
			})),
			filters: Object.fromEntries(
				Array.from(this.view.filters.entries()).map(([col, filter]) => [
					this.renderer.getColumn(col)?.name ?? col,
					{
						op: filter.op,
						values: filter.values ? Array.from(filter.values) : undefined,
						value: filter.value,
						value2: filter.value2,
					},
				])
			),
		};
	}

	/** Получить (или сгенерировать) rowId для строки. */
	private getOrCreateRowId(row: number): string | number {
		const id = this.options.rowIds?.[row];
		if (id !== undefined && id !== null) return id;
		let tid = this._tempRowIds.get(row);
		if (!tid) { tid = generateTempId(); this._tempRowIds.set(row, tid); }
		return tid;
	}

	/** Догенерировать temp rowIds для новых строк при расширении. */
	private extendRowIds(): void {
		const total = this.renderer.totalRows;
		if (!this.options.rowIds) this.options.rowIds = [];
		for (let r = this.options.rowIds.length; r < total; r++) {
			let tid = this._tempRowIds.get(r);
			if (!tid) { tid = generateTempId(); this._tempRowIds.set(r, tid); }
			this.options.rowIds[r] = tid;
			this.applyRowDefaults(r);
		}
	}

	/** Применить ColumnDef.default для строки (новые строки при insert/expand). */
	private applyRowDefaults(dataRow: number): void {
		for (let c = 0; c < this.renderer.dataColCount; c++) {
			const col = this.renderer.getColumn(c);
			if (col?.default !== undefined && col.default !== null) {
				this.model.setSilent(dataRow, c, { value: col.default });
			}
		}
	}

	/** Обновить конфигурацию пагинации без пересоздания таблицы. */
	updatePagination(pagination: import("../utils/types").PaginationConfig): void {
		this.options = { ...this.options, pagination };
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.cancelDrag?.();
		this.autoScroller.end();
		for (const dispose of this.disposers) dispose();
		this.disposers = [];
		this.editor.destroy();
		this.contextMenu.destroy();
		this.sortFilterPopup.destroy();
		this.renderer.destroy();
	}

	/** Отменить последнее действие. */
	undo(): void {
		this.applyHistory("undo");
	}

	/** Вернуть отменённое действие. */
	redo(): void {
		this.applyHistory("redo");
	}

	/**
	 * Сохранить состояние: данные и лейаут (ширины/высоты/стили) → через
	 * onChange/onSave (персистенция — на стороне адаптера), очистить историю undo.
	 * В readOnly-режиме данные не меняются, но лейаут всё равно сохраняется.
	 */
	save(): void {
		if (Object.keys(this.renderer.validationErrors).length > 0) return;
		const layout = this.collectLayout();
		const cells = this.model.getAll();
		if (!this.renderer.readOnly) {
			this.options.onChange?.(cells, {});
		}
		this.options.onSave?.(cells, layout);
		this.undoManager.clear();
		this.updateToolbar();
	}

	setCellStyle(style: Partial<CellStyle>): void { this.applyStyle(style); }

	// ──────────────────────────────────────────────────────────────────────────
	// Выделение и координаты
	// ──────────────────────────────────────────────────────────────────────────

	/** Последняя доступная колонка (фантомные не в счёт). */
	private maxCol(): number {
		return this.renderer.dataColCount > 0 ? this.renderer.dataColCount - 1 : 0;
	}

	/** Последняя доступная строка после фильтрации. */
	private maxRow(): number {
		return this.renderer.visibleRowCount() - 1;
	}

	/** Нормализованные границы выделения (null — выделения нет). */
	private bounds(): Bounds | null {
		const { start, end } = this.selection;
		if (!start || !end) return null;
		return {
			sr: Math.min(start.row, end.row),
			er: Math.max(start.row, end.row),
			sc: Math.min(start.col, end.col),
			ec: Math.max(start.col, end.col),
		};
	}

	private toDataRow(displayRow: number): number {
		return this.view.dataRow(displayRow);
	}

	/** id записи для data-строки (из rowIds или фолбэк dataRow + 1). */
	private rowIdAt(dataRow: number): string | number {
		return this.renderer.rowIds?.[dataRow] ?? dataRow + 1;
	}

	private setSelectionNoScroll(rect: SelectionRect): void {
		// Таблица без данных и без добавления строк — выделение не ставим
		if (!this.renderer.allowAddRows && this.renderer.initialRowCount === 0) {
			this.selection = { start: null, end: null };
			return;
		}
		this.selection = rect;
		this.overlay.update(rect);
		this.renderer.selectedRect = rect;
		this.renderer.render();
		this.updateToolbar();
	}

	private setSelection(rect: SelectionRect): void {
		// Таблица без данных и без добавления строк — выделение не ставим
		if (!this.renderer.allowAddRows && this.renderer.initialRowCount === 0) return;
		if (rect.end) this.renderer.scrollToCell(rect.end.row, rect.end.col);
		this.setSelectionNoScroll(rect);
	}

	/** Пересобрать layout после смены rowMap и подрезать выделение под новые границы. */
	private syncView(): void {
		this.renderer.rowMap = this.view.rowMap;
		this.renderer.updateLayout();

		const maxR = this.maxRow();
		if (maxR < 0) {
			this.selection = { start: null, end: null };
		} else if (!this.selection.start || this.selection.start.row > maxR) {
			this.selection = { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } };
		} else if (this.selection.end && this.selection.end.row > maxR) {
			this.selection.end = { row: maxR, col: this.selection.end.col };
		}
		this.renderer.selectedRect = this.selection;
		this.overlay.update(this.selection);
	}

	/** Перевести координаты мыши в display-координаты ячейки (row/col) или null, если попадание вне таблицы. */
	private cellAtEvent(e: MouseEvent): { row: number; col: number } | null {
		const bodyRect = this.renderer.bodyDiv.getBoundingClientRect();
		return this.renderer.cellAt(e.clientX - bodyRect.left, e.clientY - bodyRect.top);
	}

	// ──────────────────────────────────────────────────────────────────────────
	// Мышь
	// ──────────────────────────────────────────────────────────────────────────

	/** Обработчик клика по таблице: гасит нативный клик по чекбоксу (он уже переключён в mousedown). */
	private onClick(e: MouseEvent): void {
		// Чекбокс переключается на mousedown; нативный клик подавляем
		if ((e.target as HTMLElement).classList.contains("nt-checkbox")) e.preventDefault();
	}

	/**
	 * Обработчик mousedown: маршрутизирует нажатие по цели — ресайз колонок,
	 * чекбоксы, автозаполнение, кнопка фильтра, шапка (сортировка/выделение колонок),
	 * угол «выбрать всё» — иначе начинает выделение ячеек/диапазона.
	 */
	private onMouseDown(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		if (isInertTarget(target)) return;

		if (this.editor.isActive() && !this.editor.isClickInsideEditor(target)) {
			const blocked =
				target.classList.contains("nt-resize-handle") ||
				!!target.closest(".nt-header-filter-sort-btn");
			if (blocked) {
				this.editor.commit();
				e.preventDefault();
				return;
			}
		}

		if (e.button === 2) {
			this.selectUnderRightClick(e);
			return;
		}

		// Ручки ресайза колонок
		if (target.classList.contains("nt-resize-handle")) {
			if (!this.columnResizable) return;
			const col = Number(target.dataset.col);
			if (!Number.isNaN(col)) this.startColResize(col, e.clientX);
			e.preventDefault();
			return;
		}

		// Чекбокс boolean-колонки
		if (target.classList.contains("nt-checkbox")) {
			this.toggleBooleanAt(target.parentElement);
			e.preventDefault();
			return;
		}

		// Ручка автозаполнения
		if (target === this.overlay.fillHandleElement()) {
			if (!this.renderer.readOnly) this.startFillDrag();
			e.preventDefault();
			return;
		}

		// Кнопка фильтра в заголовке
		const filterBtn = target.closest<HTMLElement>(".nt-header-filter-sort-btn");
		if (filterBtn) {
			const col = Number(filterBtn.dataset.col);
			if (!Number.isNaN(col)) this.sortFilterPopup.open(col, e.clientX, e.clientY);
			e.preventDefault();
			return;
		}

		// Угловая ячейка — выделить всю таблицу
		if (target.classList.contains("nt-corner")) {
			this.setSelectionNoScroll({ start: { row: 0, col: 0 }, end: { row: this.maxRow(), col: this.maxCol() } });
			this.container.focus();
			return;
		}

		const header = target.closest<HTMLElement>(".nt-header-cell");
		if (header) {
			this.onHeaderMouseDown(header, e);
			return;
		}

		if (!target.closest(".nt-cell") && target !== this.renderer.cellsLayer) return;

		const found = this.cellAtEvent(e);
		if (!found) return;

		if (this.editor.isActive() && !this.editor.isClickInsideEditor(e.target as HTMLElement)) this.editor.commit();

		if (e.shiftKey && this.selection.start) {
			this.setSelection({ start: this.selection.start, end: found });
		} else {
			this.setSelection({ start: found, end: found });
			if (e.detail !== 2) this.startSelectionDrag();
		}
		if (!this.editor.isActive()) this.container.focus();
	}

	/** Заголовок строки или колонки: выделить всю строку/колонку. */
	private onHeaderMouseDown(header: HTMLElement, e: MouseEvent): void {
		if (header.classList.contains("nt-header-cell--disabled")) return;

		if (header.dataset.col !== undefined) {
			const col = Number(header.dataset.col);
			if (Number.isNaN(col)) return;
			const endCol = col + (Number(header.dataset.colSpan) || 1) - 1;
			if (e.shiftKey && this.selection.start) {
				this.setSelectionNoScroll({ start: this.selection.start, end: { row: this.maxRow(), col: endCol } });
			} else {
				this.setSelectionNoScroll({ start: { row: 0, col }, end: { row: this.maxRow(), col: endCol } });
				this.startSelectionDrag("col");
			}
			return;
		}

		if (header.dataset.row !== undefined) {
			const row = Number(header.dataset.row);
			if (Number.isNaN(row)) return;
			if (e.shiftKey && this.selection.start) {
				this.setSelectionNoScroll({ start: this.selection.start, end: { row, col: this.maxCol() } });
			} else {
				this.setSelectionNoScroll({ start: { row, col: 0 }, end: { row, col: this.maxCol() } });
				this.startSelectionDrag("row");
			}
		}
	}

	/** Правый клик вне выделения переносит курсор на ячейку под указателем. */
	private selectUnderRightClick(e: MouseEvent): void {
		const found = this.cellAtEvent(e);
		if (!found) return;
		const b = this.bounds();
		const inside = b && found.row >= b.sr && found.row <= b.er && found.col >= b.sc && found.col <= b.ec;
		if (!inside) this.setSelection({ start: found, end: found });
	}

	/** Обработчик двойного клика: открывает редактор ячейки (кроме boolean и запрещённых к редактированию). */
	private onDoubleClick(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		if (!target.closest(".nt-cell") && target !== this.renderer.cellsLayer) return;

		const found = this.cellAtEvent(e);
		if (!found || !this.canEdit(found.row, found.col)) return;

		const colDef = this.renderer.getColumn(found.col);
		if (isBoolean(colDef)) return;
		this.editor.start(found.row, found.col, colDef, "", false);
		this.setEditing(true);
	}

	/** Обработчик правого клика: собирает и показывает контекстное меню (копировать/вставить/строки/очистить). */
	private onContextMenu(e: MouseEvent): void {
		if (this.editor.isActive()) return;
		// Таблица без данных и без добавления строк — контекстное меню не показываем
		if (!this.renderer.allowAddRows && this.renderer.initialRowCount === 0) return;
		e.preventDefault();
		if (isInertTarget(e.target as HTMLElement)) return;

		const b = this.bounds() ?? { sr: 0, er: 0, sc: 0, ec: 0 };
		const items: ContextMenuItem[] = [{ label: "Копировать\tCtrl+C", action: () => this.copy() }];

		// Защита: заблокированные строки и readOnly-колонки в выделении
		let allCellsProtected = true;
		let anyRowDisabled = false;
		for (let r = b.sr; r <= b.er; r++) {
			const dr = this.toDataRow(r);
			const rowDisabled = this.disabledRows.has(this.rowIdAt(dr));
			if (rowDisabled) anyRowDisabled = true;
			for (let c = b.sc; c <= b.ec; c++) {
				if (!rowDisabled && !isReadOnly(this.renderer.getColumn(c))) allCellsProtected = false;
			}
		}

		if (!this.renderer.readOnly) {
			if (!allCellsProtected) items.push({ label: "Вставить\tCtrl+V", action: () => this.paste() });
			if (!this.renderer.allowAddRows && !this.options.pagination) {
				// без пагинации: скрываем вставку/удаление строк при allowAddRows=false
			} else if (!anyRowDisabled) {
				items.push(
					{ type: "sep" },
					{ label: "Вставить строку выше", action: () => this.insertRow(b.sr) },
					{ label: "Вставить строку ниже", action: () => this.insertRow(b.sr + 1) },
					{ label: `Удалить строки (${b.er - b.sr + 1})`, action: () => this.deleteSelectedRows() },
				);
			}
			if (!allCellsProtected) items.push({ type: "sep" }, { label: "Очистить\tDel", action: () => this.deleteSelection() });
		}

		this.contextMenu.open(items, e.clientX, e.clientY);
	}

	/** Обработчик клавиатуры: делегирует нажатия в handleKeyboard (навигация, ввод, копирование, сохранение и т.д.). */
	private onKeyDown(e: KeyboardEvent): void {
		if (this.editor.isActive()) return;
		handleKeyboard(e, {
			selection: this.selection,
			totalRows: this.renderer.totalRows,
			totalCols: this.renderer.totalCols,
			// Курсор не должен уходить на фантомные строки
			maxRow: this.maxRow(),
			maxCol: this.maxCol(),
			pageSize: Math.max(1, Math.floor(this.renderer.bodyDiv.clientHeight / DEFAULT_ROW_HEIGHT)),
			isEditing: false,
			setSelection: (rect) => this.setSelection(rect),
			startEdit: (row, col, initial) => {
				if (!this.canEdit(row, col)) return;
				this.editor.start(row, col, this.renderer.getColumn(col), initial ?? "", false);
				this.setEditing(true);
			},
			commitEdit: () => this.editor.commit(),
			cancelEdit: () => this.handleEscape(),
			onCopy: () => this.copy(),
			onPaste: () => { if (!this.renderer.readOnly) this.paste(); },
			onDelete: () => { if (!this.renderer.readOnly) this.deleteSelection(); },
			onUndo: () => this.undo(),
			onRedo: () => this.redo(),
			onSave: () => this.save(),
			isCellEmpty: (row, col) => this.model.isEmpty(this.toDataRow(row), col),
		});
	}

	/** Обновить тему таблицы и всех попапов (при переключении темы без пересоздания). */
	setTheme(theme?: "light" | "dark"): void {
		const t = theme ?? "light";
		this.renderer.theme = t;
		this.sortFilterPopup.setTheme(t);
		this.contextMenu.setTheme(t);
		this.renderer.render();
	}

	/** Включить/выключить ресайз столбцов (класс скрывает ручки через CSS). */
	setColumnResizable(on: boolean): void {
		this.columnResizable = on;
		this.container.classList.toggle("nt-no-col-resize", !on);
	}

	// ──────────────────────────────────────────────────────────────────────────
	// Редактирование
	// ──────────────────────────────────────────────────────────────────────────

	/** Можно ли редактировать ячейку (таблица, колонка и строка не заблокированы). */
	private canEdit(displayRow: number, col: number): boolean {
		if (this.renderer.readOnly) return false;
		if (isReadOnly(this.renderer.getColumn(col))) return false;
		return !this.disabledRows.has(this.rowIdAt(this.toDataRow(displayRow)));
	}

	/**
	 * Зафиксировать редактирование ячейки: применить значение в модель
	 * (с undo-записью только при реальном изменении), перерисовать ячейки
	 * и сдвинуть выделение по направлению (enter — вниз, tab/shift-tab — по колонкам).
	 */
	private commitEdit(
		row: number,
		col: number,
		value: string,
		direction: "enter" | "tab" | "shift-tab" | "none",
	): void {
		this.clearCopy();
		this.setEditing(false);
		const dr = this.toDataRow(row);
		const oldCell = this.model.get(dr, col);
		const oldStr = oldCell.value === null || oldCell.value === undefined ? "" : String(oldCell.value);

		// Undo-запись только при реальном изменении значения
		if (value !== oldStr) {
			const wasEmpty = this.model.isEmpty(dr, col);
			this.model.set(dr, col, value, this.renderer.getColumn(col)?.type);
			const newCell = this.model.get(dr, col);
			this.undoManager.record(dr, col, wasEmpty ? null : { ...oldCell }, { ...newCell });
			this.undoManager.commit();
			this.updateToolbar();
			this.model.emit("edit", {
				[cellKey(dr, col)]: { old: wasEmpty ? null : { ...oldCell }, new: { ...newCell } },
			});
		}
		this.renderer.refreshValues();

		let nextRow = row;
		let nextCol = col;
		if (direction === "enter") nextRow = Math.min(row + 1, this.maxRow());
		else if (direction === "tab") nextCol = Math.min(col + 1, this.maxCol());
		else if (direction === "shift-tab") nextCol = Math.max(col - 1, 0);

		this.setSelection({ start: { row: nextRow, col: nextCol }, end: { row: nextRow, col: nextCol } });
		this.container.focus();
	}

	/** Отменить редактирование без сохранения: снять режим редактирования, маркер копирования и вернуть фокус таблице. */
	private cancelEdit(): void {
		this.clearCopy();
		this.setEditing(false);
		this.container.focus();
	}

	/** Переключить состояние «редактирование»: скрыть fill-handle и ручки ресайза, заблокировать фильтры. */
	private setEditing(on: boolean): void {
		this.overlay.setEditing(on);
		this.container.classList.toggle("nt-editing", on);
	}

	/** Обработчик Escape: отменить активное редактирование и снять маркер копирования. */
	private handleEscape(): void {
		if (this.editor.isActive()) this.editor.cancel();
		this.clearCopy();
	}

	/** Переключить boolean-ячейку по клику на чекбокс. */
	private toggleBooleanAt(cellEl: HTMLElement | null): void {
		if (!cellEl?.classList.contains("nt-cell")) return;
		const col = Number(cellEl.dataset.col);
		const row = Number(cellEl.dataset.row ?? -1);
		if (Number.isNaN(col) || row < 0 || !this.canEdit(row, col)) return;

		this.setSelection({ start: { row, col }, end: { row, col } });

		const dr = this.toDataRow(row);
		const colDef = this.renderer.getColumn(col);
		const wasEmpty = this.model.isEmpty(dr, col);
		const oldCell = wasEmpty ? null : { ...this.model.get(dr, col) };
		const oldVal = oldCell?.value;

		let next: ScalarCellValue;
		if (colDef?.nullable) {
			// Tri-state: true → false → null → true
			if (oldVal === true || oldVal === "true") next = false;
			else if (oldVal === false || oldVal === "false") next = null;
			else next = true;
		} else {
			next = oldVal === true || oldVal === "true" ? false : true;
		}
		if (next === null) {
			this.model.deleteSilent(dr, col);
		} else {
			this.model.set(dr, col, String(next), "boolean");
		}
		const newCell = this.model.get(dr, col);

		this.undoManager.record(dr, col, oldCell, { ...newCell });
		this.undoManager.commit();
		this.updateToolbar();
		this.model.emit("edit", { [cellKey(dr, col)]: { old: oldCell, new: { ...newCell } } });
		this.renderer.refreshValues();
		this.container.focus();
	}

	// ──────────────────────────────────────────────────────────────────────────
	// Буфер обмена
	// ──────────────────────────────────────────────────────────────────────────

	/**
	 * Скопировать выделенный диапазон: значения + стили — во внутренний буфер
	 * (для вставки в таблицу), человекочитаемый текст — в буфер обмена ОС.
	 */
	private copy(): void {
		const b = this.bounds();
		if (!b) return;

		const values: ScalarCellValue[][] = [];
		const styles: (CellStyle | null)[][] = [];
		const text: string[] = [];

		for (let r = b.sr; r <= b.er; r++) {
			const valueRow: ScalarCellValue[] = [];
			const styleRow: (CellStyle | null)[] = [];
			const textRow: string[] = [];
			for (let c = b.sc; c <= b.ec; c++) {
			const cell = this.model.get(this.toDataRow(r), c);
			const colDef = this.renderer.getColumn(c);
			const formatted = FORMATTED_TYPES.has(colDef?.type ?? "")
				? formatCellDisplay(cell.value ?? null, colDef)
				: (cell.value ?? null);
			valueRow.push(formatted);
			styleRow.push(cell.style ?? null);
			// В буфер ОС уходит человекочитаемый текст
			textRow.push(
				FORMATTED_TYPES.has(colDef?.type ?? "")
					? formatted as string
					: stringifyValue(cell.value),
			);
			}
			values.push(valueRow);
			styles.push(styleRow);
			text.push(textRow.join("\t"));
		}

		this.clipboard = { width: b.ec - b.sc + 1, height: b.er - b.sr + 1, values, styles };
		// Буфер ОС может быть недоступен (нет разрешения, не-secure origin) —
		// внутренняя копия при этом всё равно работает
		navigator.clipboard?.writeText(text.join("\n")).catch(() => undefined);

		this.copyRect = { start: this.selection.start, end: this.selection.end };
		this.overlay.showCopyRange(this.copyRect);
	}

	/** Вставка из внешнего буфера */
	private onPaste(e: ClipboardEvent): void {
		if (this.editor.isActive() || this.renderer.readOnly) return;
		// Если уже есть внутренний буфер (Ctrl+C внутри таблицы) — используем его
		if (this.clipboard) { this.paste(); return; }
		const text = e.clipboardData?.getData("text/plain");
		if (!text) return;
		e.preventDefault();

		const rows = text.split(/\r?\n/).filter((r) => r.trim() !== "");
		if (rows.length === 0) return;

		const parsed = rows.map((row) => row.split("\t"));
		const height = parsed.length;
		const width = Math.max(...parsed.map((r) => r.length));
		const styles: (null)[][] = [];

		const values: ScalarCellValue[][] = [];
		for (let r = 0; r < height; r++) {
			const row: ScalarCellValue[] = [];
			const styleRow: (null)[] = [];
			for (let c = 0; c < width; c++) {
				row.push(parsed[r]?.[c] ?? null);
				styleRow.push(null);
			}
			values.push(row);
			styles.push(styleRow);
		}
		this.clipboard = { width, height, values, styles };
		this.paste();
	}

	/**
	 * Вставить содержимое внутреннего буфера в выделенный диапазон
	 * (значения и стили), пропуская заблокированные строки и readOnly-колонки.
	 */
	private paste(): void {
		this.clearCopy();
		const b = this.bounds();
		if (!this.clipboard || !b) return;

		const { width, height } = this.clipboard;
		// Не выходить за пределы данных: фантомные строки и колонки не редактируются
		const lastRow = Math.min(b.sr + height - 1, this.maxRow());
		const lastCol = Math.min(b.sc + width - 1, this.maxCol());
		const changed: CellChanges = {};

		for (let r = b.sr; r <= lastRow; r++) {
			const dr = this.toDataRow(r);
			if (this.disabledRows.has(this.rowIdAt(dr))) continue;
			for (let c = b.sc; c <= lastCol; c++) {
				if (this.renderer.getColumn(c)?.readOnly) continue;

				const value = this.clipboard.values[r - b.sr]?.[c - b.sc] ?? null;
				const style = this.clipboard.styles[r - b.sr]?.[c - b.sc];
				const next: Cell = { value };
				if (style) next.style = { ...style };

				this.writeCell(dr, c, next, changed);
			}
		}

		this.undoManager.commit();
		this.updateToolbar();
		this.model.emit("paste", changed);
		this.setSelectionNoScroll({ start: { row: b.sr, col: b.sc }, end: { row: lastRow, col: lastCol } });
		this.renderer.refreshValues();
	}

	/** Очистить выделенный диапазон (Del): стереть непустые ячейки, пропуская заблокированные строки и readOnly-колонки. */
	private deleteSelection(): void {
		this.clearCopy();
		const b = this.bounds();
		if (!b) return;

		const changed: CellChanges = {};
		for (let r = b.sr; r <= b.er; r++) {
			const dr = this.toDataRow(r);
			if (this.disabledRows.has(this.rowIdAt(dr))) continue;
			for (let c = b.sc; c <= b.ec; c++) {
				const colDef = this.renderer.getColumn(c);
				if (colDef?.readOnly) continue;
				if (this.model.isEmpty(dr, c)) continue;

				const old = { ...this.model.get(dr, c) };
				const resetVal: Cell = colDef?.nullable
					? { value: null }
					: { value: getTypeDefault(colDef) };
				this.model.setSilent(dr, c, resetVal);
				this.undoManager.record(dr, c, old, { ...resetVal });
				changed[cellKey(dr, c)] = { old, new: { ...resetVal } };
			}
		}

		this.undoManager.commit();
		this.updateToolbar();
		this.model.emit("clear", changed);
		this.renderer.refreshValues();
	}

	/** Снять маркер скопированного диапазона (пунктирная рамка копирования). */
	private clearCopy(): void {
		if (!this.copyRect) return;
		this.copyRect = null;
		this.overlay.hideCopyRange();
	}

	/** Записать ячейку с регистрацией в истории и в списке изменений. */
	private writeCell(dataRow: number, col: number, next: Cell, changed: CellChanges): void {
		const wasEmpty = this.model.isEmpty(dataRow, col);
		const old = wasEmpty ? null : { ...this.model.get(dataRow, col) };
		const value = next.value;
		const cell: Cell = value === null || value === undefined || value === "" ? { value: null } : next;

		this.model.setSilent(dataRow, col, cell);
		this.undoManager.record(dataRow, col, old, { ...cell });
		changed[cellKey(dataRow, col)] = { old, new: { ...cell } };
	}

	// ──────────────────────────────────────────────────────────────────────────
	// Строки: вставка и удаление
	// ──────────────────────────────────────────────────────────────────────────

	/**
	 * Вставить пустую строку в указанную display-позицию: структурное изменение
	 * с записью в историю + дефолтные значения колонок для новой строки.
	 */
	private insertRow(atDisplayRow: number): void {
		const dr = this.toDataRow(Math.max(0, atDisplayRow));
		this.applyRowStructureChange("insert", () => this.model.insertRowAt(dr), 1);
		this.applyRowDefaults(dr);
		this.view.markRowFresh(dr);
	}

	/**
	 * Удалить выделенные строки: переводит display-строки в data-строки
	 * (под сортировкой они несмежные) и выполняет структурное удаление с историей.
	 */
	private deleteSelectedRows(): void {
		const b = this.bounds();
		if (!b) return;

		// Под сортировкой выделенные подряд строки экрана — несмежные строки данных
		const dataRows = new Set<number>();
		for (let r = b.sr; r <= b.er; r++) {
			const dr = this.toDataRow(r);
			if (this.disabledRows.has(this.rowIdAt(dr))) return; // заблокированные строки удалять нельзя
			dataRows.add(dr);
		}

		this.applyRowStructureChange("delete", () => this.model.deleteRowSet(dataRows), -dataRows.size);
	}

	/**
	 * Выполнить структурное изменение (вставка/удаление строк) с записью в историю
	 * и сдвигом границы данных в SheetView.
	 * @param delta сдвиг _dataRowCount: +1 при вставке, −N при удалении N строк.
	 */
	private applyRowStructureChange(action: ChangeAction, mutate: () => void, delta: number): void {
		const before = this.model.getAll();
		mutate();
		this.view.shiftDataRowCount(delta);
		const after = this.model.getAll();

		const changed: CellChanges = {};
		for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
			const oldCell = before[key] ?? null;
			const newCell = after[key] ?? null;
			if (cellsEqual(oldCell, newCell)) continue;
			changed[key] = { old: oldCell, new: newCell };
			const coord = parseCellKey(key);
			if (coord) this.undoManager.record(coord.row, coord.col, oldCell, newCell);
		}

		this.undoManager.commit();
		this.updateToolbar();
		this.view.forceRebuild();
		this.syncView();
		this.model.emit(action, changed);
		this.renderer.refreshValues();
	}

	// ──────────────────────────────────────────────────────────────────────────
	// Автозаполнение (fill handle)
	// ──────────────────────────────────────────────────────────────────────────

	/**
	 * Начать протяжку автозаполнения от fill-handle: по ходу перетаскивания
	 * расширяет выделение до курсора, по окончании заполняет диапазон (applyFill).
	 */
	private startFillDrag(): void {
		const src = this.bounds();
		if (!src) return;

		const onMove = (ev: MouseEvent) => {
			const bodyRect = this.renderer.bodyDiv.getBoundingClientRect();
			const found = this.renderer.cellAt(ev.clientX - bodyRect.left, ev.clientY - bodyRect.top);
			if (!found) return;

			let { sr: top, er: bottom, sc: left, ec: right } = src;
			if (found.row > src.er) bottom = Math.min(found.row, this.maxRow());
			else if (found.row < src.sr) top = Math.max(found.row, 0);
			if (found.col > src.ec) right = Math.min(found.col, this.maxCol());
			else if (found.col < src.sc) left = Math.max(found.col, 0);

			this.setSelectionNoScroll({ start: { row: top, col: left }, end: { row: bottom, col: right } });
			this.autoScroller.update(ev);
		};

		this.beginDrag(onMove, () => {
			const target = this.bounds();
			if (target) this.applyFill(target, src);
		});
	}

	/**
	 * Заполнить целевой диапазон по образцу исходного.
	 * Если в колонке источника все значения числовые и их больше одного —
	 * продолжается арифметическая прогрессия, иначе значения повторяются циклом.
	 */
	private applyFill(target: Bounds, src: Bounds): void {
		const left = Math.min(target.sc, this.maxCol());
		const right = Math.min(target.ec, this.maxCol());
		const top = Math.max(0, target.sr);
		const bottom = this.renderer.allowAddRows ? target.er : Math.min(target.er, this.maxRow());

		const srcHeight = src.er - src.sr + 1;
		const changed: CellChanges = {};

		for (let c = left; c <= right; c++) {
			if (this.renderer.getColumn(c)?.readOnly) continue;

			const srcCells: Cell[] = [];
			for (let r = src.sr; r <= src.er; r++) srcCells.push(this.model.get(this.toDataRow(r), c));
			const srcNumbers = srcCells.map((cell) => toNumber(cell.value));
			// Пустая ячейка — не ноль: иначе протяжка пустого диапазона
			// заполняла бы колонку нулями
			const isSeries = srcHeight >= 2 && srcNumbers.every((n) => n !== null);
			const stepPerRow = isSeries ? ((srcNumbers[srcHeight - 1] as number) - (srcNumbers[0] as number)) / (srcHeight - 1) : 0;

			for (let r = top; r <= bottom; r++) {
				if (r >= src.sr && r <= src.er && c >= src.sc && c <= src.ec) continue;
				const dr = this.toDataRow(r);
				if (this.disabledRows.has(this.rowIdAt(dr))) continue;

				const sample = isSeries && stepPerRow !== 0
					? srcCells[0]
					: srcCells[cycle(r - src.sr, srcHeight)];
				const next: Cell = {
					value: isSeries && stepPerRow !== 0
						? (srcNumbers[0] as number) + stepPerRow * (r - src.sr)
						: sample.value ?? null,
				};
				if (sample.style) next.style = { ...sample.style };

				this.writeCell(dr, c, next, changed);
			}
		}

		this.undoManager.commit();
		this.updateToolbar();
		this.model.emit("fill", changed);
		this.renderer.refreshValues();
	}

	// ──────────────────────────────────────────────────────────────────────────
	// Перетаскивание выделения и ресайз
	// ──────────────────────────────────────────────────────────────────────────

	/** Общий запуск drag-сессии: одна активная сессия, отмена в destroy(). */
	private beginDrag(onMove: (_ev: MouseEvent) => void, onEnd?: () => void): void {
		this.cancelDrag?.();
		this.autoScroller.begin(onMove);
		this.cancelDrag = startDragSession(onMove, () => {
			this.autoScroller.end();
			this.cancelDrag = null;
			if (!this.destroyed) onEnd?.();
		});
	}

	/**
	 * Начать перетаскивание выделения мышью от якоря выделения.
	 * axis="row" — выделять целые строки, axis="col" — целые колонки, иначе диапазон.
	 */
	private startSelectionDrag(axis?: "row" | "col"): void {
		const anchor = this.selection.start;
		if (!anchor) return;

		this.beginDrag((ev) => {
			const bodyRect = this.renderer.bodyDiv.getBoundingClientRect();
			const found = this.renderer.cellAt(ev.clientX - bodyRect.left, ev.clientY - bodyRect.top);
			if (found) {
				const end = { ...found };
				let start = anchor;
				if (axis === "row") {
					end.col = this.maxCol();
					start = { row: anchor.row, col: 0 };
				} else if (axis === "col") {
					end.row = this.maxRow();
					end.col = Math.min(end.col, this.maxCol());
					start = { row: 0, col: anchor.col };
				} else {
					end.col = Math.min(end.col, this.maxCol());
					end.row = Math.min(end.row, this.maxRow());
				}
				this.setSelectionNoScroll({ start, end });
			}
			this.autoScroller.update(ev);
		});
	}

	/**
	 * Начать ресайз колонки перетаскиванием. Соседняя колонка получает дельту
	 * при сужении ТОЛЬКО когда колонки занимают 100% ширины вьюпорта (без
	 * горизонтального скролла); если колонок много и они не помещаются — сужение
	 * просто уменьшает ширину колонки, сосед не трогается.
	 * По окончании — запись ширин в историю (undo/redo).
	 */
	private startColResize(col: number, startX: number): void {
		const oldWidth = this.renderer.getColWidth(col);
		// Сосед для «пары» при сужении: справа; у правой границы последней колонки — слева
		const neighbor = col < this.maxCol() ? col + 1 : col - 1;
		const oldNeighborWidth = this.renderer.getColWidth(neighbor);
		const available = this.renderer.bodyDiv.clientWidth - INDEX_HEADER_WIDTH;
		const shrinkToNeighbor = this.renderer.totalWidth() <= available + 1;
		this.renderer.suspendAutoHeights = true;

		this.beginDrag(
			(ev) => {
				// Считаем от стартовых ширин — нет накопления дрейфа
				const newWidth = Math.max(MIN_COL_WIDTH, oldWidth + ev.clientX - startX);
				if (newWidth < oldWidth) {
					if (shrinkToNeighbor) {
						// Сужение при заполненных 100%: дельта уходит соседу — ширина таблицы не меняется
						this.renderer.resizeColPair(col, newWidth, neighbor);
					} else {
						// Колонки не помещаются во вьюпорт: сосед не трогается, таблица сужается
						this.renderer.setColWidth(col, newWidth);
					}
				} else {
					// Расширение: сосед не трогается, таблица становится шире (скролл)
					this.renderer.setColWidth(col, newWidth);
				}
				this.renderer.updateContainerSizes();
				// Обновить область выделения сразу после смены ширин —
				// и до полного ре-рендера (не зависит от него)
				this.overlay.update(this.selection);
				this.renderer.render(true);
			},
			() => {
				this.renderer.suspendAutoHeights = false;
				this.renderer.recalcAutoRowHeights();
				this.renderer.render(true);
				// После пересчёта авто-высот область выделения должна
				// пересчитаться вместе со строками
				this.overlay.update(this.selection);
				const newWidth = this.renderer.getColWidth(col);
				if (newWidth === oldWidth) return;
				this.undoManager.addRecord({
					row: 0, col, oldValue: null, newValue: null,
					colWidth: { old: oldWidth, new: newWidth },
				});
				// При сужении изменился и сосед — его ширину тоже возвращаем по Ctrl+Z
				const newNeighborWidth = this.renderer.getColWidth(neighbor);
				if (newNeighborWidth !== oldNeighborWidth) {
					this.undoManager.addRecord({
						row: 0, col: neighbor, oldValue: null, newValue: null,
						colWidth: { old: oldNeighborWidth, new: newNeighborWidth },
					});
				}
				this.undoManager.commit();
				this.updateToolbar();
			},
		);
	}

	// ──────────────────────────────────────────────────────────────────────────
	// Сортировка и фильтрация
	// ──────────────────────────────────────────────────────────────────────────

	/**
	 * Применить сортировку/фильтр колонки из попапа: в серверном режиме шлёт
	 * снапшот наверх, в клиентском — обновляет представление с записью в историю.
	 */
	private applySortFilter(col: number, state: SortFilterState): void {
		if (this.options.serverSide) {
			this.view.setSortAndFilter(col, state.sort, state.filter);
			this.options.onApplySortFilter?.(this.buildSortFilterSnapshot());
			this.syncView();
			this.updateSortIndicators();
		} else {
			this.recordViewChange(() => this.view.setSortAndFilter(col, state.sort, state.filter));
		}
	}

	/** Сбросить сортировку/фильтр колонки: серверный режим уведомляет колбэком, клиентский — с историей. */
	private clearSortFilter(col: number): void {
		if (this.options.serverSide) {
			this.view.clearColumn(col);
			this.options.onClearSortFilter?.(this.buildSortFilterSnapshot());
			this.syncView();
			this.updateSortIndicators();
		} else {
			this.recordViewChange(() => this.view.clearColumn(col));
		}
	}

	/**
	 * Выполнить изменение представления с записью в общую историю.
	 * Раньше сортировка/фильтр жили в отдельных стеках, из-за чего Ctrl+Z
	 * отменял их раньше более поздних правок ячеек.
	 */
	private recordViewChange(mutate: () => void): void {
		const before = this.view.snapshot();
		mutate();
		const after = this.view.snapshot();
		if (before !== after) {
			this.undoManager.addRecord({ row: 0, col: 0, oldValue: null, newValue: null, view: { old: before, new: after } });
			this.undoManager.commit();
		}
		this.syncView(); // внутри — updateLayout(), т.е. полная перерисовка
		this.updateSortIndicators();
		this.updateToolbar();
	}

	/** Обновить иконки и номера сортировки/фильтра в кнопках шапки по состоянию view. */
	private updateSortIndicators(): void {
		for (const btn of Array.from(this.container.querySelectorAll<HTMLElement>(".nt-header-filter-sort-btn"))) {
			const col = Number(btn.dataset.col);
			const hasFilter = this.view.filters.has(col);
			const sortIdx = this.view.sortIndex(col);
			const sortEntry = sortIdx >= 0 ? this.view.sortStack[sortIdx] : null;
			let icon: string;
			if (hasFilter && sortEntry) {
				icon = sortEntry.asc ? filterAscSvg() : filterDescSvg();
			} else if (hasFilter) {
				icon = filterActiveSvg();
			} else if (sortEntry) {
				icon = sortEntry.asc ? sortAscSvg() : sortDescSvg();
			} else {
				icon = filterDefaultSvg();
			}
			const numBadge = sortEntry && this.view.sortStack.length > 1
				? `<span class="nt-sort-num">${sortIdx + 1}</span>`
				: "";
			btn.innerHTML = numBadge + icon;
		}
	}

	// ──────────────────────────────────────────────────────────────────────────
	// Стили
	// ──────────────────────────────────────────────────────────────────────────

	/** Применить стиль ко всем выделенным ячейкам (слияние с существующим). */
	private applyStyle(style: Partial<CellStyle>): void {
		if (this.selectionHasNewRow()) return;
		const b = this.bounds();
		if (!b) return;

		const changed: CellChanges = {};
		for (let r = b.sr; r <= b.er; r++) {
			const dr = this.toDataRow(r);
			for (let c = b.sc; c <= b.ec; c++) {
				const old = this.model.get(dr, c);
				const next: Cell = { ...old, style: { ...old.style, ...style } };
				this.model.setSilent(dr, c, next);
				this.undoManager.record(dr, c, { ...old }, { ...next });
				changed[cellKey(dr, c)] = { old: { ...old }, new: { ...next } };
			}
		}

		this.undoManager.commit();
		this.updateToolbar();
		this.model.emit("edit", changed);
		this.renderer.refreshValues();
	}

	/** Новая строка — без реального rowId из базы. */
	private isNewRow(dataRow: number): boolean {
		const rowId = this.options.rowIds?.[dataRow];
		if (rowId === undefined || rowId === null) return true;
		return typeof rowId === "string" && rowId.startsWith("new_");
	}

	/** Есть ли в текущем выделении новые строки. */
	private selectionHasNewRow(): boolean {
		const b = this.bounds();
		if (!b) return false;
		for (let r = b.sr; r <= b.er; r++) {
			if (this.isNewRow(this.toDataRow(r))) return true;
		}
		return false;
	}

	/** Собрать стили всех ячеек с пользовательскими стилями: A1-ключ → CellStyle. */
	private collectStyles(): Record<string, CellStyle> {
		const result: Record<string, CellStyle> = {};
		for (const [key, cell] of Object.entries(this.model.getAll())) {
			if (cell.style && Object.values(cell.style).some((v) => v !== undefined)) {
				result[key] = cell.style;
			}
		}
		return result;
	}

	/** Преобразовать A1-ключ в формат columnName|rowId (ключ хранения лейаута). */
	private a1ToStorageKey(a1Key: string): string | null {
		const parsed = parseCellKey(a1Key);
		if (!parsed) return null;
		const colName = this.renderer.getColumn(parsed.col)?.name ?? String(parsed.col);
		const rowId = this.getOrCreateRowId(parsed.row);
		return `${colName}|${rowId}`;
	}

	/** Преобразовать ключ columnName|rowId обратно в A1-формат. */
	private storageToA1Key(storageKey: string): string | null {
		const pipe = storageKey.lastIndexOf("|");
		if (pipe < 0) return null;
		const name = storageKey.slice(0, pipe);
		const rowStr = storageKey.slice(pipe + 1);
		const colIdx = this.renderer.colIndexByName(name);
		if (colIdx < 0) return null;
		// Реальный rowId
		let rowIdx = this.rowIdToIndex.get(rowStr);
		if (rowIdx !== undefined && rowIdx >= 0) return cellKey(rowIdx, colIdx);
		// Временный ID (0000...) — ищем в _tempRowIds
		for (const [r, tid] of this._tempRowIds) {
			if (tid === rowStr) return cellKey(r, colIdx);
		}
		return null;
	}

	/** Применить сохранённые стили лейаута (columnName|rowId → стиль) к ячейкам модели. */
	private applyStoredStyles(styles: Record<string, CellStyle>): void {
		for (const [key, style] of Object.entries(styles)) {
			const a1Key = this.storageToA1Key(key);
			if (!a1Key) continue;
			const cell = this.model.getByKey(a1Key) ?? { value: null };
			this.model.setSilentByKey(a1Key, { ...cell, style: { ...cell.style, ...style } });
		}
	}

	// ──────────────────────────────────────────────────────────────────────────
	// История
	// ──────────────────────────────────────────────────────────────────────────

	/**
	 * Применить undo/redo-батч: вернуть ширины колонок, состояние представления
	 * (сортировка/фильтр) или значения ячеек; перерисовать и обновить тулбар.
	 */
	private applyHistory(direction: "undo" | "redo"): void {
		const batch = direction === "undo" ? this.undoManager.undo() : this.undoManager.redo();
		if (!batch) return;

		let layoutChanged = false;
		let viewChanged = false;
		const changed: CellChanges = {};

		for (const rec of batch) {
			if (rec.colWidth) {
				this.renderer.setColWidth(rec.col, rec.colWidth.old);
				layoutChanged = true;
			} else if (rec.view) {
				this.view.restore(rec.view.old);
				viewChanged = true;
			} else {
				const key = cellKey(rec.row, rec.col);
				const current = this.model.get(rec.row, rec.col);
				const wasEmpty = this.model.isEmpty(rec.row, rec.col);
				changed[key] = { old: wasEmpty ? null : { ...current }, new: rec.oldValue };
				if (rec.oldValue === null) this.model.deleteSilent(rec.row, rec.col);
				else this.model.setSilent(rec.row, rec.col, rec.oldValue);
			}
		}

		if (viewChanged) {
			this.syncView();
			this.updateSortIndicators();
		}
		this.renderer.refreshValues();
		if (layoutChanged || viewChanged) {
			this.renderer.updateContainerSizes();
			this.renderer.render(true);
			this.overlay.update(this.selection);
		}
		this.updateToolbar();
		this.model.emit(direction, changed);
	}

	// ──────────────────────────────────────────────────────────────────────────
	// Тулбар и сохранение
	// ──────────────────────────────────────────────────────────────────────────

	/**
	 * Обновить состояние кнопок тулбара: undo/redo по доступности истории,
	 * индикатор несохранённых изменений, блокировка заливки/цвета для новых строк.
	 */
	private updateToolbar(): void {
		const root = this.toolbarEl;
		if (!root) return;
		const undoBtn = root.querySelector<HTMLButtonElement>(".nt-tb-btn[data-action=undo]");
		const redoBtn = root.querySelector<HTMLButtonElement>(".nt-tb-btn[data-action=redo]");
		const dot = root.querySelector<HTMLElement>(".nt-tb-dot");
		if (undoBtn) undoBtn.disabled = !this.undoManager.canUndo;
		if (redoBtn) redoBtn.disabled = !this.undoManager.canRedo;
		if (dot) dot.style.display = this.undoManager.hasDataChanges ? "block" : "none";

		// Блокируем заливку/цвет текста для новых строк
		const hasNew = this.selectionHasNewRow();
		for (const el of Array.from(root.querySelectorAll<HTMLLabelElement>(".nt-tb-color-btn"))) {
			el.toggleAttribute("data-disabled", hasNew);
		}
	}

	/** Собрать данные лейаута (ширины, стили) для сохранения. */
	private collectLayout(): LayoutData {
		const widths: Record<string, number> = {};
		const limit = this.renderer.dataColCount;
		for (let c = 0; c < limit; c++) {
			// Сохраняем только вручную изменённые ширины: исходные (из width
			// колонки) пересчитываются рендерером под вьюпорт
			if (!this.renderer.isManualColWidth(c)) continue;
			const name = this.renderer.getColumn(c)?.name ?? String(c);
			widths[name] = this.renderer.getColWidth(c);
		}

		const a1Styles = this.collectStyles();
		const styles: Record<string, import("../utils/types").CellStyle> = {};
		for (const [a1Key, cellStyle] of Object.entries(a1Styles)) {
			const storageKey = this.a1ToStorageKey(a1Key);
			if (storageKey) styles[storageKey] = cellStyle;
		}

		return { widths, styles };
	}

	// ──────────────────────────────────────────────────────────────────────────
	// Служебное
	// ──────────────────────────────────────────────────────────────────────────

	/** Подписаться на событие с автоматической отпиской в destroy(). */
	private listen<K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		handler: (_ev: HTMLElementEventMap[K]) => void,
	): void {
		el.addEventListener(type, handler as EventListener);
		this.disposers.push(() => el.removeEventListener(type, handler as EventListener));
	}
}

// ── Вспомогательные функции ──────────────────────────────────────────────────

/** Заблокированные заголовки не реагируют на мышь. */
function isInertTarget(target: HTMLElement): boolean {
	return (
		!!target.closest(".nt-header-cell--phantom") ||
		!!target.closest(".nt-header-cell--disabled")
	);
}

/** Значение ячейки как строка (пусто → ""). */
function stringifyValue(value: ScalarCellValue | undefined): string {
	return value === null || value === undefined ? "" : String(value);
}

/** Число из значения ячейки; null — пусто или не число. */
function toNumber(value: ScalarCellValue | undefined): number | null {
	if (value === null || value === undefined || value === "") return null;
	const n = typeof value === "number" ? value : Number(value);
	return Number.isNaN(n) ? null : n;
}

/** Индекс внутри цикла длиной mod (для повторяющегося автозаполнения). */
function cycle(offset: number, mod: number): number {
	if (mod <= 0) return 0;
	return ((offset % mod) + mod) % mod;
}

/** Поверхностное сравнение ячеек (значение, отображение, стиль). */
function cellsEqual(a: Cell | null, b: Cell | null): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return (
		a.value === b.value &&
		a.display === b.display &&
		JSON.stringify(a.style ?? null) === JSON.stringify(b.style ?? null)
	);
}

/** Максимальный индекс строки в данных (для пагинации). */
function dataRowCount(data: Record<string, Cell>): number {
	let maxR = -1;
	for (const key of Object.keys(data)) {
		const parsed = parseCellKey(key);
		if (parsed && parsed.row > maxR) maxR = parsed.row;
	}
	return maxR + 1;
}
