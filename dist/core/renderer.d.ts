import type { SheetModel } from "./model";
import type { ColumnDef } from "../utils/types";
export declare class Renderer {
    totalRows: number;
    totalCols: number;
    /** Контейнер .nt-root — position: relative, сюда вложены все слои */
    readonly container: HTMLDivElement;
    /** Скролл-вьюпорт — overflow: auto, настоящий скроллбар */
    readonly bodyDiv: HTMLDivElement;
    /** Слой ячеек, оверлея и редактора */
    cellsLayer: HTMLDivElement;
    private inner;
    private headerRow;
    private headerRows;
    private headerCol;
    private corner;
    private rows;
    private headerGrid;
    private maxDepth;
    private headerH;
    private colWidths;
    private colLeftCache;
    private rowHeights;
    private rowTopCache;
    private currentStartRow;
    private currentEndRow;
    private currentStartCol;
    private currentEndCol;
    private onScrollCallback?;
    /** Колбэк при расширении rows/cols (чтобы уведомить SheetView). */
    onExpand?: () => void;
    private onScrollHandler;
    private model;
    private columns;
    /** Маппинг для сортировки/фильтрации: displayRow → dataRow */
    rowMap: number[];
    /** Базовое количество строк (без учёта фильтра) */
    baseRowCount: number;
    selectedRect?: import("../utils/types").SelectionRect;
    constructor(container: HTMLDivElement, model: SheetModel, totalRows: number, totalCols: number, colWidth?: number, rowH?: number, columns?: ColumnDef[]);
    setOnScroll(cb: () => void): void;
    setModel(model: SheetModel): void;
    setColumns(columns: ColumnDef[]): void;
    private dataRow;
    /** Количество строк после фильтрации. */
    visibleRowCount(): number;
    /** Описание колонки по индексу. */
    getColumn(col: number): ColumnDef | undefined;
    /** Подсветка заголовков строк/столбцов, попадающих в выделение */
    highlightHeaders(selection: import("../utils/types").SelectionRect): void;
    destroy(): void;
    /** Получить (или задать через setRowHeight) индивидуальную высоту строки. */
    getRowHeight(row?: number): number;
    /** Левая граница колонки в пикселях (префикс-сумма). */
    colLeft(col: number): number;
    /** Верхняя граница строки в пикселях (префикс-сумма). */
    rowTop(row: number): number;
    /** Установить ширину колонки (мин. 30px). Перестраивает colLeftCache и ширины контейнеров. */
    setColWidth(col: number, width: number): void;
    getColWidth(col: number): number;
    /** Установить высоту одной строки (мин. 20px). Перестраивает rowTopCache. */
    setRowHeight(row: number, h: number): void;
    /** Перестроить кеш rowTopCache — префикс-суммы высот строк для бинарного поиска. */
    private rebuildRowTopCache;
    /** Кеш высот строк (копия, чтобы не мутировали снаружи). */
    getRowHeights(): number[];
    /** Установить массив высот (после загрузки из IndexedDB). */
    setRowHeights(heights: number[]): void;
    /** Гарантировать, что существует как минимум строка с индексом `row`. */
    ensureRows(row: number): void;
    /** Гарантировать, что существует как минимум колонка с индексом `col`. */
    ensureCols(col: number): void;
    /**
     * Автоматически расширить строки/колонки при скролле к границе.
     * Вызывается на каждое событие скролла.
     */
    private autoExpand;
    /** Обновить размеры всех контейнеров (после изменения totalHeight/totalWidth). */
    private updateContainerSizes;
    /** Общая ширина всех колонок (для задания размеров контейнеров). */
    totalWidth(): number;
    /** Общая высота всех строк (для скролл-вьюпорта). */
    totalHeight(): number;
    /** Обновить height всех контейнеров после изменения rowMap */
    updateLayout(): void;
    /**
     * Определить, в какой ячейке находится точка (offsetX, offsetY)
     * относительно bodyDiv. Учитывает скролл.
     */
    cellAt(offsetX: number, offsetY: number): {
        row: number;
        col: number;
    } | null;
    /** Линейный поиск колонки по смещению X. */
    private findColByOffset;
    /** Бинарный поиск строки по смещению Y (использует rowTopCache). */
    private rowIndexAt;
    bodyBox(row: number, col: number): {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    /**
     * Прокрутить вьюпорт так, чтобы ячейка была видна.
     * Не скроллит, если ячейка уже в зоне видимости.
     */
    scrollToCell(row: number, col: number): void;
    /**
     * Главный метод рендеринга.
     * Вычисляет окно видимости → если изменилось, перекладывает строки/ячейки.
     * Заголовки перекладываются всегда (скролл-оффсет меняется).
     */
    render(force?: boolean): void;
    refreshValues(): void;
    private toggleHeaderClass;
    private rebuildColLeftCache;
    /**
     * Вычислить прямоугольник видимых ячеек с учётом буфера.
     * sr/er — строки (startRow, endRow), sc/ec — колонки (startCol, endCol).
     */
    private computeWindow;
    /**
     * Переложить DOM-строки и ячейки под новое окно виртуализации.
     * Использует пул RowElementPool — переиспользует созданные ранее ноды.
     */
    private layoutRows;
    private renderRowContents;
    private layoutHeader;
    private layoutRowHeader;
}
//# sourceMappingURL=renderer.d.ts.map