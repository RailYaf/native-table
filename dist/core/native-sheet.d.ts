import type { Cell, ColumnDef, NativeSheetOptions } from "../utils/types";
export declare class NativeSheet {
    /** Контейнер .nt-root, созданный в NativeTable.tsx */
    private container;
    private model;
    private view;
    private renderer;
    private editor;
    private overlay;
    private selection;
    /** Копируемое выделение (для отображения пунктирной рамки) */
    private copyRect;
    /** Буфер обмена: координаты, значения и стили */
    private clipboard;
    private options;
    private destroyed;
    private onMouseDownHandler;
    private onDoubleClickHandler;
    private onKeyDownHandler;
    private onCheckboxClickHandler;
    private onContextMenuHandler;
    private contextMenu;
    private sortFilterPopup;
    private resizingCol;
    private resizeStartX;
    private resizeStartWidth;
    /** Обработчик закрытия дочернего попапа (сортировка/фильтр/выравнивание) */
    private _childPopupCloseHandler;
    /** Менеджер undo/redo */
    private _undoMgr;
    constructor(
    /** Контейнер .nt-root, созданный в NativeTable.tsx */
    container: HTMLDivElement, options: NativeSheetOptions);
    getData(): Record<string, Cell>;
    setData(data: Record<string, Cell>): void;
    private syncView;
    private toDataRow;
    setColumns(columns: ColumnDef[]): void;
    destroy(): void;
    private clearCopy;
    private setSelectionNoScroll;
    private setSelection;
    private cellAtEvent;
    private onCheckboxClick;
    private onContextMenu;
    private hideContextMenu;
    private showSortFilterPopup;
    private hideSortFilterPopup;
    private hideFilterChildPopup;
    private updateSortIndicators;
    private insertRowAbove;
    private insertRowBelow;
    private deleteSelectedRows;
    private onMouseDown;
    private onDoubleClick;
    private toggleBoolean;
    /** Отменить последнее действие. */
    undo(): void;
    /** Вернуть отменённое действие. */
    redo(): void;
    /**
     * Сохранить состояние: ширины/высоты/стили → IndexedDB,
     * данные → через onChange колбэк, очистить историю undo.
     */
    save(): void;
    /** Инвертировать жирный для выделенных ячеек. */
    toggleBold(): void;
    /** Инвертировать курсив. */
    toggleItalic(): void;
    /** Инвертировать подчёркивание. */
    toggleUnderline(): void;
    /** Инвертировать перенос текста. */
    toggleWrap(): void;
    /** Горизонтальное выравнивание. */
    setAlign(align: "left" | "center" | "right"): void;
    /** Вертикальное выравнивание. */
    setValign(valign: "top" | "middle" | "bottom"): void;
    /**
     * Применить стиль ко всем выделенным ячейкам (слияние с существующим стилем).
     * Записывает в undo-стек, обновляет тулбар и перерисовывает.
     */
    private applyStyle;
    private getFirstSelectedStyle;
    showAlignPopup(clientX: number, clientY: number): void;
    setCellStyle(style: Partial<import("../utils/types").CellStyle>): void;
    private _undoRedo;
    private _updateToolbar;
    updateToolbarStyleState(): void;
    private findRowForCell;
    private startDrag;
    private startFillDrag;
    private applyFill;
    private onKeyDown;
    private copy;
    private paste;
    private deleteSelection;
    private commitEdit;
    private handleEscape;
    private startColResize;
    private startRowResize;
    private saveColumnWidths;
    private collectStyles;
    private applyStyles;
    private autoScrollTimer;
    private autoScrollOnMove;
    private lastAutoScrollEv;
    private startAutoScroll;
    private autoScroll;
    private autoScrollDX;
    private autoScrollDY;
    private stopAutoScroll;
    private cancelEdit;
}
//# sourceMappingURL=native-sheet.d.ts.map