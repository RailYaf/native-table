// ── Редактор ячейки ──────────────────────────────────────────────────────────
//
// Два режима в зависимости от типа колонки:
//   1. text/number/date: <input> поверх ячейки
//   2. select: прозрачный триггер + выпадающий список опций (position: absolute)
//
// CommitDirection управляет тем, куда перейти после завершения редактирования.
// Все элементы уничтожаются после commit/cancel.

import { getEditValue, isBoolean } from "../utils/column-utils";
import type { SheetModel } from "../core/model";
import type { SheetView } from "../core/sheet-view";
import type { Cell, ColumnDef } from "../utils/types";

export type CommitDirection = "enter" | "tab" | "shift-tab" | "none";

export class Editor {
	/** Активный элемент ввода: <input> или <div>-триггер для select */
	private activeEl: HTMLInputElement | HTMLDivElement | null = null;

	/** Дропдаун для типа select */
	private dropdownEl: HTMLDivElement | null = null;

	/** Редактор активен? */
	private active = false;

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
	 * @param selectAll — выделить всё содержимое в инпуте (false при вводе нового символа)
	 */
	start(row: number, col: number, colDef?: ColumnDef, initial = "", selectAll = true): void {
		if (isBoolean(colDef)) return; // boolean редактируется кликом (переключение)
		if (this.active && this.row === row && this.col === col) return;
		if (this.active) this.commit("none");

		this.row = row;
		this.col = col;

		const cell = this.getCell(row, col);
		const box = this.getCellBox(row, col);
		const currentValue = initial || getEditValue(cell.value ?? null, colDef);

		const type = colDef?.type ?? "text";

		if (type === "select" && colDef?.options?.length) {
			this.startSelectEditor(box, colDef, currentValue);
		} else {
			this.startTextEditor(box, type, currentValue, selectAll);
		}
	}

	// ── Select-редактор ───────────────────────────────────────────────────────

	/** Select-редактор: прозрачный триггер поверх ячейки + дропдаун снизу. */
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
		dropdown.style.top = `${box.top + box.height}px`;
		dropdown.style.minWidth = `${box.width}px`;
		dropdown.style.zIndex = "100";

		// Пустой пункт
		const emptyItem = document.createElement("div");
		emptyItem.className = "nt-select-dropdown-item";
		emptyItem.textContent = "—";
		emptyItem.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
		emptyItem.addEventListener("click", () => { this.commitSelect(""); });
		dropdown.append(emptyItem);

		for (const opt of colDef.options ?? []) {
			const item = document.createElement("div");
			item.className = "nt-select-dropdown-item";
			item.textContent = opt.label;
			item.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
			item.addEventListener("click", () => { this.commitSelect(String(opt.value)); });
			if (String(opt.value) === currentValue) item.classList.add("nt-select-dropdown-item--selected");
			dropdown.append(item);
		}

		this.host.append(dropdown);
		this.dropdownEl = dropdown;
		this.active = true;
		this.activeEl.classList.add("nt-editor--active");

		// Закрыть по клику вне дропдауна
		const close = (ev: MouseEvent) => {
			if (dropdown.contains(ev.target as Node) || trigger.contains(ev.target as Node)) return;
			this.cancel();
			document.removeEventListener("mousedown", close, true);
		};
		setTimeout(() => document.addEventListener("mousedown", close, true), 0);
	}

	/** Подтвердить выбор в select-редакторе. */
	private commitSelect(value: string): void {
		const row = this.row;
		const col = this.col;
		this.cleanup();
		this.onCommit(row, col, value, "none");
	}

	// ── Текстовый редактор ────────────────────────────────────────────────────

	/** Текстовый редактор: <input> с type=text/number/date. */
	private startTextEditor(
		box: { left: number; top: number; width: number; height: number },
		type: string,
		currentValue: string,
		selectAll: boolean,
	): void {
		const input = document.createElement("input");
		input.className = "nt-editor";
		input.spellcheck = false;
		if (type === "date") input.type = "date";
		else if (type === "number") { input.type = "text"; input.inputMode = "decimal"; }
		else input.type = "text";
		input.value = currentValue;
		if (type === "date") {
			let dateIconClicked = false;
			input.addEventListener("pointerdown", () => {
				dateIconClicked = true;
				setTimeout(() => { dateIconClicked = false; }, 300);
			});
			input.addEventListener("blur", () => {
				if (!this.active) return;
				if (dateIconClicked) return;
				this.commit("none");
			});
		} else {
			input.addEventListener("blur", () => { if (this.active) this.commit("none"); });
		}
		input.addEventListener("keydown", (e) => this.onKeyDown(e));
		applyBox(input, box);

		this.host.append(input);
		this.activeEl = input;
		this.active = true;
		input.classList.add("nt-editor--active");
		input.focus();
		if (selectAll) input.select();
	}

	// ── Управление ────────────────────────────────────────────────────────────

	isActive(): boolean { return this.active; }

	/** Завершить редактирование и сохранить значение. */
	commit(direction: CommitDirection = "none"): void {
		if (!this.active || !this.activeEl) return;
		const row = this.row;
		const col = this.col;
		const value = this.activeEl instanceof HTMLInputElement ? this.activeEl.value : "";
		this.cleanup();
		this.onCommit(row, col, value, direction);
	}

	/** Отменить редактирование без сохранения. */
	cancel(): void {
		this.cleanup();
		this.onCancel();
	}

	/** Удалить все DOM-элементы редактора. */
	private cleanup(): void {
		this.active = false;
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

	/** Обработка клавиш внутри <input>. Enter/Tab — commit, Escape — cancel. */
	private onKeyDown(e: KeyboardEvent): void {
		if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); this.commit("enter"); }
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
