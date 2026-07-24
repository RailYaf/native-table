// ── NativeSheet — основной класс нативной таблицы ───────────────────────────
//
// Координирует работу всех подсистем:
//   - Renderer  — виртуальный рендерер (DOM + скролл)
//   - SheetModel — данные (Map<string, Cell>)
//   - SheetView  — сортировка/фильтрация (displayRow → dataRow)
//   - Editor     — редактирование ячеек (input/select)
//   - SelectionOverlay — рамка выделения + fill-handle
//   - UndoManager — история изменений
//
// Особенности:
//   - Все DOM-элементы — нативные (не React), инлайн стили через data-атрибуты
//   - Виртуализация: рендерятся только видимые ячейки + буфер
//   - IndexedDB: загрузка до рендера, сохранение только по кнопке Сохранить
//   - Undo/Redo: все операции (ячейки, стили, resize) с историей

import { UndoManager } from "../services/undo-manager";
import { saveState } from "../services/storage";
import { cellKey } from "../utils/cell-addr";
import { DEFAULT_ROW_HEIGHT } from "../utils/consts";
import { formatCellDisplay, getCellAlign, isBoolean, isReadOnly } from "../utils/column-utils";
import { Editor } from "../ui/editor";
import { handleKeyboard } from "../ui/keyboard";
import { SheetModel } from "./model";
import { Renderer } from "./renderer";
import { SelectionOverlay } from "../ui/selection";
import type {
	Cell,
	ChangeAction,
	ColumnDef,
	NativeSheetOptions,
	SelectionRect,
} from "../utils/types";
import { SheetView } from "./sheet-view";

export class NativeSheet {
	// ── Подсистемы ────────────────────────────────────────────────────────────
	private model: SheetModel;       // данные ячеек
	private view: SheetView;         // сортировка/фильтрация
	readonly renderer: Renderer;      // виртуальный рендерер
	private editor: Editor;          // редактор ячеек (input/select)
	private overlay: SelectionOverlay; // оверлей выделения

	// ── Состояние выделения ──────────────────────────────────────────────────
	private selection: SelectionRect = { start: null, end: null };
	/** Копируемое выделение (для отображения пунктирной рамки) */
	private copyRect: SelectionRect | null = null;
	/** Буфер обмена: координаты, значения и стили */
	private clipboard: {
		rect: { sr: number; er: number; sc: number; ec: number };
		values: (string | number | boolean | null)[][];
		styles: (import("../utils/types").CellStyle | null)[][];
	} | null = null;

	private options: NativeSheetOptions;
	private destroyed = false;

	// ── Обработчики событий (для последующего removeEventListener) ───────────
	private onMouseDownHandler: (e: MouseEvent) => void;
	private onDoubleClickHandler: (e: MouseEvent) => void;
	private onKeyDownHandler: (e: KeyboardEvent) => void;
	private onCheckboxClickHandler: (e: MouseEvent) => void;
	private onContextMenuHandler: (e: MouseEvent) => void;
	private contextMenu: HTMLDivElement;
	private sortFilterPopup: HTMLDivElement;

	// ── Resize колонок ───────────────────────────────────────────────────────
	private resizingCol = -1;
	private resizeStartX = 0;
	private resizeStartWidth = 0;

	/** Обработчик закрытия дочернего попапа (сортировка/фильтр/выравнивание) */
	private _childPopupCloseHandler: ((ev: MouseEvent) => void) | null = null;

	/** Менеджер undo/redo */
	private _undoMgr = new UndoManager();

	private _viewUndo: string[] = [];
	private _viewRedo: string[] = [];

	/** Строки, запрещённые к редактированию */
	disabledRows: Set<number>;

	constructor(
		/** Контейнер .nt-root, созданный в NativeTable.tsx */
		private container: HTMLDivElement,
		options: NativeSheetOptions,
	) {
		this.options = options;
		this.disabledRows = new Set(options.disabledRows ?? []);

		// ── Инициализация подсистем ──────────────────────────────────────────
		this.model = new SheetModel(options.initialData);
		this.model.onChange = options.onChange;
		this.view = new SheetView(this.model, options.rows);

		this.renderer = new Renderer(
			container,
			this.model,
			options.rows,
			options.cols,
			options.defaultColWidth,
			options.defaultRowHeight,
			options.columns ?? [],
			options.allowAddRows,
			options.readonly,
		);
		this.renderer.disabledRows = this.disabledRows;
		this.renderer.headerWrap = options.headerWrap ?? false;

		// Применить начальные ширины/высоты/стили из IndexedDB
		if (options.initialWidths) {
			this.renderer.initialWidths = options.initialWidths;
			for (const [c, w] of Object.entries(options.initialWidths)) this.renderer.setColWidth(Number(c), w);
			this.renderer.rebuildColLeftCache();
			this.renderer.updateContainerSizes();
		}
		if (options.initialHeights) this.renderer.setRowHeights(options.initialHeights);
		if (options.initialStyles) this.applyStyles(options.initialStyles);

		// Бесконечный скролл: при расширении строк — уведомить SheetView
		this.renderer.onExpand = () => {
			this.view.setTotalRows(this.renderer.totalRows);
			this.syncView();
		};
		// Синхронизировать _totalRows с расширенным количеством (без перестроения rowMap)
		this.view.setTotalRows(this.renderer.totalRows);

		this.overlay = new SelectionOverlay(
			this.renderer.cellsLayer,
			this.renderer,
		);

		this.editor = new Editor(
			this.renderer.cellsLayer,
			this.model,
			(row, col) => this.renderer.bodyBox(row, col),
			(row, col, value, direction) =>
				this.commitEdit(row, col, value, direction),
			() => this.cancelEdit(),
		);
		this.editor.setView(this.view);

		// Renderer сам обрабатывает скролл через setOnScroll, свой не нужен
		this.renderer.setOnScroll(() => {
			this.overlay.update(this.selection);
		});

		// Сохранить обработчики для удаления в destroy()
		this.onMouseDownHandler = (e) => this.onMouseDown(e);
		this.onDoubleClickHandler = (e) => this.onDoubleClick(e);
		this.onKeyDownHandler = (e) => this.onKeyDown(e);
		this.onCheckboxClickHandler = (e) => this.onCheckboxClick(e);
			this.onContextMenuHandler = (e) => this.onContextMenu(e);

			container.addEventListener("mousedown", this.onMouseDownHandler);
			container.addEventListener("dblclick", this.onDoubleClickHandler);
			container.addEventListener("click", this.onCheckboxClickHandler);
			container.addEventListener("contextmenu", this.onContextMenuHandler);
			container.tabIndex = 0;
			container.addEventListener("keydown", this.onKeyDownHandler);

			// Контекстное меню
			this.contextMenu = document.createElement("div");
			this.contextMenu.className = "nt-context-menu";
			this.contextMenu.style.display = "none";
			this._syncPopupTheme(this.contextMenu);
			document.body.append(this.contextMenu);

			this.sortFilterPopup = document.createElement("div");
			this.sortFilterPopup.className = "nt-sort-filter-popup";
			this.sortFilterPopup.style.display = "none";
			this._syncPopupTheme(this.sortFilterPopup);
			document.body.append(this.sortFilterPopup);

		this.renderer.render(true);
		this.setSelectionNoScroll({
			start: { row: 0, col: 0 },
			end: { row: 0, col: 0 },
		});
		this.container.focus();
	}

	private _syncPopupTheme(el: HTMLElement): void {
		if (!this.container.classList.contains("nt-dark")) return;
		const style = getComputedStyle(this.container);
		el.style.setProperty("--nt-bg", style.getPropertyValue("--nt-bg"));
		el.style.setProperty("--nt-border", style.getPropertyValue("--nt-border"));
		el.style.setProperty("--nt-text", style.getPropertyValue("--nt-text"));
		el.style.setProperty("--nt-text-heading", style.getPropertyValue("--nt-text-heading"));
		el.style.setProperty("--nt-text-muted", style.getPropertyValue("--nt-text-muted"));
		el.style.setProperty("--nt-bg-phantom", style.getPropertyValue("--nt-bg-phantom"));
		el.style.setProperty("--nt-bg-header", style.getPropertyValue("--nt-bg-header"));
		el.style.setProperty("--nt-bg-button-hover", style.getPropertyValue("--nt-bg-button-hover"));
		el.style.setProperty("--nt-bg-active", style.getPropertyValue("--nt-bg-active"));
		el.style.setProperty("--nt-accent", style.getPropertyValue("--nt-accent"));
		el.style.setProperty("--nt-accent-dark", style.getPropertyValue("--nt-accent-dark"));
		el.style.setProperty("--nt-shadow", style.getPropertyValue("--nt-shadow"));
		el.style.setProperty("--nt-shadow-sm", style.getPropertyValue("--nt-shadow-sm"));
		el.style.setProperty("--nt-text-inverse", style.getPropertyValue("--nt-text-inverse"));
	}

