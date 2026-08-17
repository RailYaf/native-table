// ── Редактор ячейки ──────────────────────────────────────────────────────────
//
// Редакторы по типу колонки:
//   1. text/number — <textarea> с авто-ростом (весь текст с переносом)
//   2. date/datetime — текст + кастомный календарь (datetime — с выбором времени)
//   3. select — прозрачный триггер + выпадающий список опций (position: absolute)
//   4. array/json — отдельные редакторы с кнопками Сохранить/Отмена
//
// CommitDirection управляет тем, куда перейти после завершения редактирования.
// Все элементы уничтожаются после commit/cancel.

import { formatCellDisplay, getEditValue, isBoolean } from "../utils/column-utils";
import type { SheetModel } from "../core/model";
import type { SheetView } from "../core/sheet-view";
import type { Cell, ColumnDef } from "../utils/types";
import { DatePickerPopup } from "./date-picker";
import { onDismiss } from "./popup-utils";

export type CommitDirection = "enter" | "tab" | "shift-tab" | "none";

export class Editor {
	private activeEl: HTMLInputElement | HTMLTextAreaElement | HTMLDivElement | null = null;
	private dropdownEl: HTMLDivElement | null = null;
	private disposeDropdown: (() => void) | null = null;
	private mode: "text" | "select" | "array" | "date" = "text";
	private active = false;

	/** Элементы редактора массива */
	private arrayContainer: HTMLDivElement | null = null;
	private arrayRows: HTMLInputElement[] = [];

	row = -1;
	col = -1;

	private model: SheetModel;
	private view: SheetView | null = null;

	constructor(
		private host: HTMLDivElement, // контейнер, куда вставляются элементы редактора
		model: SheetModel,
		/** Позиция и размер ячейки в пикселях */
		private getCellBox: (_row: number, _col: number) => { left: number; top: number; width: number; height: number },
		/** Вызывается при commit — передаёт строковое значение и направление */
		private onCommit: (_row: number, _col: number, _value: string, _direction: CommitDirection) => void,
		private onCancel: () => void,
	) {
		this.model = model;
	}

	setModel(model: SheetModel): void { this.model = model; }
	setView(view: SheetView): void { this.view = view; }

	/** Получить ячейку через view (если активна фильтрация) или напрямую из model. */
	private getCell(displayRow: number, col: number): Cell {
		if (this.view) return this.view.get(displayRow, col);
		return this.model.get(displayRow, col);
	}

	/**
	 * Начать редактирование ячейки.
	 * @param selectAll — выделить всё содержимое в поле ввода (false при вводе нового символа)
	 */
	start(row: number, col: number, colDef?: ColumnDef, initial = "", selectAll = true): void {
		if (isBoolean(colDef)) return;
		if (this.active && this.row === row && this.col === col) return;
		if (this.active) this.commit("none");

		this.row = row;
		this.col = col;

		const cell = this.getCell(row, col);
		const box = this.getCellBox(row, col);
		const currentValue = initial || getEditValue(cell.value ?? null, colDef);

		const type = colDef?.type ?? "text";

		if (type === "array") {
			this.startArrayEditor(box, colDef, cell.value ?? []);
		} else if (type === "json") {
			this.startJsonEditor(box, cell.value ?? null);
		} else if (type === "select" && colDef?.options?.length) {
			this.startSelectEditor(box, colDef, currentValue);
		} else if (type === "date" || type === "datetime") {
			this.startDateEditor(box, currentValue, colDef, type === "datetime");
		} else {
			this.startTextEditor(box, type, currentValue, selectAll);
		}
	}

	// ── Select-редактор ───────────────────────────────────────────────────────

