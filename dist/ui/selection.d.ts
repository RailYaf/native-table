import type { Renderer } from "../core/renderer";
import type { SelectionRect } from "../utils/types";
export declare class SelectionOverlay {
    private renderer;
    private range;
    private copyRange;
    private fillHandle;
    constructor(cellsLayer: HTMLDivElement, renderer: Renderer);
    /** Обновить позицию и размеры оверлея по текущему выделению. */
    update(selection: SelectionRect): void;
    /** Показать пунктирную рамку копирования (после Ctrl+C). */
    showCopyRange(rect: SelectionRect): void;
    /** Скрыть рамку копирования. */
    hideCopyRange(): void;
    /** Получить DOM-элемент fill-handle (для привязки событий drag). */
    fillHandleElement(): HTMLDivElement;
}
//# sourceMappingURL=selection.d.ts.map