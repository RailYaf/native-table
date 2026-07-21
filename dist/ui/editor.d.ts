import type { SheetModel } from "../core/model";
import type { SheetView } from "../core/sheet-view";
import type { ColumnDef } from "../utils/types";
export type CommitDirection = "enter" | "tab" | "shift-tab" | "none";
export declare class Editor {
    private host;
    /** Позиция и размер ячейки в пикселях */
    private getCellBox;
    /** Вызывается при commit — передаёт строковое значение и направление */
    private onCommit;
    private onCancel;
    /** Активный элемент ввода: <input> или <div>-триггер для select */
    private activeEl;
    /** Дропдаун для типа select */
    private dropdownEl;
    /** Редактор активен? */
    private active;
    row: number;
    col: number;
    private model;
    private view;
    constructor(host: HTMLDivElement, // контейнер, куда вставляются элементы редактора
    model: SheetModel, 
    /** Позиция и размер ячейки в пикселях */
    getCellBox: (_row: number, _col: number) => {
        left: number;
        top: number;
        width: number;
        height: number;
    }, 
    /** Вызывается при commit — передаёт строковое значение и направление */
    onCommit: (_row: number, _col: number, _value: string, _direction: CommitDirection) => void, onCancel: () => void);
    setModel(model: SheetModel): void;
    setView(view: SheetView): void;
    /** Получить ячейку через view (если активна фильтрация) или напрямую из model. */
    private getCell;
    /**
     * Начать редактирование ячейки.
     * @param selectAll — выделить всё содержимое в инпуте (false при вводе нового символа)
     */
    start(row: number, col: number, colDef?: ColumnDef, initial?: string, selectAll?: boolean): void;
    /** Select-редактор: прозрачный триггер поверх ячейки + дропдаун снизу. */
    private startSelectEditor;
    /** Подтвердить выбор в select-редакторе. */
    private commitSelect;
    /** Текстовый редактор: <input> с type=text/number/date. */
    private startTextEditor;
    isActive(): boolean;
    /** Завершить редактирование и сохранить значение. */
    commit(direction?: CommitDirection): void;
    /** Отменить редактирование без сохранения. */
    cancel(): void;
    /** Удалить все DOM-элементы редактора. */
    private cleanup;
    /** Обработка клавиш внутри <input>. Enter/Tab — commit, Escape — cancel. */
    private onKeyDown;
}
//# sourceMappingURL=editor.d.ts.map