	/** Select-редактор: прозрачный триггер поверх ячейки + дропдаун с поиском. */
	private startSelectEditor(
		box: { left: number; top: number; width: number; height: number },
		colDef: ColumnDef,
		currentValue: string,
	): void {
		const trigger = document.createElement("div");
		trigger.className = "nt-editor nt-editor--select-trigger";
		applyBox(trigger, box);
		this.host.append(trigger);
		this.activeEl = trigger;

		const dropdown = document.createElement("div");
		dropdown.className = "nt-select-dropdown";
		dropdown.style.position = "absolute";
		dropdown.style.left = `${box.left}px`;
		dropdown.style.minWidth = `${box.width}px`;
		dropdown.style.zIndex = "100";
		dropdown.style.visibility = "hidden"; // сначала скрыто, чтобы измерить высоту

		// Инпут поиска — фиксирован сверху, не скроллится вместе со списком
		const searchInput = document.createElement("input");
		searchInput.className = "nt-select-dropdown-search";
		searchInput.placeholder = "Поиск...";
		searchInput.spellcheck = false;

		const list = document.createElement("div");
		list.className = "nt-select-dropdown-list";

		// Пустой пункт (виден только при пустом поиске)
		const emptyItem = document.createElement("div");
		emptyItem.className = "nt-select-dropdown-item";
		emptyItem.textContent = "—";
		emptyItem.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
		emptyItem.addEventListener("click", () => { this.commitSelect(""); });

		const noMatches = document.createElement("div");
		noMatches.className = "nt-select-dropdown-empty";
		noMatches.textContent = "Ничего не найдено";
		noMatches.style.display = "none";

		const optionEls: Array<{ el: HTMLDivElement; label: string }> = [];
		for (const opt of colDef.options ?? []) {
			const item = document.createElement("div");
			item.className = "nt-select-dropdown-item";
			item.textContent = opt.label;
			item.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
			item.addEventListener("click", () => { this.commitSelect(String(opt.value)); });
			if (String(opt.value) === currentValue) item.classList.add("nt-select-dropdown-item--selected");
			optionEls.push({ el: item, label: opt.label.toLowerCase() });
		}

		// Фильтрация по подстроке (регистронезависимо).
		// Линия-разделитель убирается у последнего ВИДИМОГО пункта (скрытые
		// пункты остаются в DOM, поэтому :last-child не работает)
		searchInput.addEventListener("input", () => {
			const q = searchInput.value.trim().toLowerCase();
			let visible = 0;
			let lastVisibleEl: HTMLDivElement | null = null;
			for (const { el, label } of optionEls) {
				const show = q === "" || label.includes(q);
				el.style.display = show ? "" : "none";
				el.classList.remove("nt-select-dropdown-item--no-border");
				if (show) {
					visible++;
					lastVisibleEl = el;
				}
			}
			emptyItem.style.display = q === "" ? "" : "none";
			lastVisibleEl?.classList.add("nt-select-dropdown-item--no-border");
			noMatches.style.display = q !== "" && visible === 0 ? "" : "none";
		});

		list.append(emptyItem);
		for (const { el } of optionEls) list.append(el);
		list.append(noMatches);
		// Изначально линия-разделитель убирается у последнего пункта списка
		const lastOption = optionEls[optionEls.length - 1]?.el ?? emptyItem;
		lastOption.classList.add("nt-select-dropdown-item--no-border");
		dropdown.append(searchInput, list);

		this.host.append(dropdown);
		this.dropdownEl = dropdown;

		// Определить направление: если не помещается снизу — показать сверху
		const ddH = dropdown.offsetHeight || 100;
		const hostH = this.host.clientHeight;
		const fitsBelow = box.top + box.height + ddH <= hostH;
		dropdown.style.top = fitsBelow
			? `${box.top + box.height}px`
			: `${box.top - ddH}px`;
		dropdown.style.visibility = "";

		this.active = true;
		this.mode = "select";
		this.activeEl.classList.add("nt-editor--active");
		// Сразу можно печатать поиск
		setTimeout(() => searchInput.focus(), 0);

		// Закрыть по клику вне дропдауна или Escape.
		// Отписка живёт в cleanup(): иначе слушатель остаётся на document
		// после выбора пункта и «отменяет» редактирование чужих ячеек.
		this.disposeDropdown = onDismiss(() => [dropdown, trigger], () => this.cancel());
	}

	/** Подтвердить выбор в select-редакторе. */
	private commitSelect(value: string): void {
		const row = this.row;
		const col = this.col;
		this.cleanup();
		this.onCommit(row, col, value, "none");
	}

	// ── Array-редактор ────────────────────────────────────────────────────────

