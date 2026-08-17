// ── Попап сортировки и фильтрации колонки ────────────────────────────────────
//
// Открывается по кнопке-воронке в заголовке колонки. Состоит из:
//   - блока сортировки (радиокнопки asc/desc/none)
//   - выбора типа фильтра (вылетающее подменю)
//   - блока «по значениям» (чекбоксы + поиск) либо блока условия
//     * multi-value (eq/neq/mask) — чекбоксы + инпут добавления
//     * single (gt/gte/lt/lte) — одиночный инпут
//     * between — два инпута
//   - кнопок Применить / Сбросить
//
// Попап не знает про модель: всё состояние приходит и уходит через deps.

import { formatCellDisplay } from "../utils/column-utils";
import type { ColumnDef, ColumnFilter, FilterOp, SortDirection, SortFilterState } from "../utils/types";
import { escapeHtml, onDismiss, positionInViewport, stopEventPropagation } from "./popup-utils";

export interface SortFilterPopupDeps {
	getColumn(col: number): ColumnDef | undefined;
	getSort(col: number): SortDirection;
	getFilter(col: number): ColumnFilter | undefined;
	getUniqueValues(col: number): string[];
	onApply(col: number, state: SortFilterState): void;
	onClear(col: number): void;
}

const CHEVRON_RIGHT =
	'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

const FLYOUT_HIDE_DELAY = 250;
let instanceCounter = 0;

type FilterOpItem = { value: FilterOp; label: string } | { label: string; children: { value: FilterOp; label: string }[] };

function isFilterGroup(it: FilterOpItem): it is { label: string; children: { value: FilterOp; label: string }[] } {
	return "children" in it;
}

function filterOpsFor(type: string): FilterOpItem[] {
	const ops: FilterOpItem[] = [{ value: "values", label: "По значениям" }];
	if (type !== "boolean") {
		ops.push({ value: "eq", label: "Равно" }, { value: "neq", label: "Не равно" });
	}
	if (type === "number" || type === "date" || type === "datetime") {
		ops.push(
			{ value: "gt", label: "Больше" },
			{ value: "gte", label: "Больше или равно" },
			{ value: "lt", label: "Меньше" },
			{ value: "lte", label: "Меньше или равно" },
			{ value: "between", label: "Между" },
		);
	}
	if (type === "text" || type === "select") {
		ops.push(
			{ label: "Маска", children: [
				{ value: "mask", label: "Равно" },
				{ value: "nmask", label: "Не равно" },
			]},
			{ label: "Маска (без учета регистра)", children: [
				{ value: "imask", label: "Равно" },
				{ value: "nimask", label: "Не равно" },
			]},
		);
	}
	return ops;
}

/** Название операции для отображения в меню и в лейбле. */
function getOpLabel(op: FilterOp, type: string): string {
	for (const it of filterOpsFor(type)) {
		if (isFilterGroup(it)) {
			for (const c of it.children) {
				if (c.value === op) return `${it.label} — ${c.label}`;
			}
		} else if (it.value === op) {
			return it.label;
		}
	}
	return op;
}

/** Операции, поддерживающие несколько значений (OR-логика). */
function isMultiValue(op: FilterOp): boolean {
	return op === "eq" || op === "neq" || op === "mask" || op === "nmask" || op === "imask" || op === "nimask";
}

export class SortFilterPopup {
	private el: HTMLDivElement;
	private uid = `nt-sf-${++instanceCounter}`;
	private maskTooltip: HTMLDivElement | null = null;

	private flyout: HTMLDivElement | null = null;
	private flyoutHideTimer: number | null = null;

	private disposeDismiss: (() => void) | null = null;
	private currentCol = -1;
	private _theme: "light" | "dark";
	private _colType = "text";

	constructor(private deps: SortFilterPopupDeps, theme?: "light" | "dark") {
		this._theme = theme ?? "light";
		this.el = document.createElement("div");
		this.el.className = `nt-sort-filter-popup${theme === "dark" ? " nt-dark" : ""}`;
		this.el.style.display = "none";
		stopEventPropagation(this.el);
		this.el.addEventListener("mouseover", (ev) => {
			if ((ev.target as HTMLElement).closest(".nt-sf-filter-menu-item")) this.cancelFlyoutHide();
		});
		document.body.append(this.el);
	}

