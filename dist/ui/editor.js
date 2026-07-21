// ── Редактор ячейки ──────────────────────────────────────────────────────────
//
// Два режима в зависимости от типа колонки:
//   1. text/number/date: <input> поверх ячейки
//   2. select: прозрачный триггер + выпадающий список опций (position: absolute)
//
// CommitDirection управляет тем, куда перейти после завершения редактирования.
// Все элементы уничтожаются после commit/cancel.
import { getEditValue, isBoolean } from "../utils/column-utils";
export class Editor {
    constructor(host, // контейнер, куда вставляются элементы редактора
    model, 
    /** Позиция и размер ячейки в пикселях */
    getCellBox, 
    /** Вызывается при commit — передаёт строковое значение и направление */
    onCommit, onCancel) {
        this.host = host;
        this.getCellBox = getCellBox;
        this.onCommit = onCommit;
        this.onCancel = onCancel;
        /** Активный элемент ввода: <input> или <div>-триггер для select */
        this.activeEl = null;
        /** Дропдаун для типа select */
        this.dropdownEl = null;
        /** Редактор активен? */
        this.active = false;
        this.row = -1;
        this.col = -1;
        this.view = null;
        this.model = model;
    }
    setModel(model) { this.model = model; }
    setView(view) { this.view = view; }
    /** Получить ячейку через view (если активна фильтрация) или напрямую из model. */
    getCell(displayRow, col) {
        if (this.view)
            return this.view.get(displayRow, col);
        return this.model.get(displayRow, col);
    }
    /**
     * Начать редактирование ячейки.
     * @param selectAll — выделить всё содержимое в инпуте (false при вводе нового символа)
     */
    start(row, col, colDef, initial = "", selectAll = true) {
        if (isBoolean(colDef))
            return; // boolean редактируется кликом (переключение)
        if (this.active && this.row === row && this.col === col)
            return;
        if (this.active)
            this.commit("none");
        this.row = row;
        this.col = col;
        const cell = this.getCell(row, col);
        const box = this.getCellBox(row, col);
        const currentValue = initial || getEditValue(cell.value ?? null, colDef);
        const type = colDef?.type ?? "text";
        if (type === "select" && colDef?.options?.length) {
            this.startSelectEditor(box, colDef, currentValue);
        }
        else {
            this.startTextEditor(box, type, currentValue, selectAll);
        }
    }
    // ── Select-редактор ───────────────────────────────────────────────────────
    /** Select-редактор: прозрачный триггер поверх ячейки + дропдаун снизу. */
    startSelectEditor(box, colDef, currentValue) {
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
            if (String(opt.value) === currentValue)
                item.classList.add("nt-select-dropdown-item--selected");
            dropdown.append(item);
        }
        this.host.append(dropdown);
        this.dropdownEl = dropdown;
        this.active = true;
        this.activeEl.classList.add("nt-editor--active");
        // Закрыть по клику вне дропдауна
        const close = (ev) => {
            if (dropdown.contains(ev.target) || trigger.contains(ev.target))
                return;
            this.cancel();
            document.removeEventListener("mousedown", close, true);
        };
        setTimeout(() => document.addEventListener("mousedown", close, true), 0);
    }
    /** Подтвердить выбор в select-редакторе. */
    commitSelect(value) {
        const row = this.row;
        const col = this.col;
        this.cleanup();
        this.onCommit(row, col, value, "none");
    }
    // ── Текстовый редактор ────────────────────────────────────────────────────
    /** Текстовый редактор: <input> с type=text/number/date. */
    startTextEditor(box, type, currentValue, selectAll) {
        const input = document.createElement("input");
        input.className = "nt-editor";
        input.spellcheck = false;
        if (type === "date")
            input.type = "date";
        else if (type === "number") {
            input.type = "text";
            input.inputMode = "decimal";
        }
        else
            input.type = "text";
        input.value = currentValue;
        input.addEventListener("blur", () => { if (this.active)
            this.commit("none"); });
        input.addEventListener("keydown", (e) => this.onKeyDown(e));
        applyBox(input, box);
        this.host.append(input);
        this.activeEl = input;
        this.active = true;
        input.classList.add("nt-editor--active");
        input.focus();
        if (selectAll)
            input.select();
    }
    // ── Управление ────────────────────────────────────────────────────────────
    isActive() { return this.active; }
    /** Завершить редактирование и сохранить значение. */
    commit(direction = "none") {
        if (!this.active || !this.activeEl)
            return;
        const row = this.row;
        const col = this.col;
        const value = this.activeEl instanceof HTMLInputElement ? this.activeEl.value : "";
        this.cleanup();
        this.onCommit(row, col, value, direction);
    }
    /** Отменить редактирование без сохранения. */
    cancel() {
        this.cleanup();
        this.onCancel();
    }
    /** Удалить все DOM-элементы редактора. */
    cleanup() {
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
    onKeyDown(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            this.commit("enter");
        }
        else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            this.cancel();
        }
        else if (e.key === "Tab") {
            e.preventDefault();
            e.stopPropagation();
            this.commit(e.shiftKey ? "shift-tab" : "tab");
        }
    }
}
/** Применить абсолютное позиционирование и размеры к элементу. */
function applyBox(el, box) {
    el.style.position = "absolute";
    el.style.left = `${box.left}px`;
    el.style.top = `${box.top}px`;
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;
    el.style.zIndex = "10";
    el.style.boxSizing = "border-box";
}
//# sourceMappingURL=editor.js.map