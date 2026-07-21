// ── Оверлей выделения ────────────────────────────────────────────────────────
//
// Три DIV-элемента на cellsLayer, которые позиционируются поверх ячеек:
//   1. .nt-range      — синяя рамка выделения
//   2. .nt-copy-range — пунктирная рамка (маркер копирования)
//   3. .nt-fill-handle — квадратик автозаполнения (правый нижний угол)
import { normRect } from "../utils/geometry";
export class SelectionOverlay {
    constructor(cellsLayer, renderer) {
        this.renderer = renderer;
        this.range = document.createElement("div");
        this.range.className = "nt-range";
        this.copyRange = document.createElement("div");
        this.copyRange.className = "nt-copy-range";
        this.copyRange.style.display = "none";
        this.fillHandle = document.createElement("div");
        this.fillHandle.className = "nt-fill-handle";
        cellsLayer.append(this.range, this.copyRange, this.fillHandle);
    }
    /** Обновить позицию и размеры оверлея по текущему выделению. */
    update(selection) {
        const rect = normRect(selection);
        if (!rect) {
            this.range.style.display = "none";
            this.fillHandle.style.display = "none";
            return;
        }
        const left = this.renderer.colLeft(rect.leftCol);
        const top = this.renderer.rowTop(rect.topRow);
        const right = this.renderer.colLeft(rect.rightCol) + this.renderer.getColWidth(rect.rightCol);
        const bottom = this.renderer.rowTop(rect.bottomRow) + this.renderer.getRowHeight(rect.bottomRow);
        this.range.style.left = `${left}px`;
        this.range.style.top = `${top}px`;
        this.range.style.width = `${right - left}px`;
        this.range.style.height = `${bottom - top}px`;
        this.range.style.display = "block";
        // Fill handle: квадратик 6x6 в правом нижнем углу
        this.fillHandle.style.left = `${right - 4}px`;
        this.fillHandle.style.top = `${bottom - 4}px`;
        this.fillHandle.style.display = "block";
    }
    /** Показать пунктирную рамку копирования (после Ctrl+C). */
    showCopyRange(rect) {
        const norm = normRect(rect);
        if (!norm) {
            this.hideCopyRange();
            return;
        }
        const left = this.renderer.colLeft(norm.leftCol);
        const top = this.renderer.rowTop(norm.topRow);
        const right = this.renderer.colLeft(norm.rightCol) + this.renderer.getColWidth(norm.rightCol);
        const bottom = this.renderer.rowTop(norm.bottomRow) + this.renderer.getRowHeight(norm.bottomRow);
        this.copyRange.style.left = `${left}px`;
        this.copyRange.style.top = `${top}px`;
        this.copyRange.style.width = `${right - left}px`;
        this.copyRange.style.height = `${bottom - top}px`;
        this.copyRange.style.display = "block";
    }
    /** Скрыть рамку копирования. */
    hideCopyRange() {
        this.copyRange.style.display = "none";
    }
    /** Получить DOM-элемент fill-handle (для привязки событий drag). */
    fillHandleElement() {
        return this.fillHandle;
    }
}
//# sourceMappingURL=selection.js.map