	/** Обновить тему уже созданного попапа (flyout/тултип пересоздаются при open с актуальной темой). */
	setTheme(theme: "light" | "dark"): void {
		this._theme = theme;
		this.el.classList.toggle("nt-dark", theme === "dark");
	}

	// ── Открытие ──────────────────────────────────────────────────────────────

	open(col: number, clientX: number, clientY: number): void {
		this.close();
		this.currentCol = col;

		const colDef = this.deps.getColumn(col);
		const type = colDef?.type ?? "text";
		this._colType = type;
		const sortDir = this.deps.getSort(col);
		const currentFilter = this.deps.getFilter(col);
		const uniqueValues = this.deps.getUniqueValues(col);
		const curOp: FilterOp = currentFilter?.op ?? "values";

		const formattedValues = uniqueValues.map((v) => ({
			raw: v,
			label: formatCellDisplay(v, colDef),
			checked: !currentFilter || currentFilter.op !== "values" || !currentFilter.values || currentFilter.values.has(v),
		}));

		// Для nullable boolean добавляем «Не определено»
		if (colDef?.type === "boolean" && colDef.nullable) {
			formattedValues.unshift({
				raw: "__null__",
				label: "Не определено",
				checked: !currentFilter || currentFilter.op !== "values" || !currentFilter.values || currentFilter.values.has("__null__"),
			});
		}

		this.el.innerHTML = this.template({
			title: colDef?.label ?? `Колонка ${col + 1}`,
			sortDir,
			curOp,
			type,
			values: formattedValues,
			currentFilter,
			uniqueCount: uniqueValues.length,
		});

		this.bindFilterTypeMenu(filterOpsFor(type), curOp);
		this.bindValuesBlock();
		this.populateMultiCheckboxes(currentFilter);
		this.applyOpToBlocks(curOp);
		this.bindButtons(col, colDef, uniqueValues.length);
		this.updateApplyState();
		this.updateSelectAllState();
		this.updateMenuLabel(curOp, type);

		this.el.style.visibility = "hidden";
		this.el.style.display = "block";
		positionInViewport(this.el, clientX, clientY);
		this.el.style.visibility = "visible";

		this.disposeDismiss = onDismiss(() => [this.el, this.flyout], () => this.close());
	}

	close(): void {
		this.disposeDismiss?.();
		this.disposeDismiss = null;
		this.closeFlyout();
		this.hideMaskTooltip();
		this.el.style.display = "none";
		this.currentCol = -1;
	}

	destroy(): void {
		this.close();
		this.el.remove();
	}

	isOpenFor(col: number): boolean {
		return this.currentCol === col;
	}

	// ── Разметка ──────────────────────────────────────────────────────────────