	getData(): Record<string, Cell> {
		return this.model.getAll();
	}

	// setData: обновить и NativeSheet.model, и renderer.model
	setData(data: Record<string, Cell>): void {
		const oldStyles = this.collectStyles();
		this.model = new SheetModel(data);
		this.model.onChange = this.options.onChange;
		for (const [key, style] of Object.entries(oldStyles)) {
			const cell = this.model.getByKey(key);
			if (cell && cell.value !== null && cell.value !== undefined) {
				cell.style = style;
				this.model.setSilentByKey(key, cell);
			}
		}
		this.editor.setModel(this.model);
		this.renderer.setModel(this.model);
		this.view.setModel(this.model);
		this.editor.setView(this.view);
		this.renderer.rowMap = this.view.rowMap;
		this.renderer.updateLayout();
	}

	private syncView(): void {
		this.renderer.rowMap = this.view.rowMap;
		this.renderer.updateLayout();
		this.renderer.render(true);
		const maxR = this.renderer.visibleRowCount() - 1;
		if (maxR >= 0) {
			if (!this.selection.start || this.selection.start.row > maxR) {
				this.selection = { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } };
			} else if (this.selection.end && this.selection.end.row > maxR) {
				this.selection.end = { row: maxR, col: this.selection.end.col };
			}
		} else {
			this.selection = { start: null, end: null };
		}
		this.renderer.selectedRect = this.selection;
		this.overlay?.update(this.selection);
	}

	private toDataRow(displayRow: number): number {
		return this.view.dataRow(displayRow);
	}

	setColumns(columns: ColumnDef[]): void {
		this.options = { ...this.options, columns };
		this.renderer.setColumns(columns);
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		// Очистить все обработчики перед удалением DOM
		this.container.removeEventListener("mousedown", this.onMouseDownHandler);
		this.container.removeEventListener("dblclick", this.onDoubleClickHandler);
		this.container.removeEventListener("click", this.onCheckboxClickHandler);
		this.container.removeEventListener("contextmenu", this.onContextMenuHandler);
		this.container.removeEventListener("keydown", this.onKeyDownHandler);
		this.contextMenu.remove();
		this.sortFilterPopup.remove();
		this.renderer.destroy();
	}

	private clearCopy(): void {
		if (this.copyRect) {
			this.copyRect = null;
			this.overlay.hideCopyRange();
		}
	}

	private setSelectionNoScroll(rect: SelectionRect): void {
		this.selection = rect;
		this.overlay.update(rect);
		this.renderer.selectedRect = rect;
		this.renderer.render();
		this.updateToolbarStyleState();
	}

	private setSelection(rect: SelectionRect): void {
		this.selection = rect;
		this.overlay.update(rect);
		this.renderer.selectedRect = rect;
		if (rect.end) this.renderer.scrollToCell(rect.end.row, rect.end.col);
		this.renderer.render();
		this.updateToolbarStyleState();
	}

	private cellAtEvent(e: MouseEvent): { row: number; col: number } | null {
		const bodyRect = this.renderer.bodyDiv.getBoundingClientRect();
		const x = e.clientX - bodyRect.left;
		const y = e.clientY - bodyRect.top;
		return this.renderer.cellAt(x, y);
	}

	private onCheckboxClick(e: MouseEvent): void {
		if ((e.target as HTMLElement).classList.contains("nt-checkbox")) {
			e.preventDefault();
		}
	}

	private onContextMenu(e: MouseEvent): void {
		e.preventDefault();
		// Не показывать меню на фантомных строках/столбцах/заголовках
		const cell = (e.target as HTMLElement).closest(".nt-cell");
		if (cell?.classList.contains("nt-cell--phantom")) return;
		const header = (e.target as HTMLElement).closest(".nt-header-cell");
		if (header?.classList.contains("nt-header-cell--phantom") || header?.classList.contains("nt-header-cell--disabled")) return;
		this.hideContextMenu();

		const start = this.selection.start ?? { row: 0, col: 0 };
		const end = this.selection.end ?? { row: 0, col: 0 };
		const row = Math.min(start.row, end.row);
		const fromRow = Math.min(start.row, end.row);
		const toRow = Math.max(start.row, end.row);

		const items: Array<{ type?: "sep"; label?: string; action?: () => void }> = [
			{ label: "Копировать\tCtrl+C", action: () => this.copy() },
		];
		if (!this.renderer.readonlyTable) {
			items.push({ label: "Вставить\tCtrl+V", action: () => this.paste() });
			if (this.renderer.allowAddRows) {
				items.push(
					{ type: "sep" },
					{ label: "Вставить строку выше", action: () => this.insertRowAbove(row) },
					{ label: "Вставить строку ниже", action: () => this.insertRowBelow(row) },
					{ label: `Удалить строки (${toRow - fromRow + 1})`, action: () => this.deleteSelectedRows() },
				);
			}
			items.push(
				{ type: "sep" },
				{ label: "Очистить\tDel", action: () => this.deleteSelection() },
			);
		}

		this.contextMenu.innerHTML = "";
		for (const item of items) {
			if (item.type === "sep") {
				const sep = document.createElement("div");
				sep.className = "nt-context-menu-sep";
				this.contextMenu.append(sep);
			} else {
				const el = document.createElement("div");
				el.className = "nt-context-menu-item";
				el.textContent = item.label!;
				el.addEventListener("mousedown", (ev) => { ev.preventDefault(); ev.stopPropagation(); });
				el.addEventListener("click", () => { item.action!(); this.hideContextMenu(); });
				this.contextMenu.append(el);
			}
		}

		this.contextMenu.style.left = `${e.clientX}px`;
		this.contextMenu.style.top = `${e.clientY}px`;
		this.contextMenu.style.display = "block";

		const close = () => { this.hideContextMenu(); document.removeEventListener("click", close); document.removeEventListener("keydown", onEsc); };
		const onEsc = (ev: KeyboardEvent) => { if (ev.key === "Escape") close(); };
		setTimeout(() => {
			document.addEventListener("click", close);
			document.addEventListener("keydown", onEsc);
		}, 0);
	}

	private hideContextMenu(): void {
		this.contextMenu.style.display = "none";
	}

	private showSortFilterPopup(col: number, clientX: number, clientY: number): void {
		this.hideSortFilterPopup();

		const colDef = this.renderer.getColumn(col);
		const title = colDef?.label ?? String.fromCharCode(65 + col);
		const existing = this.view.sortStack.find((s) => s.col === col);
		const sortDir: string = !existing ? "none" : existing.asc ? "asc" : "desc";

		const currentFilter = this.view.filters.get(col);
		const uniqueValues = this.view.getUniqueValues(col);

		const curFilterType = currentFilter?.op ?? "values";
		const curFilterVal = currentFilter?.value ?? "";
		const curFilterVal2 = currentFilter?.value2 ?? "";

		const colType = colDef?.type ?? "text";
		const isNum = colType === "number";
		const isBool = colType === "boolean";
		const isDate = colType === "date";
		const filterOps = [
			{ value: "values", label: "По значениям" },
			...isBool ? [] : [
				{ value: "eq", label: "Равно" },
				{ value: "neq", label: "Не равно" },
			],
			...isNum || isDate ? [
				{ value: "gt", label: "Больше" },
				{ value: "gte", label: "Больше или равно" },
				{ value: "lt", label: "Меньше" },
				{ value: "lte", label: "Меньше или равно" },
				{ value: "between", label: "Между" },
			] : [],
		];

		this.sortFilterPopup.innerHTML = `
			<div class="nt-sf-title">${title}</div>
			<div class="nt-sf-section">Сортировка</div>
			<label class="nt-sf-radio"><input type="radio" name="sf-sort-${col}" value="asc" ${sortDir === "asc" ? "checked" : ""}> По возрастанию</label>
			<label class="nt-sf-radio"><input type="radio" name="sf-sort-${col}" value="desc" ${sortDir === "desc" ? "checked" : ""}> По убыванию</label>
			<label class="nt-sf-radio"><input type="radio" name="sf-sort-${col}" value="none" ${sortDir === "none" ? "checked" : ""}> Нет</label>
			<div class="nt-sf-sep"></div>
			<div class="nt-sf-section">Фильтр</div>
			<div class="nt-sf-filter-menu-item">Тип фильтра<span class="nt-sf-op-arrow"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span></div>
			<div class="nt-sf-values-block" style="display:${curFilterType === "values" ? "block" : "none"}">
				<input class="nt-sf-search" placeholder="Поиск..." value="">
				<label class="nt-sf-radio"><input type="checkbox" class="nt-sf-select-all" ${!currentFilter || (currentFilter.op === "values" && currentFilter.values) ? "checked" : ""}> (Выбрать всё)</label>
				${uniqueValues.map((v) => `<label class="nt-sf-radio nt-sf-value-row"><input type="checkbox" value="${escapeHtml(v)}" ${!currentFilter || (currentFilter.op === "values" && currentFilter.values?.has(v)) ? "checked" : ""}> ${escapeHtml(formatCellDisplay(v, colDef))}</label>`).join("")}
				<div class="nt-sf-warn" style="display:none">Выберите хотя бы одно значение</div>
			</div>
			<div class="nt-sf-custom-block" style="display:${curFilterType !== "values" ? "block" : "none"};padding:4px 16px">
				<input class="nt-sf-input" id="sf-val-${col}" value="${escapeHtml(curFilterVal)}" placeholder="Значение" type="${isDate ? "date" : "text"}">
				<input class="nt-sf-input" id="sf-val2-${col}" value="${escapeHtml(curFilterVal2)}" placeholder="До" style="display:${curFilterType === "between" ? "block" : "none"}" type="${isDate ? "date" : "text"}">
			</div>
			<div class="nt-sf-buttons">
				<button class="nt-sf-btn nt-sf-btn--apply">Применить</button>
				<button class="nt-sf-btn nt-sf-btn--clear">Сбросить</button>
			</div>
		`;

		// "Тип фильтра ▸" — hover/click → дочерний попап с типами
		const filterMenuItem = this.sortFilterPopup.querySelector(".nt-sf-filter-menu-item") as HTMLElement;
		if (filterMenuItem) {
			const showTypesFlyout = () => {
				if (this._childPopupCloseHandler) {
					document.removeEventListener("mousedown", this._childPopupCloseHandler, true);
				}
				this.hideFilterChildPopup();
				const popup = document.createElement("div");
				popup.className = "nt-sf-child-popup";
				this._syncPopupTheme(popup);
				const selectedOp = (filterMenuItem as HTMLElement).dataset.op ?? "values";
				for (const op of filterOps) {
					const item = document.createElement("div");
					item.className = `nt-select-dropdown-item${op.value === selectedOp ? " nt-select-dropdown-item--selected" : ""}`;
					item.textContent = op.label;
					item.addEventListener("mousedown", (ev) => { ev.preventDefault(); ev.stopPropagation(); });
					item.addEventListener("click", (ev) => {
						ev.stopPropagation();
						const valBlock = this.sortFilterPopup.querySelector(".nt-sf-values-block") as HTMLElement;
						const customBlock = this.sortFilterPopup.querySelector(".nt-sf-custom-block") as HTMLElement;
						if (op.value === "values") {
							if (valBlock) valBlock.style.display = "block";
							if (customBlock) customBlock.style.display = "none";
						} else {
							if (valBlock) valBlock.style.display = "none";
							if (customBlock) customBlock.style.display = "block";
							const val2 = this.sortFilterPopup.querySelector(`#sf-val2-${col}`) as HTMLInputElement;
							if (val2) val2.style.display = op.value === "between" ? "block" : "none";
						}
						(filterMenuItem as HTMLElement).dataset.op = op.value;
						this.hideFilterChildPopup();
						updateApplyBtn();
					});
					popup.append(item);
				}
				document.body.append(popup);
				const parentRect = this.sortFilterPopup.getBoundingClientRect();
				const itemRect = filterMenuItem.getBoundingClientRect();
				const popupW = popup.offsetWidth || 180;
				const rightSpace = window.innerWidth - parentRect.right;
				if (rightSpace >= popupW + 4) {
					popup.style.left = `${parentRect.right + 4}px`;
				} else {
					popup.style.left = `${parentRect.left - popupW - 4}px`;
				}
				popup.style.top = `${itemRect.top}px`;

				const close = (ev: MouseEvent) => {
					if (popup.contains(ev.target as Node) || filterMenuItem.contains(ev.target as Node)) return;
					this.hideFilterChildPopup();
					document.removeEventListener("mousedown", close, true);
				};
				setTimeout(() => {
					document.addEventListener("mousedown", close, true);
					this._childPopupCloseHandler = close;
				}, 0);
			};

			filterMenuItem.addEventListener("mouseenter", showTypesFlyout);
			filterMenuItem.addEventListener("click", showTypesFlyout);

			// Закрыть дочерний попап при уходе мыши
			let childHideTimer: number | null = null;
			const scheduleChildHide = () => {
				if (childHideTimer) clearTimeout(childHideTimer);
				childHideTimer = window.setTimeout(() => {
					const p = document.querySelector(".nt-sf-child-popup");
					if (!p?.matches(":hover") && !filterMenuItem.matches(":hover")) {
						this.hideFilterChildPopup();
					}
				}, 250);
			};
			filterMenuItem.addEventListener("mouseleave", scheduleChildHide);

			// Очищать таймер при входе мыши в любой дочерний попап (делегирование)
			document.addEventListener("mouseover", (ev) => {
				const target = ev.target as HTMLElement;
				if (target.closest(".nt-sf-child-popup") || target.closest(".nt-sf-filter-menu-item")) {
					if (childHideTimer) { clearTimeout(childHideTimer); childHideTimer = null; }
				}
			});
		}

		const getFilterType = (): string => {
			return (filterMenuItem?.dataset.op ?? "values") as string;
		};

		const updateApplyBtn = () => {
			const ft = getFilterType();
			const apply = this.sortFilterPopup.querySelector(".nt-sf-btn--apply") as HTMLButtonElement;
			let ok = false;
			if (ft === "values") {
				const cbs = this.sortFilterPopup.querySelectorAll<HTMLInputElement>("input[type='checkbox']:not(.nt-sf-select-all)");
				ok = Array.from(cbs).some((cb) => cb.checked);
			} else {
				const val = (this.sortFilterPopup.querySelector(`#sf-val-${col}`) as HTMLInputElement)?.value ?? "";
				ok = val.trim().length > 0;
			}
			const warn = this.sortFilterPopup.querySelector(".nt-sf-warn") as HTMLElement;
			if (warn) warn.style.display = ok ? "none" : "block";
			if (apply) {
				apply.disabled = !ok;
				apply.style.opacity = ok ? "1" : "0.5";
			}
		};

		// Инпут меняется → обновить кнопку Применить
		const inputEl = this.sortFilterPopup.querySelector(`#sf-val-${col}`) as HTMLInputElement;
		if (inputEl) inputEl.addEventListener("input", updateApplyBtn);
		const inputEl2 = this.sortFilterPopup.querySelector(`#sf-val2-${col}`) as HTMLInputElement;
		if (inputEl2) inputEl2.addEventListener("input", updateApplyBtn);

		const selectAll = this.sortFilterPopup.querySelector(".nt-sf-select-all") as HTMLInputElement;
		if (selectAll) {
			selectAll.addEventListener("change", () => {
				const checkboxes = this.sortFilterPopup.querySelectorAll<HTMLInputElement>("input[type='checkbox']:not(.nt-sf-select-all)");
				for (const cb of Array.from(checkboxes)) {
					const row = cb.closest(".nt-sf-value-row") as HTMLElement;
					if (!row || row.style.display !== "none") cb.checked = selectAll.checked;
				}
				updateApplyBtn();
			});
		}

		const allCheckboxes = this.sortFilterPopup.querySelectorAll<HTMLInputElement>("input[type='checkbox']:not(.nt-sf-select-all)");
		for (const cb of Array.from(allCheckboxes)) {
			cb.addEventListener("change", updateApplyBtn);
		}

		const searchInput = this.sortFilterPopup.querySelector(".nt-sf-search") as HTMLInputElement;
		if (searchInput) {
			searchInput.addEventListener("input", () => {
				const query = searchInput.value.toLowerCase();
				const rows = this.sortFilterPopup.querySelectorAll<HTMLElement>(".nt-sf-value-row");
				for (const row of Array.from(rows)) {
					const text = (row.textContent ?? "").toLowerCase();
					row.style.display = query === "" || text.includes(query) ? "" : "none";
				}
			});
		}

		const applyBtn = this.sortFilterPopup.querySelector(".nt-sf-btn--apply");
		if (applyBtn) {
			applyBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
			applyBtn.addEventListener("click", () => {
				this._viewUndo.push(this._snapView());
				this._viewRedo = [];
				const dir = (this.sortFilterPopup.querySelector(`input[name="sf-sort-${col}"]:checked`) as HTMLInputElement)?.value as "asc" | "desc" | "none";
				this.view.setSort(col, dir);

				const ft = getFilterType();
				if (ft === "values") {
					const cbs = this.sortFilterPopup.querySelectorAll<HTMLInputElement>("input[type='checkbox']:not(.nt-sf-select-all)");
					const checked = new Set<string>();
					for (const cb of Array.from(cbs)) { if (cb.checked) checked.add(cb.value); }
					if (checked.size === 0) return;
					this.view.setFilter(col, checked.size < uniqueValues.length ? { op: "values", values: checked } : null);
				} else {
					const val = (this.sortFilterPopup.querySelector(`#sf-val-${col}`) as HTMLInputElement)?.value ?? "";
					const val2 = (this.sortFilterPopup.querySelector(`#sf-val2-${col}`) as HTMLInputElement)?.value ?? "";
					if (!val) return;
					const rawVal = colType === "select" ? (colDef?.options?.find((o) => o.label === val)?.value ?? val) : val;
					const rawVal2 = colType === "select" && val2 ? (colDef?.options?.find((o) => o.label === val2)?.value ?? val2) : val2;
					this.view.setFilter(col, { op: ft as import("./sheet-view").FilterOp, value: String(rawVal), value2: val2 ? String(rawVal2) : undefined });
				}

				this.syncView();
				this.updateSortIndicators();
				this._updateToolbar();
				this.hideSortFilterPopup();
			});
		}

		// Сбросить
		const clearBtn = this.sortFilterPopup.querySelector(".nt-sf-btn--clear");
		if (clearBtn) {
			clearBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
			clearBtn.addEventListener("click", () => {
				this._viewUndo.push(this._snapView());
				this._viewRedo = [];
				this.view.clearColumn(col);
				this.syncView();
				this.updateSortIndicators();
				this._updateToolbar();
				this.hideSortFilterPopup();
			});
		}

		// Показать попап невидимым, чтобы измерить его размеры
		this.sortFilterPopup.style.visibility = "hidden";
		this.sortFilterPopup.style.display = "block";
		this.sortFilterPopup.style.left = `${clampPopupX(clientX, this.sortFilterPopup)}px`;
		this.sortFilterPopup.style.top = `${clampPopupY(clientY, this.sortFilterPopup)}px`;
		this.sortFilterPopup.style.visibility = "visible";

		// Блокируем всплытие кликов из попапа, чтобы не закрывался сразу
		const stopClick = (ev: Event) => ev.stopPropagation();
		this.sortFilterPopup.addEventListener("mousedown", stopClick);
		this.sortFilterPopup.addEventListener("click", stopClick);

		const close = (ev: Event) => {
			if (this.sortFilterPopup.contains(ev.target as Node)) return;
			const child = document.querySelector(".nt-sf-child-popup");
			if (child?.contains(ev.target as Node)) return;
			document.removeEventListener("mousedown", close, true);
			document.removeEventListener("keydown", onEsc);
			this.sortFilterPopup.removeEventListener("mousedown", stopClick);
			this.sortFilterPopup.removeEventListener("click", stopClick);
			this.hideSortFilterPopup();
		};
		const onEsc = (ev: KeyboardEvent) => { if (ev.key === "Escape") close(ev); };
		document.addEventListener("mousedown", close, true);
	}

	private hideSortFilterPopup(): void {
		this.sortFilterPopup.style.display = "none";
		this.hideFilterChildPopup();
	}

	private hideFilterChildPopup(): void {
		if (this._childPopupCloseHandler) {
			document.removeEventListener("mousedown", this._childPopupCloseHandler, true);
			this._childPopupCloseHandler = null;
		}
		const existing = document.querySelector(".nt-sf-child-popup");
		if (existing) existing.remove();
	}

	private updateSortIndicators(): void {
		const btns = this.container.querySelectorAll(".nt-header-sort-btn");
		const svgUp = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>';
		const svgDown = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
		for (const btn of Array.from(btns)) {
			const c = Number((btn as HTMLElement).dataset.col);
			const idx = this.view.sortStack.findIndex((s) => s.col === c);
			const entry = idx >= 0 ? this.view.sortStack[idx] : null;
			btn.classList.toggle("nt-header-sort-btn--active", !!entry);
			if (entry && this.view.sortStack.length > 1) {
				(btn as HTMLElement).innerHTML = `<span class="nt-sort-num">${idx + 1}</span>` + (entry.asc ? svgUp : svgDown);
			} else if (entry) {
				(btn as HTMLElement).innerHTML = entry.asc ? svgUp : svgDown;
			} else {
				(btn as HTMLElement).innerHTML = svgDown;
			}
		}
		const filterBtns = this.container.querySelectorAll(".nt-header-filter-btn");
		for (const btn of Array.from(filterBtns)) {
			const c = Number((btn as HTMLElement).dataset.col);
			btn.classList.toggle("nt-header-filter-btn--active", this.view.filters.has(c));
		}
	}

	private insertRowAbove(atRow: number): void {
		this.model.insertRowAt(atRow);
		this.renderer.refreshValues();
	}

	private insertRowBelow(atRow: number): void {
		this.model.insertRowAt(atRow + 1);
		this.renderer.refreshValues();
	}

	private deleteSelectedRows(): void {
		if (!this.selection.start || !this.selection.end) return;
		const from = Math.min(this.selection.start.row, this.selection.end.row);
		const to = Math.max(this.selection.start.row, this.selection.end.row);
		// Не удалять заблокированные строки
		for (let r = from; r <= to; r++) {
			if (this.disabledRows.has(this.toDataRow(r))) return;
		}
		this.model.deleteRows(from, to);
		this.renderer.refreshValues();
	}

	private onMouseDown(e: MouseEvent): void {
		const target = e.target as HTMLElement;

		// Правый клик — проверить, попадает ли ячейка в текущее выделение
		if (e.button === 2) {
			// Не менять выделение на фантомных ячейках/заголовках
			const cell = (target as HTMLElement).closest(".nt-cell");
			if (cell?.classList.contains("nt-cell--phantom")) return;
			const header = (target as HTMLElement).closest(".nt-header-cell");
			if (header?.classList.contains("nt-header-cell--phantom") || header?.classList.contains("nt-header-cell--disabled")) return;

			const found = this.cellAtEvent(e);
			if (found) {
				const sr = this.selection.start;
				const er = this.selection.end;
				// Если клик вне выделенной области — переместить selection на эту ячейку
				if (
					!sr ||
					!er ||
					found.row < Math.min(sr.row, er.row) ||
					found.row > Math.max(sr.row, er.row) ||
					found.col < Math.min(sr.col, er.col) ||
					found.col > Math.max(sr.col, er.col)
				) {
					this.setSelection({ start: found, end: found });
				}
			}
			return;
		}

		// Ручка ресайза колонки
		if (target.classList.contains("nt-resize-handle") && !target.classList.contains("nt-resize-handle-row")) {
			const col = Number(target.dataset.col);
			if (!Number.isNaN(col)) this.startColResize(col, e.clientX);
			e.preventDefault();
			return;
		}

		// Ручка ресайза строки
		if (target.classList.contains("nt-resize-handle-row")) {
			const row = Number(target.dataset.row);
			if (!Number.isNaN(row)) this.startRowResize(row, e.clientY);
			e.preventDefault();
			return;
		}

		if (target.classList.contains("nt-checkbox")) {
			const cellEl = target.parentElement;
			if (cellEl?.classList.contains("nt-cell")) {
				const c = Number(cellEl.dataset.col);
				if (!Number.isNaN(c)) {
					const row = this.findRowForCell(cellEl);
					const colDef = this.renderer.getColumn(c);
					if (row >= 0 && !isReadOnly(colDef)) {
						this.setSelection({ start: { row, col: c }, end: { row, col: c } });
						this.toggleBoolean(row, c);
						this.container.focus();
					}
				}
			}
			e.preventDefault();
			return;
		}

		if (target === this.overlay.fillHandleElement()) {
			if (this.renderer.readonlyTable) return;
			this.startFillDrag();
			e.preventDefault();
			return;
		}

		// Кнопка фильтра в заголовке
		const filterBtn = target.closest(".nt-header-filter-btn") as HTMLElement | null;
		if (filterBtn) {
			const col = Number(filterBtn.dataset.col);
			if (!Number.isNaN(col)) {
				this.showSortFilterPopup(col, e.clientX, e.clientY);
			}
			e.preventDefault();
			return;
		}

		// Угловая ячейка — выделить всю таблицу
		if (target.classList.contains("nt-corner")) {
			const maxCol = this.renderer.hasExplicitColumns && this.renderer.dataColCount > 0
				? this.renderer.dataColCount - 1
				: this.renderer.totalCols - 1;
			const maxRow = this.renderer.visibleRowCount() - 1;
			this.setSelectionNoScroll({
				start: { row: 0, col: 0 },
				end: { row: maxRow, col: maxCol },
			});
			this.container.focus();
			return;
		}

		// Заголовок столбца — выделить весь столбец (без скролла)
		const colHeader = target.closest(".nt-header-cell") as HTMLElement;
		if (colHeader?.dataset.col !== undefined) {
			if (colHeader.classList.contains("nt-header-cell--phantom")) return;
			const col = Number(colHeader.dataset.col);
			const span = Number(colHeader.dataset.colSpan) || 1;
			if (!Number.isNaN(col)) {
				const endCol = col + span - 1;
				const maxRow = this.renderer.visibleRowCount() - 1;
				if (e.shiftKey && this.selection.start) {
					const end = { row: maxRow, col: endCol };
					this.setSelectionNoScroll({ start: this.selection.start, end });
				} else {
					this.setSelectionNoScroll({
						start: { row: 0, col },
						end: { row: maxRow, col: endCol },
					});
					this.startDrag("col");
				}
			}
			return;
		}

		// Заголовок строки — выделить всю строку (без скролла)
		const rowHeader = target.closest(".nt-header-cell") as HTMLElement;
		if (rowHeader?.dataset.row !== undefined) {
			if (rowHeader.classList.contains("nt-header-cell--disabled")) return;
			const row = Number(rowHeader.dataset.row);
			if (!Number.isNaN(row)) {
				const maxCol = this.renderer.hasExplicitColumns && this.renderer.dataColCount > 0
					? this.renderer.dataColCount - 1
					: this.renderer.totalCols - 1;
				if (e.shiftKey && this.selection.start) {
					const end = { row, col: maxCol };
					this.setSelectionNoScroll({ start: this.selection.start, end });
				} else {
					this.setSelectionNoScroll({
						start: { row, col: 0 },
						end: { row, col: maxCol },
					});
					this.startDrag("row");
				}
			}
			return;
		}

		if (
			!target.classList.contains("nt-cell") &&
			target !== this.renderer.cellsLayer
		) {
			return;
		}

		const found = this.cellAtEvent(e);
		if (!found) return;

		const { row, col } = found;

		// Фантомные колонки/строки не выделяются
		const cellEl = target.closest(".nt-cell") as HTMLElement;
		if (cellEl?.classList.contains("nt-cell--phantom")) return;

		if (this.editor.isActive()) this.editor.commit();

		if (e.shiftKey && this.selection.start) {
			this.setSelection({ start: this.selection.start, end: { row, col } });
		} else {
			this.setSelection({ start: { row, col }, end: { row, col } });
			if (e.detail !== 2) {
				this.startDrag();
			}
		}
		if (!this.editor.isActive()) {
			this.container.focus();
		}
	}

	private onDoubleClick(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		if (
			!target.classList.contains("nt-cell") &&
			target !== this.renderer.cellsLayer
		)
			return;

		const found = this.cellAtEvent(e);
		if (!found) return;

		if (this.renderer.readonlyTable) return;
		const colDef = this.renderer.getColumn(found.col);
		if (isBoolean(colDef) || isReadOnly(colDef)) return;
		if (this.disabledRows.has(this.toDataRow(found.row))) return;

		this.editor.start(found.row, found.col, colDef, "", false);
	}

	private toggleBoolean(row: number, col: number): void {
		if (this.renderer.readonlyTable) return;
		const dr = this.toDataRow(row);
		const cell = this.model.get(dr, col);
		const current = cell.value;
		const next = current === true || current === "true" ? "false" : "true";
		const key = cellKey(dr, col);
		this._undoMgr.startBatch(dr, col, { ...cell });
		this.model.set(dr, col, next);
		const newCell = this.model.get(dr, col);
		this._undoMgr.updateNewValue(0, { ...newCell });
		this._undoMgr.commit();
		this._updateToolbar();
		this.model.emit("edit", { [key]: { old: { ...cell }, new: { ...newCell } } });
		this.renderer.refreshValues();
	}

	// ── Undo / Redo / Save ────────────────────────────────────────────────────

	/** Отменить последнее действие. */
	undo(): void { this._undoRedo("undo"); }
	/** Вернуть отменённое действие. */
	redo(): void { this._undoRedo("redo"); }

	/**
	 * Сохранить состояние: ширины/высоты/стили → IndexedDB,
	 * данные → через onChange колбэк, очистить историю undo.
	 */
	save(): void {
		if (this.renderer.validationErrors && Object.keys(this.renderer.validationErrors).length > 0) return;
		this.saveColumnWidths();
		this.options.onChange?.(this.model.getAll(), {});
		this._undoMgr.clear();
		this._updateToolbar();
	}

	// ── Стили через тулбар ───────────────────────────────────────────────────

	/** Инвертировать жирный для выделенных ячеек. */
	toggleBold(): void { this.applyStyle({ bold: !this.getFirstSelectedStyle()?.bold }); }
	/** Инвертировать курсив. */
	toggleItalic(): void { this.applyStyle({ italic: !this.getFirstSelectedStyle()?.italic }); }
	/** Инвертировать подчёркивание. */
	toggleUnderline(): void { this.applyStyle({ underline: !this.getFirstSelectedStyle()?.underline }); }

	/** Инвертировать перенос текста. */
	toggleWrap(): void {
		this.applyStyle({ wrap: !this.getFirstSelectedStyle()?.wrap });
	}

	/** Горизонтальное выравнивание. */
	setAlign(align: "left" | "center" | "right"): void {
		this.applyStyle({ align });
	}

	/** Вертикальное выравнивание. */
	setValign(valign: "top" | "middle" | "bottom"): void {
		this.applyStyle({ valign });
	}

	/**
	 * Применить стиль ко всем выделенным ячейкам (слияние с существующим стилем).
	 * Записывает в undo-стек, обновляет тулбар и перерисовывает.
	 */
	private applyStyle(style: Partial<import("../utils/types").CellStyle>): void {
		if (!this.selection.start || !this.selection.end) return;
		const sr = Math.min(this.selection.start.row, this.selection.end.row);
		const er = Math.max(this.selection.start.row, this.selection.end.row);
		const sc = Math.min(this.selection.start.col, this.selection.end.col);
		const ec = Math.max(this.selection.start.col, this.selection.end.col);
		const changedCells: Record<string, { old: Cell | null; new: Cell | null }> = {};
		for (let r = sr; r <= er; r++) {
			for (let c = sc; c <= ec; c++) {
				const dr = this.toDataRow(r);
				const key = cellKey(dr, c);
				const old = this.model.get(dr, c);
				this._undoMgr.startBatch(dr, c, { ...old });
				const existing = { ...old };
				existing.style = { ...existing.style, ...style };
				changedCells[key] = { old: { ...old }, new: { ...existing } };
				this.model.setSilent(dr, c, existing);
				this._undoMgr.updateNewValue(this._undoMgr.batchSize - 1, { ...existing });
			}
		}
		this._undoMgr.commit();
		this._updateToolbar();
		this.updateToolbarStyleState();
		this.model.emit("edit", changedCells);
		this.renderer.refreshValues();
	}

	private getFirstSelectedStyle(): import("../utils/types").CellStyle | undefined {
		if (!this.selection.start) return undefined;
		const dr = this.toDataRow(this.selection.start.row);
		return this.model.get(dr, this.selection.start.col).style;
	}

	showAlignPopup(clientX: number, clientY: number): void {
		this.hideFilterChildPopup();
		const popup = document.createElement("div");
		popup.className = "nt-sf-child-popup";
		this._syncPopupTheme(popup);
		popup.style.display = "flex";
		popup.style.flexDirection = "column";
		popup.style.gap = "4px";
		popup.style.padding = "6px";

		const style = this.getFirstSelectedStyle();
		const selCol = this.selection.start?.col;
		const colDef = selCol !== undefined ? this.renderer.getColumn(selCol) : undefined;
		const defaultAlign = getCellAlign(colDef);
		const makeBtn = (icon: string, tooltip: string, action: () => void, active?: boolean) => {
			const btn = document.createElement("div");
			btn.className = "nt-tb-btn";
			if (active) btn.classList.add("nt-tb-btn--active");
			btn.dataset.tooltip = tooltip;
			btn.textContent = icon;
			btn.addEventListener("mousedown", (ev) => { ev.preventDefault(); });
			btn.addEventListener("click", () => { action(); this.hideFilterChildPopup(); });
			return btn;
		};

		const row1 = document.createElement("div");
		row1.style.display = "flex";
		row1.style.gap = "2px";
	const effectiveAlign = style?.align ?? defaultAlign;
		row1.append(makeBtn("┣", "По левому краю", () => this.setAlign("left"), effectiveAlign === "left"));
		row1.append(makeBtn("≡", "По центру", () => this.setAlign("center"), effectiveAlign === "center"));
		row1.append(makeBtn("┫", "По правому краю", () => this.setAlign("right"), effectiveAlign === "right"));
		popup.append(row1);

		const row2 = document.createElement("div");
		row2.style.display = "flex";
		row2.style.gap = "2px";
		row2.append(makeBtn("⤒", "По верхнему краю", () => this.setValign("top"), style?.valign === "top"));
		row2.append(makeBtn("⫟", "По середине", () => this.setValign("middle"), !style?.valign || style?.valign === "middle"));
		row2.append(makeBtn("⤓", "По нижнему краю", () => this.setValign("bottom"), style?.valign === "bottom"));
		popup.append(row2);

		document.body.append(popup);
		popup.style.left = `${clientX}px`;
		popup.style.top = `${clientY}px`;

		const close = (ev: MouseEvent) => {
			if (popup.contains(ev.target as Node)) return;
			this.hideFilterChildPopup();
			document.removeEventListener("mousedown", close, true);
		};
		setTimeout(() => document.addEventListener("mousedown", close, true), 0);
	}

	setCellStyle(style: Partial<import("../utils/types").CellStyle>): void {
		this.applyStyle(style);
	}

	private _undoRedo(dir: "undo" | "redo"): void {
		if (dir === "undo" && this._viewUndo.length > 0) {
			const snap = this._viewUndo.pop()!;
			this._viewRedo.push(this._snapView());
			this._restoreView(snap);
			this._updateToolbar();
			return;
		}
		if (dir === "redo" && this._viewRedo.length > 0) {
			const snap = this._viewRedo.pop()!;
			this._viewUndo.push(this._snapView());
			this._restoreView(snap);
			this._updateToolbar();
			return;
		}
		const batch = dir === "undo" ? this._undoMgr.undo() : this._undoMgr.redo();
		if (!batch) return;
		let hasLayout = false;
		const changedCells: Record<string, { old: Cell | null; new: Cell | null }> = {};
		for (const c of batch) {
			if (c.colWidth) { this.renderer.setColWidth(c.col, c.colWidth.old); hasLayout = true; continue; }
			if (c.rowHeight) { this.renderer.setRowHeight(c.row, c.rowHeight.old); hasLayout = true; continue; }
			const key = cellKey(c.row, c.col);
			const oldCell = this.model.get(c.row, c.col);
			const empty = oldCell.value === null || oldCell.value === undefined;
			changedCells[key] = { old: empty ? null : { ...oldCell }, new: c.oldValue };
			if (c.oldValue === null) this.model.deleteSilent(c.row, c.col);
			else this.model.setSilent(c.row, c.col, c.oldValue);
		}
		this.renderer.refreshValues();
		if (hasLayout) {
			this.renderer.updateContainerSizes();
			this.renderer.render(true);
			this.overlay.update(this.selection);
			this.renderer.highlightHeaders(this.selection);
		}
		this._updateToolbar();
		this.model.emit(dir as ChangeAction, changedCells);
	}

	private _snapView(): string {
		return JSON.stringify({
			sort: this.view.sortStack.map((s) => ({ col: s.col, asc: s.asc })),
			filters: Array.from(this.view.filters.entries()).map(([col, f]) => ({
				col, op: f.op, value: f.value, value2: f.value2,
				values: f.values ? Array.from(f.values) : undefined,
			})),
		});
	}

	private _restoreView(snap: string): void {
		const state = JSON.parse(snap) as { sort: Array<{ col: number; asc: boolean }>; filters: Array<{ col: number; op: string; value?: string; value2?: string; values?: string[] }> };
		this.view.sortStack = state.sort.map((s) => ({ col: s.col, asc: s.asc }));
		this.view.filters.clear();
		for (const f of state.filters) {
			const filter: import("./sheet-view").ColumnFilter = { op: f.op as import("./sheet-view").FilterOp, value: f.value, value2: f.value2 };
			if (f.values) filter.values = new Set(f.values);
			this.view.filters.set(f.col, filter);
		}
		this.view.forceRebuild();
		this.syncView();
		this.updateSortIndicators();
	}

	private _updateToolbar(): void {
		const u = document.querySelector(".nt-tb-btn[data-action=undo]") as HTMLButtonElement;
		const r = document.querySelector(".nt-tb-btn[data-action=redo]") as HTMLButtonElement;
		const dot = document.querySelector(".nt-tb-dot") as HTMLElement;
		if (u) u.disabled = !this._undoMgr.canUndo && this._viewUndo.length === 0;
		if (r) r.disabled = !this._undoMgr.canRedo && this._viewRedo.length === 0;
		if (dot) dot.style.display = this._undoMgr.canUndo ? "block" : "none";
	}

	updateToolbarStyleState(): void {
		const style = this.getFirstSelectedStyle();
		const cls = "nt-tb-btn--active";
		const buttons: Record<string, string | undefined> = {
			bold: style?.bold ? "bold" : undefined,
			italic: style?.italic ? "italic" : undefined,
			underline: style?.underline ? "underline" : undefined,
			wrap: style?.wrap ? "wrap" : undefined,
		};
		for (const [action, on] of Object.entries(buttons)) {
			const btn = document.querySelector(`.nt-tb-btn[data-action=${action}]`);
			if (btn) btn.classList.toggle(cls, !!on);
		}
		const alignBtn = document.querySelector(".nt-tb-btn[data-action=align]");
		if (alignBtn) alignBtn.classList.toggle(cls, !!(style && (style.align || style.valign)));
	}

	private findRowForCell(cellEl: HTMLElement): number {
		return Number(cellEl.dataset.row ?? -1);
	}

	private startDrag(axis?: "row" | "col"): void {
		if (!this.selection.start) return;
		const onMove = (ev: MouseEvent) => {
			const bodyRect = this.renderer.bodyDiv.getBoundingClientRect();
			const x = ev.clientX - bodyRect.left;
			const y = ev.clientY - bodyRect.top;
			const found = this.renderer.cellAt(x, y);
			if (found && this.selection.start) {
				const end = { ...found };
				const maxRow = this.renderer.visibleRowCount() - 1;
				if (axis === "row") {
					end.col = this.renderer.hasExplicitColumns && this.renderer.dataColCount > 0
						? this.renderer.dataColCount - 1
						: this.renderer.totalCols - 1;
					this.selection.start = { row: this.selection.start.row, col: 0 };
				} else if (axis === "col") {
					end.row = maxRow;
					this.selection.start = { row: 0, col: this.selection.start.col };
				} else {
					if (this.renderer.hasExplicitColumns && this.renderer.dataColCount > 0 && end.col >= this.renderer.dataColCount) {
						end.col = this.renderer.dataColCount - 1;
					}
					if (end.row > maxRow) end.row = maxRow;
				}
				this.setSelectionNoScroll({ start: this.selection.start, end });
			}
			this.autoScroll(ev);
		};
		const onUp = () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
			this.stopAutoScroll();
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
		this.startAutoScroll(onMove);
	}

	private startFillDrag(): void {
		if (!this.selection.start || !this.selection.end) return;
		const srcTop = Math.min(this.selection.start.row, this.selection.end.row);
		const srcBottom = Math.max(
			this.selection.start.row,
			this.selection.end.row,
		);
		const srcLeft = Math.min(this.selection.start.col, this.selection.end.col);
		const srcRight = Math.max(this.selection.start.col, this.selection.end.col);

		const onMove = (ev: MouseEvent) => {
			const bodyRect = this.renderer.bodyDiv.getBoundingClientRect();
			const found = this.renderer.cellAt(
				ev.clientX - bodyRect.left,
				ev.clientY - bodyRect.top,
			);
			if (!found) return;
			// Не протягивать на фантомные колонки/строки
			const maxCol = this.renderer.hasExplicitColumns && this.renderer.dataColCount > 0
				? this.renderer.dataColCount - 1
				: this.renderer.totalCols - 1;
			const maxRow = this.renderer.visibleRowCount() - 1;
			let newTop = srcTop;
			let newBottom = srcBottom;
			let newLeft = srcLeft;
			let newRight = srcRight;
			if (found.row > srcBottom) newBottom = Math.min(found.row, maxRow);
			else if (found.row < srcTop) newTop = found.row;
			if (found.col > srcRight) newRight = Math.min(found.col, maxCol);
			else if (found.col < srcLeft) newLeft = found.col;
			this.setSelectionNoScroll({
				start: { row: newTop, col: newLeft },
				end: { row: newBottom, col: newRight },
			});
			this.autoScroll(ev);
		};
		const onUp = () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
			this.stopAutoScroll();
			const start = this.selection.start;
			const end = this.selection.end;
			if (!start || !end) return;
			this.applyFill(
				Math.min(start.row, end.row),
				Math.max(start.row, end.row),
				Math.min(start.col, end.col),
				Math.max(start.col, end.col),
				srcTop,
				srcBottom,
				srcLeft,
				srcRight,
			);
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	}

	private applyFill(
		top: number,
		bottom: number,
		left: number,
		right: number,
		srcTop: number,
		srcBottom: number,
		srcLeft: number,
		srcRight: number,
	): void {
		// Не заходить на фантомные колонки/строки
		if (this.renderer.hasExplicitColumns && this.renderer.dataColCount > 0) {
			right = Math.min(right, this.renderer.dataColCount - 1);
			left = Math.min(left, this.renderer.dataColCount - 1);
		}
		if (!this.renderer.allowAddRows) {
			bottom = Math.min(bottom, this.renderer.visibleRowCount() - 1);
			top = Math.min(top, this.renderer.visibleRowCount() - 1);
		}
		const srcH = srcBottom - srcTop + 1;
		const changedCells: Record<string, { old: Cell | null; new: Cell | null }> = {};
		for (let c = left; c <= right; c++) {
			const srcNums: number[] = [];
			for (let r = srcTop; r <= srcBottom; r++) {
				const v = this.model.get(this.toDataRow(r), c).value;
				const n = typeof v === "number" ? v : Number(v);
				srcNums.push(Number.isNaN(n) ? Number.NaN : n);
			}
			const allNums = srcNums.every((n) => !Number.isNaN(n));
			const step = allNums && srcH >= 2 ? srcNums[srcH - 1] - srcNums[0] : NaN;
			const linear = allNums && !Number.isNaN(step) && step !== 0;

			for (let r = top; r <= bottom; r++) {
				if (r >= srcTop && r <= srcBottom && c >= srcLeft && c <= srcRight) continue;
				const dr = this.toDataRow(r);
				if (this.disabledRows.has(dr)) continue;
				if (this.renderer.getColumn(c)?.readOnly) continue;
				const key = cellKey(dr, c);
				const old = this.model.get(dr, c);
				const empty = old.value === null || old.value === undefined;
				this._undoMgr.startBatch(dr, c, empty ? null : { ...old });
				if (linear) {
					const dist = r - srcTop;
					const val = srcNums[0] + (step * dist) / (srcH - 1);
					const firstSrc = this.model.get(this.toDataRow(srcTop), c);
					const cell = this.model.get(dr, c);
					cell.value = val;
					if (firstSrc.style) cell.style = { ...firstSrc.style };
					else delete cell.style;
					this.model.setSilent(dr, c, cell);
				} else {
					const srcRow = clamp(cycle(r - srcTop, srcBottom - srcTop + 1) + srcTop, srcTop, srcBottom);
					const src = this.model.get(this.toDataRow(srcRow), c);
					const cell = this.model.get(dr, c);
					cell.value = src.value;
					if (src.style) cell.style = { ...src.style };
					else delete cell.style;
					this.model.setSilent(dr, c, cell);
				}
				const newCell = this.model.get(dr, c);
				changedCells[key] = { old: empty ? null : { ...old }, new: { ...newCell } };
				this._undoMgr.updateNewValue(this._undoMgr.batchSize - 1, { ...newCell });
			}
		}
		this._undoMgr.commit();
		this._updateToolbar();
		this.model.emit("fill", changedCells);
		this.renderer.refreshValues();
	}

	private onKeyDown(e: KeyboardEvent): void {
		if (this.editor.isActive()) return;
		handleKeyboard(e, {
			selection: this.selection,
			totalRows: this.renderer.totalRows,
			totalCols: this.renderer.totalCols,
			maxRow: !this.renderer.allowAddRows ? this.renderer.visibleRowCount() - 1 : undefined,
			maxCol: this.renderer.hasExplicitColumns && this.renderer.dataColCount > 0 ? this.renderer.dataColCount - 1 : undefined,
			isEditing: false,
			setSelection: (rect) => this.setSelection(rect),
		startEdit: (row, col, initial) => {
				if (this.renderer.readonlyTable) return;
				const colDef = this.renderer.getColumn(col);
				if (isReadOnly(colDef)) return;
				if (this.disabledRows.has(this.toDataRow(row))) return;
				this.editor.start(row, col, colDef, initial ?? "", true);
			},
			commitEdit: () => this.editor.commit(),
			cancelEdit: () => this.handleEscape(),
			onCopy: () => this.copy(),
			onPaste: () => { if (!this.renderer.readonlyTable) this.paste(); },
			onDelete: () => { if (!this.renderer.readonlyTable) this.deleteSelection(); },
			onUndo: () => this.undo(),
			onRedo: () => this.redo(),
			onSave: () => this.save(),
		});
	}

	private copy(): void {
		if (!this.selection.start || !this.selection.end) return;
		const sr = Math.min(this.selection.start.row, this.selection.end.row);
		const er = Math.max(this.selection.start.row, this.selection.end.row);
		const sc = Math.min(this.selection.start.col, this.selection.end.col);
		const ec = Math.max(this.selection.start.col, this.selection.end.col);
		const values: (string | number | boolean | null)[][] = [];
		const styles: (import("../utils/types").CellStyle | null)[][] = [];
		for (let r = sr; r <= er; r++) {
			const row: (string | number | boolean | null)[] = [];
			const styleRow: (import("../utils/types").CellStyle | null)[] = [];
			for (let c = sc; c <= ec; c++) {
				const cell = this.model.get(this.toDataRow(r), c);
				const colDef = this.renderer.getColumn(c);
				const showTypes = ["select", "boolean", "date"];
				row.push(showTypes.includes(colDef?.type ?? "") ? formatCellDisplay(cell.value ?? null, colDef) as string : (cell.value ?? null));
				styleRow.push(cell.style ?? null);
			}
			values.push(row);
			styles.push(styleRow);
		}
		this.clipboard = { rect: { sr, er, sc, ec }, values, styles };
		const clipText = values
			.map((row) => row.map((v) => (v === null ? "" : String(v))).join("\t"))
			.join("\n");
		navigator.clipboard?.writeText(clipText).catch(() => {});

		this.copyRect = { start: this.selection.start, end: this.selection.end };
		this.overlay.showCopyRange(this.copyRect);
	}

	private paste(): void {
		this.clearCopy();
		if (!this.clipboard || !this.selection.start || !this.selection.end) return;
		const target = {
			row: Math.min(this.selection.start.row, this.selection.end.row),
			col: Math.min(this.selection.start.col, this.selection.end.col),
		};
		const height = this.clipboard.rect.er - this.clipboard.rect.sr + 1;
		const width = this.clipboard.rect.ec - this.clipboard.rect.sc + 1;
		const changedCells: Record<string, { old: Cell | null; new: Cell | null }> = {};
		for (let r = 0; r < height; r++) {
			const dr = this.toDataRow(target.row + r);
			if (this.disabledRows.has(dr)) continue;
			for (let c = 0; c < width; c++) {
				const colDef = this.renderer.getColumn(target.col + c);
				if (colDef?.readOnly) continue;
				const key = cellKey(dr, target.col + c);
				const old = this.model.get(dr, target.col + c);
				const empty = old.value === null || old.value === undefined;
				this._undoMgr.startBatch(dr, target.col + c, empty ? null : { ...old });
				const value = this.clipboard.values[r]?.[c] ?? null;
				const srcStyle = this.clipboard.styles?.[r]?.[c];
				const raw = value === null ? "" : String(value);
				const cell = this.model.get(dr, target.col + c);
				cell.value = raw === "" ? null : value;
				if (srcStyle) cell.style = { ...srcStyle };
				else delete cell.style;
				changedCells[key] = { old: empty ? null : { ...old }, new: { ...cell } };
				this.model.setSilent(dr, target.col + c, cell);
				const newCell = this.model.get(dr, target.col + c);
				this._undoMgr.updateNewValue(this._undoMgr.batchSize - 1, { ...newCell });
			}
		}
		this._undoMgr.commit();
		this._updateToolbar();
		this.model.emit("paste", changedCells);
		this.setSelectionNoScroll({
			start: target,
			end: { row: target.row + height - 1, col: target.col + width - 1 },
		});
		this.renderer.refreshValues();
	}

	private deleteSelection(): void {
		this.clearCopy();
		if (!this.selection.start || !this.selection.end) return;
		const top = Math.min(this.selection.start.row, this.selection.end.row);
		const bottom = Math.max(this.selection.start.row, this.selection.end.row);
		const left = Math.min(this.selection.start.col, this.selection.end.col);
		const right = Math.max(this.selection.start.col, this.selection.end.col);
		const changedCells: Record<string, { old: Cell | null; new: Cell | null }> = {};
		for (let r = top; r <= bottom; r++) {
			const dr = this.toDataRow(r);
			if (this.disabledRows.has(dr)) continue;
			for (let c = left; c <= right; c++) {
				const colDef = this.renderer.getColumn(c);
				if (colDef?.readOnly) continue;
				const key = cellKey(dr, c);
				const old = this.model.get(dr, c);
				const empty = old.value === null || old.value === undefined;
				this._undoMgr.startBatch(dr, c, empty ? null : { ...old });
				this.model.deleteSilent(dr, c);
				this._undoMgr.updateNewValue(this._undoMgr.batchSize - 1, null);
				if (!empty) changedCells[key] = { old: { ...old }, new: null };
			}
		}
		this._undoMgr.commit();
		this._updateToolbar();
		this.model.emit("clear", changedCells);
		this.renderer.refreshValues();
	}

	// direction — куда перевести курсор после завершения редактирования
	private commitEdit(
		row: number,
		col: number,
		value: string,
		direction: "enter" | "tab" | "shift-tab" | "none",
	): void {
		this.clearCopy();
		const dr = this.toDataRow(row);
		const colDef = this.renderer.getColumn(col);
		const oldCell = this.model.get(dr, col);
		const oldStr = oldCell.value === null || oldCell.value === undefined ? "" : String(oldCell.value);
		// Не записывать undo если значение не изменилось
		if (value !== oldStr) {
			const key = cellKey(dr, col);
			const isEmpty = oldCell.value === null || oldCell.value === undefined;
			this._undoMgr.startBatch(dr, col, isEmpty ? null : { ...oldCell });
			this.model.set(dr, col, value, colDef?.type);
			const newCell = this.model.get(dr, col);
			this._undoMgr.updateNewValue(this._undoMgr.batchSize - 1, { ...newCell });
			this._undoMgr.commit();
			this._updateToolbar();
			this.model.emit("edit", { [key]: { old: isEmpty ? null : { ...oldCell }, new: { ...newCell } } });
		}
		this.renderer.refreshValues();
		const { totalCols } = this.renderer;
		let nextRow = row;
		let nextCol = col;
		if (direction === "enter") nextRow = Math.min(row + 1, this.renderer.visibleRowCount() - 1);
		else if (direction === "tab") nextCol = Math.min(col + 1, totalCols - 1);
		else if (direction === "shift-tab") nextCol = Math.max(col - 1, 0);
		this.setSelection({
			start: { row: nextRow, col: nextCol },
			end: { row: nextRow, col: nextCol },
		});
		this.container.focus();
	}

	private handleEscape(): void {
		if (this.editor.isActive()) {
			this.editor.cancel();
		}
		this.clearCopy();
	}

	private startColResize(col: number, startX: number): void {
		const oldW = this.renderer.getColWidth(col);
		this.resizingCol = col;
		this.resizeStartX = startX;
		this.resizeStartWidth = oldW;

		const onMove = (ev: MouseEvent) => {
			const delta = ev.clientX - this.resizeStartX;
			this.renderer.setColWidth(this.resizingCol, Math.max(30, this.resizeStartWidth + delta));
			this.renderer.updateContainerSizes();
			this.renderer.render(true);
			this.renderer.render(true);
			this.overlay.update(this.selection);
		};
		const onUp = () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
			const newW = this.renderer.getColWidth(this.resizingCol);
			if (newW !== oldW) {
				this._undoMgr.addRecord({ row: 0, col, oldValue: null, newValue: null, colWidth: { old: oldW, new: newW } });
				this._undoMgr.commit();
				this._updateToolbar();
			}
			this.resizingCol = -1;
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	}

	private startRowResize(row: number, startY: number): void {
		const oldH = this.renderer.getRowHeight(row);
		const onMove = (ev: MouseEvent) => {
			this.renderer.setRowHeight(row, oldH + (ev.clientY - startY));
			this.overlay.update(this.selection);
		};
		const onUp = () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
			const newH = this.renderer.getRowHeight(row);
			if (newH !== oldH) {
				this._undoMgr.addRecord({ row, col: 0, oldValue: null, newValue: null, rowHeight: { old: oldH, new: newH } });
				this._undoMgr.commit();
				this._updateToolbar();
			}
			this.overlay.update(this.selection);
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	}

	private saveColumnWidths(): void {
		const widths: Record<string, number> = {};
		const limit = this.renderer.hasExplicitColumns ? this.renderer.dataColCount : this.renderer.totalCols;
		for (let c = 0; c < limit; c++) widths[String(c)] = this.renderer.getColWidth(c);
		// Сохраняем высоты только до последней НЕ-дефолтной строки
		const heights: number[] = [];
		let lastNonDefault = -1;
		for (let r = 0; r < this.renderer.totalRows; r++) {
			const h = this.renderer.getRowHeight(r);
			heights.push(h);
			if (h !== DEFAULT_ROW_HEIGHT) lastNonDefault = r;
		}
		const styles = this.collectStyles();
		saveState(this.options.tableName, { widths, heights: heights.slice(0, lastNonDefault + 1), styles });
	}

	private collectStyles(): Record<string, import("../utils/types").CellStyle> {
		const result: Record<string, import("../utils/types").CellStyle> = {};
		const all = this.model.getAll();
		for (const [key, cell] of Object.entries(all)) {
			if (cell.style && (cell.style.background || cell.style.color || cell.style.wrap || cell.style.align || cell.style.valign || cell.style.bold || cell.style.italic || cell.style.underline)) {
				result[key] = cell.style;
			}
		}
		return result;
	}

	private applyStyles(styles: Record<string, import("../utils/types").CellStyle>): void {
		for (const [key, style] of Object.entries(styles)) {
			const cell = this.model.getByKey(key) ?? { value: null };
			cell.style = { ...cell.style, ...style };
			this.model.setSilentByKey(key, cell);
		}
	}

	private autoScrollTimer: number | null = null;
	private autoScrollOnMove: ((_ev: MouseEvent) => void) | null = null;
	private lastAutoScrollEv: MouseEvent | null = null;

	private startAutoScroll(onMove: (ev: MouseEvent) => void): void {
		this.autoScrollOnMove = onMove;
	}

	private autoScroll(ev: MouseEvent): void {
		this.lastAutoScrollEv = ev;
		const rect = this.renderer.bodyDiv.getBoundingClientRect();
		const x = ev.clientX - rect.left;
		const y = ev.clientY - rect.top;
		const margin = 30;
		this.autoScrollDX = 0; this.autoScrollDY = 0;
		if (x < margin) this.autoScrollDX = -(margin - x);
		else if (x > rect.width - margin) this.autoScrollDX = (x - rect.width + margin);
		if (y < margin) this.autoScrollDY = -(margin - y);
		else if (y > rect.height - margin) this.autoScrollDY = (y - rect.height + margin);

		if (!this.autoScrollDX && !this.autoScrollDY) return;

		if (!this.autoScrollTimer) {
			const bd = this.renderer.bodyDiv;
			const onMove = this.autoScrollOnMove;
			const step = () => {
				if (!this.autoScrollTimer) return;
				const speed = Math.max(1, Math.abs(this.autoScrollDX) + Math.abs(this.autoScrollDY));
				bd.scrollLeft += this.autoScrollDX * 0.02 * speed;
				bd.scrollTop += this.autoScrollDY * 0.02 * speed;
				if (this.lastAutoScrollEv) onMove?.(this.lastAutoScrollEv);
				this.autoScrollTimer = requestAnimationFrame(step);
			};
			this.autoScrollTimer = requestAnimationFrame(step);
		}
	}

	private autoScrollDX = 0;
	private autoScrollDY = 0;

	private stopAutoScroll(): void {
		if (this.autoScrollTimer !== null) {
			cancelAnimationFrame(this.autoScrollTimer);
			this.autoScrollTimer = null;
		}
		this.autoScrollOnMove = null;
		this.lastAutoScrollEv = null;
		this.autoScrollDX = 0;
		this.autoScrollDY = 0;
	}

	private cancelEdit(): void {
		this.clearCopy();
		this.container.focus();
	}

}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v));
}

function cycle(v: number, mod: number): number {
	if (mod === 0) return 0;
	return ((v % mod) + mod) % mod;
}

/** Подогнать X-позицию попапа под границы экрана. */
function clampPopupX(clientX: number, el: HTMLElement): number {
	const w = el.getBoundingClientRect().width || 240;
	const maxX = window.innerWidth - w - 8;
	return Math.max(8, Math.min(clientX, maxX));
}

/** Подогнать Y-позицию попапа под границы экрана. */
function clampPopupY(clientY: number, el: HTMLElement): number {
	const h = el.getBoundingClientRect().height || 340;
	const maxY = window.innerHeight - h - 8;
	return Math.max(8, Math.min(clientY, maxY));
}