	private startArrayEditor(
		box: { left: number; top: number; width: number; height: number },
		colDef?: ColumnDef,
		cellValue?: unknown,
	): void {
		const subtype = colDef?.subtype ?? "text";
		const items: unknown[] = Array.isArray(cellValue) ? cellValue : [];

		const container = document.createElement("div");
		container.className = "nt-editor nt-editor--array";
		container.style.position = "absolute";
		container.style.left = `${box.left}px`;
		container.style.top = `${box.top}px`;
		container.style.minWidth = `${Math.max(box.width, 200)}px`;
		container.style.zIndex = "10";

		this.arrayRows = [];
		for (const item of items) {
			this.addArrayRow(container, String(item ?? ""), subtype);
		}

		const addBtn = document.createElement("button");
		addBtn.className = "nt-editor-array-add";
		addBtn.textContent = "+ Добавить";
		addBtn.addEventListener("mousedown", (e) => { e.preventDefault(); });
		addBtn.addEventListener("click", () => {
			this.addArrayRow(container, "", subtype);
			this.updateArraySize();
		});
		container.append(addBtn);

		const footer = document.createElement("div");
		footer.className = "nt-editor-array-footer";
		const saveBtn = document.createElement("button");
		saveBtn.className = "nt-editor-array-save";
		saveBtn.textContent = "Сохранить";
		saveBtn.addEventListener("mousedown", (e) => { e.preventDefault(); });
		saveBtn.addEventListener("click", () => this.commitArray());
		footer.append(saveBtn);

		const cancelBtn = document.createElement("button");
		cancelBtn.className = "nt-editor-array-cancel";
		cancelBtn.textContent = "Отмена";
		cancelBtn.addEventListener("mousedown", (e) => { e.preventDefault(); });
		cancelBtn.addEventListener("click", () => this.cancel());
		footer.append(cancelBtn);
		container.append(footer);

		this.host.append(container);
		this.activeEl = container;
		this.active = true;
		this.mode = "array";
		this.arrayContainer = container;
		container.classList.add("nt-editor--active");

		this.disposeDropdown = onDismiss(() => [container], () => this.commitArray());
	}

	private addArrayRow(container: HTMLElement, value: string, subtype: string): void {
		const row = document.createElement("div");
		row.className = "nt-editor-array-row";
		const input = document.createElement("input");
		input.className = "nt-editor-array-input";
		input.value = value;
		input.spellcheck = false;
		if (subtype === "number") input.inputMode = "decimal";
		input.addEventListener("keydown", (e) => this.onKeyDown(e));
		row.append(input);

		const removeBtn = document.createElement("button");
		removeBtn.className = "nt-editor-array-remove";
		removeBtn.textContent = "✕";
		removeBtn.addEventListener("mousedown", (e) => { e.preventDefault(); });
		removeBtn.addEventListener("click", () => {
			row.remove();
			this.arrayRows = this.arrayRows.filter((r) => r !== input);
			this.updateArraySize();
		});
		row.append(removeBtn);

		const addBtn = container.querySelector(".nt-editor-array-add");
		if (addBtn) addBtn.before(row);
		else container.append(row);
		this.arrayRows.push(input);
		if (this.arrayRows.length === 1) {
			setTimeout(() => input.focus(), 0);
		}
	}

	private updateArraySize(): void {
		if (!this.arrayContainer) return;
		this.arrayContainer.style.width = "";
		this.arrayContainer.style.height = "";
	}

	private commitArray(): void {
		if (!this.arrayContainer) return;
		const values = this.arrayRows.map((r) => r.value.trim()).filter((v) => v !== "");
		const row = this.row;
		const col = this.col;
		this.cleanup();
		this.onCommit(row, col, values.join(", "), "none");
	}

	// ── JSON-редактор ──────────────────────────────────────────────────────────

	/** Элементы JSON редактора */
	private jsonTextarea: HTMLTextAreaElement | null = null;
	private jsonError: HTMLDivElement | null = null;