	private template(m: {
		title: string;
		sortDir: SortDirection;
		curOp: FilterOp;
		type: string;
		values: Array<{ raw: string; label: string; checked: boolean }>;
		currentFilter: ColumnFilter | undefined;
		uniqueCount: number;
	}): string {
		const radio = (value: SortDirection, label: string) =>
			`<label class="nt-sf-radio"><input type="radio" name="${this.uid}-sort" value="${value}"${
				m.sortDir === value ? " checked" : ""
			}> ${label}</label>`;

		const multiBlock = `
			<div class="nt-sf-custom-block nt-sf-custom-block--multi" style="display:none">
				<div class="nt-sf-add-row">
					<input class="nt-sf-add-input" placeholder="Добавить значение...">
					<button class="nt-sf-add-btn">+</button>
				</div>
				<div class="nt-sf-custom-values"></div>
			</div>`;

		// Блок single/between
		const isMaskOp = m.curOp === "mask" || m.curOp === "nmask" || m.curOp === "imask" || m.curOp === "nimask";
		const opLabel = getOpLabel(m.curOp, m.type);
		const inputType = !isMaskOp && m.type === "date" ? "date"
			: !isMaskOp && m.type === "datetime" ? "datetime-local"
			: "text";
		const singleBlock = `
			<div class="nt-sf-custom-block nt-sf-custom-block--single" style="display:none;padding:4px 16px">
				<input class="nt-sf-input nt-sf-value" value="${escapeHtml(m.currentFilter?.value ?? "")}" placeholder="Значение" type="${inputType}">
				<input class="nt-sf-input nt-sf-value2" value="${escapeHtml(m.currentFilter?.value2 ?? "")}" placeholder="До" type="${inputType}" style="display:none">
			</div>`;

		// Блок «По значениям»
		const allChecked = !m.currentFilter || m.currentFilter.op !== "values";
		const valuesBlock = `
			<div class="nt-sf-values-block" style="display:${m.curOp === "values" ? "block" : "none"}">
				<input class="nt-sf-search" placeholder="Поиск..." value="">
				<div class="nt-sf-add-row">
					<input class="nt-sf-add-input" placeholder="Добавить значение...">
					<button class="nt-sf-add-btn">+</button>
				</div>
				<label class="nt-sf-radio"><input type="checkbox" class="nt-sf-select-all"${allChecked ? " checked" : ""}> <span class="nt-sf-select-all-label">(Выбрать всё)</span></label>
				${m.values
					.map((v) =>
						`<label class="nt-sf-radio nt-sf-value-row" title="${escapeHtml(v.label)}"><input type="checkbox" value="${escapeHtml(v.raw)}"${
							v.checked ? " checked" : ""
						}><span class="nt-sf-value-label">${escapeHtml(v.label)}</span></label>`,
					)
					.join("")}
				<div class="nt-sf-warn" style="display:none">Выберите хотя бы одно значение</div>
			</div>`;

		return `
			<div class="nt-sf-title">${escapeHtml(m.title)}</div>
			<div class="nt-sf-section">Сортировка</div>
			${radio("asc", "По возрастанию")}
			${radio("desc", "По убыванию")}
			${radio("none", "Нет")}
			<div class="nt-sf-sep"></div>
			<div class="nt-sf-section">Фильтр</div>
			<div class="nt-sf-filter-menu-item" data-op="${m.curOp}">Тип фильтра<span class="nt-sf-op-arrow">${CHEVRON_RIGHT}</span></div>
			<div class="nt-sf-filter-text">${escapeHtml(opLabel)} <span class="nt-sf-mask-help" style="display:none">?</span></div>
			${valuesBlock}
			${multiBlock}
			${singleBlock}
			<div class="nt-sf-buttons">
				<button class="nt-sf-btn nt-sf-btn--apply">Применить</button>
				<button class="nt-sf-btn nt-sf-btn--clear">Сбросить</button>
			</div>
		`;
	}

	// ── Поиск элементов ───────────────────────────────────────────────────────

	private q<T extends HTMLElement>(selector: string): T | null {
		return this.el.querySelector<T>(selector);
	}

	/** Чекбоксы только в блоке «По значениям» (не в custom-values). */
	private valueCheckboxes(): HTMLInputElement[] {
		const block = this.q(".nt-sf-values-block");
		if (!block) return [];
		return Array.from(block.querySelectorAll<HTMLInputElement>("input[type='checkbox']:not(.nt-sf-select-all)"));
	}

	/** Видимые чекбоксы в блоке «По значениям» (не скрытые поиском). */
	private visibleCheckboxes(): HTMLInputElement[] {
		return this.valueCheckboxes().filter((cb) => {
			const row = cb.closest(".nt-sf-value-row") as HTMLElement | null;
			return !row || row.style.display !== "none";
		});
	}

	/** Чекбоксы в multi-value блоке. */
	private multiCheckboxes(): HTMLInputElement[] {
		const block = this.q(".nt-sf-custom-values");
		if (!block) return [];
		return Array.from(block.querySelectorAll<HTMLInputElement>("input[type='checkbox']"));
	}

	private currentOp(): FilterOp {
		return (this.q(".nt-sf-filter-menu-item")?.dataset.op as FilterOp) ?? "values";
	}

	/** Обновить текст в меню после выбора нового типа. */
	private updateMenuLabel(op: FilterOp, type: string): void {
		const lbl = this.q<HTMLElement>(".nt-sf-filter-text");
		if (!lbl) return;
		const text = getOpLabel(op, type);
		const first = lbl.firstChild;
		if (first?.nodeType === Node.TEXT_NODE) {
			if (first.nodeValue !== text + " ") first.nodeValue = text + " ";
		} else {
			lbl.prepend(document.createTextNode(text + " "));
		}
	}

	// ── Подменю выбора типа фильтра ───────────────────────────────────────────

	private bindFilterTypeMenu(ops: FilterOpItem[], initialOp: FilterOp): void {
		const menuItem = this.q<HTMLElement>(".nt-sf-filter-menu-item");
		if (!menuItem) return;
		menuItem.dataset.op = initialOp;

		const show = () => this.openFlyout(menuItem, ops);
		menuItem.addEventListener("mouseenter", show);
		menuItem.addEventListener("click", show);
		menuItem.addEventListener("mouseleave", () => this.scheduleFlyoutHide(menuItem));
	}

	private openFlyout(menuItem: HTMLElement, ops: FilterOpItem[]): void {
		this.cancelFlyoutHide();
		this.closeFlyout();

		const popup = document.createElement("div");
		popup.className = `nt-sf-child-popup${this._theme === "dark" ? " nt-dark" : ""}`;
		popup.addEventListener("mouseenter", () => this.cancelFlyoutHide());
		popup.addEventListener("mouseleave", () => this.scheduleFlyoutHide(menuItem));

		const selected = menuItem.dataset.op ?? "values";

		const makeItem = (value: FilterOp, label: string) => {
			const item = document.createElement("div");
			item.className = `nt-select-dropdown-item${value === selected ? " nt-select-dropdown-item--selected" : ""}`;
			item.textContent = label;
			item.addEventListener("mousedown", (ev) => { ev.preventDefault(); ev.stopPropagation(); });
			item.addEventListener("click", (ev) => {
				ev.stopPropagation();
				menuItem.dataset.op = value;
				this.applyOpToBlocks(value);
				this.updateMenuLabel(value, this._colType);
				this.closeFlyout();
				this.updateApplyState();
			});
			return item;
		};

		for (const op of ops) {
			if (isFilterGroup(op)) {
				const groupLabel = document.createElement("div");
				groupLabel.className = "nt-sf-filter-group";
				groupLabel.textContent = op.label;
				popup.append(groupLabel);
				for (const child of op.children) {
					popup.append(makeItem(child.value, child.label));
				}
			} else {
				popup.append(makeItem(op.value, op.label));
			}
		}

		document.body.append(popup);
		this.flyout = popup;

		const parentRect = this.el.getBoundingClientRect();
		const itemRect = menuItem.getBoundingClientRect();
		const popupW = popup.offsetWidth || 180;
		const fitsRight = window.innerWidth - parentRect.right >= popupW + 4;
		popup.style.left = `${fitsRight ? parentRect.right + 4 : parentRect.left - popupW - 4}px`;
		popup.style.top = `${itemRect.top}px`;
	}