	private startJsonEditor(
		box: { left: number; top: number; width: number; height: number },
		cellValue: unknown,
	): void {
		let text = "";
		try { text = typeof cellValue === "object" && cellValue !== null ? JSON.stringify(cellValue, null, 2) : String(cellValue ?? ""); }
		catch { text = String(cellValue ?? ""); }

		const container = document.createElement("div");
		container.className = "nt-editor nt-editor--json";
		container.style.position = "absolute";
		container.style.left = `${box.left}px`;
		container.style.top = `${box.top}px`;
		container.style.minWidth = `${Math.max(box.width, 400)}px`;
		container.style.zIndex = "10";

		const textarea = document.createElement("textarea");
		textarea.className = "nt-editor-json-textarea";
		textarea.value = text;
		textarea.spellcheck = false;
		textarea.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				this.commitJson();
			}
			if (e.key === "Escape") { e.preventDefault(); this.cancel(); }
		});
		container.append(textarea);

		const error = document.createElement("div");
		error.className = "nt-editor-json-error";
		error.style.display = "none";
		container.append(error);

		const footer = document.createElement("div");
		footer.className = "nt-editor-array-footer";
		container.append(footer);
		const saveBtn = document.createElement("button");
		saveBtn.className = "nt-editor-array-save";
		saveBtn.textContent = "Сохранить";
		saveBtn.addEventListener("mousedown", (e) => { e.preventDefault(); });
		saveBtn.addEventListener("click", () => this.commitJson());
		footer.append(saveBtn);
		const cancelBtn = document.createElement("button");
		cancelBtn.className = "nt-editor-array-cancel";
		cancelBtn.textContent = "Отмена";
		cancelBtn.addEventListener("mousedown", (e) => { e.preventDefault(); });
		cancelBtn.addEventListener("click", () => this.cancel());
		footer.append(cancelBtn);

		this.host.append(container);
		this.activeEl = container;
		this.active = true;
		this.mode = "text";
		this.jsonTextarea = textarea;
		this.jsonError = error;
		container.classList.add("nt-editor--active");
		textarea.focus();

		this.disposeDropdown = onDismiss(() => [container], () => this.commitJson());
	}

	private commitJson(): void {
		if (!this.jsonTextarea) return;
		const raw = this.jsonTextarea.value.trim();
		if (raw === "") {
			const row = this.row;
			const col = this.col;
			this.cleanup();
			this.onCommit(row, col, "", "none");
			return;
		}
		try {
			JSON.parse(raw);
		} catch (e) {
			if (this.jsonError) {
				this.jsonError.textContent = `Ошибка JSON: ${(e as Error).message}`;
				this.jsonError.style.display = "block";
			}
			this.jsonTextarea?.classList.add("nt-editor-json-textarea--error");
			return;
		}
		const row = this.row;
		const col = this.col;
		this.cleanup();
		this.onCommit(row, col, raw, "none");
	}

	// ── Текстовый редактор ────────────────────────────────────────────────────

	/** Текстовый редактор: <textarea> для text/number (весь текст с переносом, авто-рост). */
	private startTextEditor(
		box: { left: number; top: number; width: number; height: number },
		type: string,
		currentValue: string,
		selectAll: boolean,
	): void {
		const textarea = document.createElement("textarea");
		textarea.className = "nt-editor nt-editor--textarea";
		textarea.rows = 1;
		textarea.spellcheck = false;
		if (type === "number") textarea.inputMode = "decimal";
		textarea.value = currentValue;
		textarea.addEventListener("blur", () => { if (this.active) this.commit("none"); });
		textarea.addEventListener("keydown", (e) => this.onKeyDown(e));
		textarea.addEventListener("input", () => this.autoGrowTextarea(textarea, box.height));
		applyBox(textarea, box);
		textarea.style.height = "auto";
		textarea.style.minHeight = `${box.height}px`;

		this.host.append(textarea);
		this.activeEl = textarea;
		this.active = true;
		this.mode = "text";
		textarea.classList.add("nt-editor--active");
		textarea.focus();
		if (selectAll) textarea.select();
		this.autoGrowTextarea(textarea, box.height);
	}

	/** Растянуть textarea по содержимому (не меньше высоты ячейки; +4px компенсация бордеров). */
	private autoGrowTextarea(textarea: HTMLTextAreaElement, minHeight: number): void {
		textarea.style.height = "auto";
		textarea.style.height = `${Math.max(minHeight, textarea.scrollHeight + 4)}px`;
	}

	// ── Date-редактор ─────────────────────────────────────────────────────────

	/** Кастомный календарь даты и текущее значение. */
	private datePicker: DatePickerPopup | null = null;
	private dateValue = "";
	private dateFocusHandler: ((ev: FocusEvent) => void) | null = null;

	/** Date/datetime-редактор: текст, прижатый к верху, + кастомный пикер (с временем при withTime). */
	private startDateEditor(
		box: { left: number; top: number; width: number; height: number },
		currentValue: string,
		colDef?: ColumnDef,
		withTime = false,
	): void {
		const container = document.createElement("div");
		container.className = "nt-editor nt-editor--date";
		container.tabIndex = -1;
		applyBox(container, box);

		const textEl = document.createElement("div");
		textEl.className = "nt-editor-date-text";
		textEl.textContent = formatCellDisplay(currentValue || "", colDef);

		container.append(textEl);

		this.dateValue = currentValue;
		this.datePicker = new DatePickerPopup(this.host);

		const togglePicker = () => {
			if (this.datePicker?.isOpen()) {
				this.datePicker.close();
				return;
			}
			this.datePicker?.open(box, this.dateValue, withTime, (iso) => {
				this.dateValue = iso;
				textEl.textContent = formatCellDisplay(iso, colDef);
				this.commit("none");
			}, () => this.datePicker?.close());
		};

		// Фокус, ушедший из редактора И календаря — завершить редактирование.
		// (селекты времени внутри календаря фокусируются — это не выход)
		this.dateFocusHandler = (ev: FocusEvent) => {
			const t = ev.target as HTMLElement;
			if (this.datePicker?.contains(t)) return;
			if (this.activeEl?.contains(t)) return;
			this.commit("none");
		};
		document.addEventListener("focusin", this.dateFocusHandler);

		textEl.addEventListener("click", () => togglePicker());
		container.addEventListener("keydown", (e) => {
			// Первое Escape закрывает календарь, второе — отменяет редактирование
			if (e.key === "Escape" && this.datePicker?.isOpen()) {
				e.preventDefault();
				e.stopPropagation();
				this.datePicker.close();
				return;
			}
			this.onKeyDown(e);
		});

		this.host.append(container);
		this.activeEl = container;
		this.active = true;
		this.mode = "date";
		container.classList.add("nt-editor--active");
		container.focus();
		togglePicker(); // календарь открывается сразу при входе в редактирование
	}

	// ── Управление ────────────────────────────────────────────────────────────

	isActive(): boolean { return this.active; }

	/** Клик внутри редактора (не должен вызывать commit). */
	isClickInsideEditor(target: HTMLElement): boolean {
		return !!(this.activeEl && this.activeEl.contains(target))
			|| !!(this.dropdownEl && this.dropdownEl.contains(target))
			|| !!(this.arrayContainer && this.arrayContainer.contains(target))
			|| !!(this.jsonTextarea && this.jsonTextarea === target);
	}

	/** Завершить редактирование и сохранить значение. */
	commit(direction: CommitDirection = "none"): void {
		if (!this.active || !this.activeEl) return;
		if (this.mode === "select") {
			this.cancel();
			return;
		}
		if (this.jsonTextarea) {
			this.commitJson();
			return;
		}
		if (this.mode === "date") {
			const row = this.row;
			const col = this.col;
			const value = this.dateValue;
			this.cleanup();
			this.onCommit(row, col, value, direction);
			return;
		}
		if (this.mode === "array") {
			this.commitArray();
			return;
		}
		if (!(this.activeEl instanceof HTMLInputElement) && !(this.activeEl instanceof HTMLTextAreaElement)) {
			this.cancel();
			return;
		}
		const row = this.row;
		const col = this.col;
		const value = this.activeEl.value;
		this.cleanup();
		this.onCommit(row, col, value, direction);
	}

	/** Отменить редактирование без сохранения. */
	cancel(): void {
		if (!this.active) return;
		this.cleanup();
		this.onCancel();
	}

	/** Уничтожить редактор: DOM и подписки, без колбэков наружу. */
	destroy(): void {
		this.cleanup();
	}

	/** Удалить все DOM-элементы редактора и снять все подписки. */
	private cleanup(): void {
		this.active = false;
		this.disposeDropdown?.();
		this.disposeDropdown = null;
		this.arrayRows = [];
		this.arrayContainer = null;
		this.jsonTextarea = null;
		this.jsonError = null;
		if (this.dateFocusHandler) {
			document.removeEventListener("focusin", this.dateFocusHandler);
			this.dateFocusHandler = null;
		}
		this.datePicker?.destroy();
		this.datePicker = null;
		this.dateValue = "";
		if (this.activeEl) {
			this.activeEl.classList.remove("nt-editor--active");
			this.activeEl.remove();
			this.activeEl = null;
		}
		if (this.dropdownEl) {
			this.dropdownEl.remove();
			this.dropdownEl = null;
		}
	}

	// ── Клавиатура внутри редактора ──────────────────────────────────────────

	/** Обработка клавиш внутри редактора. Enter/Tab — commit, Escape — cancel, Alt+Enter — перенос. */
	private onKeyDown(e: KeyboardEvent): void {
		if (e.key === "Enter") {
			if (e.altKey && this.activeEl instanceof HTMLTextAreaElement) return; // Alt+Enter — новая строка
			e.preventDefault(); e.stopPropagation(); this.commit("enter");
		}
		else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.cancel(); }
		else if (e.key === "Tab") { e.preventDefault(); e.stopPropagation(); this.commit(e.shiftKey ? "shift-tab" : "tab"); }
	}
}

/** Применить абсолютное позиционирование и размеры к элементу. */
function applyBox(el: HTMLElement, box: { left: number; top: number; width: number; height: number }): void {
	el.style.position = "absolute";
	el.style.left = `${box.left}px`;
	el.style.top = `${box.top}px`;
	el.style.width = `${box.width}px`;
	el.style.height = `${box.height}px`;
	el.style.zIndex = "10";
	el.style.boxSizing = "border-box";
}