	private applyOpToBlocks(op: FilterOp): void {
		const valuesBlock = this.q<HTMLElement>(".nt-sf-values-block");
		const multiBlock = this.q<HTMLElement>(".nt-sf-custom-block--multi");
		const singleBlock = this.q<HTMLElement>(".nt-sf-custom-block--single");

		if (valuesBlock) valuesBlock.style.display = op === "values" ? "block" : "none";

		const multi = isMultiValue(op);
		if (multiBlock) multiBlock.style.display = (op !== "values" && multi) ? "block" : "none";
		if (singleBlock) {
			singleBlock.style.display = (op !== "values" && !multi) ? "block" : "none";
			const value2 = singleBlock.querySelector<HTMLElement>(".nt-sf-value2");
			if (value2) value2.style.display = op === "between" ? "block" : "none";
		}

		// При смене типа сбрасываем кастомные значения
		const customValues = this.q(".nt-sf-custom-values");
		if (customValues) customValues.innerHTML = "";
		for (const el of Array.from(this.el.querySelectorAll(".nt-sf-value-row--custom"))) {
			el.remove();
		}

		// Показать/скрыть иконку подсказки маски
		const maskHelpIcon = this.q<HTMLElement>(".nt-sf-mask-help");
		if (maskHelpIcon) {
			maskHelpIcon.style.display = (op === "mask" || op === "nmask" || op === "imask" || op === "nimask") ? "" : "none";
		}
	}

	// ── Тултип для маски ────────────────────────────────────────────────────

	private showMaskTooltip(anchor: HTMLElement): void {
		this.hideMaskTooltip();
		const tip = document.createElement("div");
		tip.className = `nt-sf-mask-tooltip${this._theme === "dark" ? " nt-dark" : ""}`;
		tip.innerHTML = `
			<div class="nt-sf-mask-tip-title">Как пользоваться маской:</div>
			<ul class="nt-sf-mask-tip-list">
				<li>_ — один любой символ</li>
				<li>% — любое количество любых символов</li>
				<li>| — выбор одного из вариантов</li>
				<li>(...) — группировка вариантов</li>
			</ul>
			<div class="nt-sf-mask-tip-title">Примеры:</div>
			<ul class="nt-sf-mask-tip-list">
				<li>Москва% — начинается с Москва</li>
				<li>%(Москва|СПб)% — найти Москва или СПб</li>
				<li>___ — 3 любых символа</li>
			</ul>`;
		const rect = anchor.getBoundingClientRect();
		tip.style.left = `${rect.right + 4}px`;
		tip.style.top = `${rect.top}px`;
		document.body.append(tip);
		this.maskTooltip = tip;
	}

	private hideMaskTooltip(): void {
		if (this.maskTooltip) { this.maskTooltip.remove(); this.maskTooltip = null; }
	}

	// ── Блок «по значениям» + Multi-value ─────────────────────────────────────

	/** Заполнить чекбоксы в multi-value блоке из currentFilter.values. */
	private populateMultiCheckboxes(currentFilter: ColumnFilter | undefined): void {
		const container = this.q(".nt-sf-custom-values");
		if (!container || !currentFilter?.values) return;
		for (const val of currentFilter.values) {
			this.addMultiCheckbox(container, val, true);
		}
	}

	/** Добавить чекбокс в multi-value контейнер (в начало списка). */
	private addMultiCheckbox(container: HTMLElement, raw: string, checked: boolean): void {
		const label = document.createElement("label");
		label.className = "nt-sf-radio nt-sf-value-row nt-sf-value-row--custom";
		label.title = raw;
		label.innerHTML = `<input type="checkbox" value="${escapeHtml(raw)}"${checked ? " checked" : ""}><span class="nt-sf-value-label">${escapeHtml(raw)}</span>`;
		const cb = label.querySelector<HTMLInputElement>("input");
		cb?.addEventListener("change", () => this.updateApplyState());
		container.prepend(label);
	}

	private bindValuesBlock(): void {
		// «Выбрать всё» (в блоке «По значениям»)
		const selectAll = this.q<HTMLInputElement>(".nt-sf-select-all");
		if (selectAll) {
			selectAll.addEventListener("change", () => {
				for (const cb of this.valueCheckboxes()) {
					const row = cb.closest(".nt-sf-value-row") as HTMLElement | null;
					if (!row || row.style.display !== "none") cb.checked = selectAll.checked;
				}
				this.updateApplyState();
				this.updateSelectAllState();
			});
		}
		// Все чекбоксы в «По значениям»
		for (const cb of this.valueCheckboxes()) {
			cb.addEventListener("change", () => {
				this.updateApplyState();
				this.updateSelectAllState();
			});
		}

		// Поиск в «По значениям»
		const search = this.q<HTMLInputElement>(".nt-sf-search");
		search?.addEventListener("input", () => {
			const query = search.value.trim().toLowerCase();
			for (const row of Array.from(this.el.querySelectorAll<HTMLElement>(".nt-sf-values-block .nt-sf-value-row"))) {
				const text = (row.textContent ?? "").toLowerCase();
				row.style.display = query === "" || text.includes(query) ? "" : "none";
			}
			const labelSpan = this.q<HTMLElement>(".nt-sf-select-all-label");
			if (labelSpan) labelSpan.textContent = query === "" ? "(Выбрать всё)" : "(Выбрать все результаты поиска)";
		});

		// Инпуты в single/between блоке
		for (const selector of [".nt-sf-value", ".nt-sf-value2"]) {
			this.q<HTMLInputElement>(selector)?.addEventListener("input", () => this.updateApplyState());
		}

		// Тултип для mask-help иконки
		const maskHelpIcon = this.q<HTMLElement>(".nt-sf-mask-help");
		if (maskHelpIcon) {
			maskHelpIcon.addEventListener("mouseenter", () => this.showMaskTooltip(maskHelpIcon));
			maskHelpIcon.addEventListener("mouseleave", () => this.hideMaskTooltip());
		}

		// Кнопка «Добавить» — для values-блока
		this.bindAddRow(".nt-sf-values-block", (raw) => {
			const selectAllRow = this.q(".nt-sf-select-all")?.closest(".nt-sf-radio");
			const label = document.createElement("label");
			label.className = "nt-sf-radio nt-sf-value-row nt-sf-value-row--custom";
			label.title = raw;
			label.innerHTML = `<input type="checkbox" value="${escapeHtml(raw)}" checked><span class="nt-sf-value-label">${escapeHtml(raw)}</span>`;
			const cb = label.querySelector<HTMLInputElement>("input");
			cb?.addEventListener("change", () => { this.updateApplyState(); this.updateSelectAllState(); });
			if (selectAllRow) selectAllRow.after(label);
			this.updateSelectAllState();
		});

		// Кнопка «Добавить» — для multi-value блока
		this.bindAddRow(".nt-sf-custom-block--multi", (raw) => {
			const container = this.q(".nt-sf-custom-values");
			if (container) this.addMultiCheckbox(container, raw, true);
		});
	}

	/** Привязать логику к строке добавления в указанном блоке. */
	private bindAddRow(blockSelector: string, onAdd: (raw: string) => void): void {
		const addInput = this.el.querySelector<HTMLInputElement>(`${blockSelector} .nt-sf-add-input`);
		const addBtn = this.el.querySelector<HTMLButtonElement>(`${blockSelector} .nt-sf-add-btn`);
		if (!addBtn || !addInput) return;

		const doAdd = () => {
			const raw = addInput.value.trim();
			if (!raw) return;
			// Проверяем, нет ли уже такого значения
			const allBoxes = [
				...Array.from(this.el.querySelectorAll<HTMLInputElement>(`${blockSelector} input[type='checkbox']`)),
			];
			if (allBoxes.some((cb) => cb.value === raw)) return;
			onAdd(raw);
			addInput.value = "";
			this.updateApplyState();
		};
		addBtn.addEventListener("click", doAdd);
		addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doAdd(); } });
	}

	// ── Кнопка Применить ──────────────────────────────────────────────────────

	private updateApplyState(): void {
		const op = this.currentOp();
		let ok = false;

		if (op === "values") {
			ok = this.visibleCheckboxes().some((cb) => cb.checked);
		} else if (isMultiValue(op)) {
			ok = this.multiCheckboxes().some((cb) => cb.checked);
		} else {
			ok = (this.q<HTMLInputElement>(".nt-sf-value")?.value ?? "").trim().length > 0;
		}

		const warn = this.q<HTMLElement>(".nt-sf-warn");
		if (warn) warn.style.display = op === "values" && !ok ? "block" : "none";

		const apply = this.q<HTMLButtonElement>(".nt-sf-btn--apply");
		if (apply) {
			apply.disabled = !ok;
			apply.style.opacity = ok ? "1" : "0.5";
		}
	}

	/** Три состояния Select All: ✓ (все), ▣ (часть), ☐ (ничего). */
	private updateSelectAllState(): void {
		const selectAll = this.q<HTMLInputElement>(".nt-sf-select-all");
		if (!selectAll) return;
		const all = this.visibleCheckboxes();
		const checkedCount = all.filter((cb) => cb.checked).length;
		if (checkedCount === 0) {
			selectAll.checked = false;
			selectAll.indeterminate = false;
		} else if (checkedCount === all.length) {
			selectAll.checked = true;
			selectAll.indeterminate = false;
		} else {
			selectAll.checked = false;
			selectAll.indeterminate = true;
		}
	}

	// ── Кнопки ────────────────────────────────────────────────────────────────

	private bindButtons(col: number, colDef: ColumnDef | undefined, uniqueCount: number): void {
		const apply = this.q<HTMLButtonElement>(".nt-sf-btn--apply");
		apply?.addEventListener("mousedown", (ev) => ev.preventDefault());
		apply?.addEventListener("click", () => {
			const state = this.collectState(colDef, uniqueCount);
			if (!state) return;
			this.close();
			this.deps.onApply(col, state);
		});

		const clear = this.q<HTMLButtonElement>(".nt-sf-btn--clear");
		clear?.addEventListener("mousedown", (ev) => ev.preventDefault());
		clear?.addEventListener("click", () => {
			this.close();
			this.deps.onClear(col);
		});
	}

	private collectState(colDef: ColumnDef | undefined, uniqueCount: number): SortFilterState | null {
		const sort =
			(this.q<HTMLInputElement>(`input[name="${this.uid}-sort"]:checked`)?.value as SortDirection) ?? "none";
		const op = this.currentOp();
		const currentFilter = this.deps.getFilter(this.currentCol);

		if (op === "values") {
			const checked = currentFilter?.values ? new Set(currentFilter.values) : new Set<string>();
			for (const cb of this.visibleCheckboxes()) {
				if (cb.checked) checked.add(cb.value);
				else checked.delete(cb.value);
			}
			if (checked.size === 0) return null;
			return { sort, filter: checked.size < uniqueCount ? { op: "values", values: checked } : null };
		}

		if (isMultiValue(op)) {
			const checked = new Set<string>();
			for (const cb of this.multiCheckboxes()) {
				if (cb.checked) checked.add(cb.value);
			}
			if (checked.size === 0) return null;
			return { sort, filter: { op, values: checked } };
		}

		const value = this.q<HTMLInputElement>(".nt-sf-value")?.value ?? "";
		const value2 = this.q<HTMLInputElement>(".nt-sf-value2")?.value ?? "";
		if (!value.trim()) return null;

		const toRaw = (v: string) =>
			colDef?.type === "select"
				? String(colDef.options?.find((o) => o.label === v)?.value ?? v)
				: v;

		return {
			sort,
			filter: {
				op,
				value: toRaw(value),
				value2: value2 ? toRaw(value2) : undefined,
			},
		};
	}

	// ── Flyout ───────────────────────────────────────────────────────────────

	private scheduleFlyoutHide(menuItem: HTMLElement): void {
		this.cancelFlyoutHide();
		this.flyoutHideTimer = window.setTimeout(() => {
			this.flyoutHideTimer = null;
			if (this.flyout?.matches(":hover") || menuItem.matches(":hover")) return;
			this.closeFlyout();
		}, FLYOUT_HIDE_DELAY);
	}

	private cancelFlyoutHide(): void {
		if (this.flyoutHideTimer !== null) {
			clearTimeout(this.flyoutHideTimer);
			this.flyoutHideTimer = null;
		}
	}

	private closeFlyout(): void {
		this.cancelFlyoutHide();
		this.flyout?.remove();
		this.flyout = null;
	}
}
