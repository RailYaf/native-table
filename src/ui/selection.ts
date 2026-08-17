// ── Оверлей выделения ────────────────────────────────────────────────────────
//
// Три DIV-элемента, которые позиционируются поверх ячеек:
//   1. .nt-range      — синяя рамка выделения (в cellsLayer)
//   2. .nt-copy-range — пунктирная рамка (маркер копирования, в cellsLayer)
//   3. .nt-fill-handle — квадратик автозаполнения (в container, чтобы быть выше fixed-слоёв)

import { normRect } from "../utils/geometry";
import type { Renderer } from "../core/renderer";
import type { SelectionRect } from "../utils/types";
import { INDEX_HEADER_WIDTH } from "../utils/consts";

export class SelectionOverlay {
	private range: HTMLDivElement;
	private copyRange: HTMLDivElement;
	private fillHandle: HTMLDivElement;
	private editing = false;

	constructor(
		cellsLayer: HTMLDivElement,
		private renderer: Renderer,
	) {
		this.range = document.createElement("div");
		this.range.className = "nt-range";
		this.copyRange = document.createElement("div");
		this.copyRange.className = "nt-copy-range";
		this.copyRange.style.display = "none";
		this.fillHandle = document.createElement("div");
		this.fillHandle.className = "nt-fill-handle";
		cellsLayer.append(this.range, this.copyRange);
		// Fill handle живёт в container (не в bodyDiv), чтобы его z-index был
		// в том же stacking context, что и fixed-слои (z-index 5).
		renderer.container.append(this.fillHandle);
	}

	/** Обновить позицию и размеры оверлея по текущему выделению. */
	update(selection: SelectionRect): void {
		const rect = normRect(selection);
		if (!rect || this.renderer.visibleRowCount() === 0) {
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
		// Убрать border на стыке с фиксированными слоями
		const {
			fixedLeftCols, fixedLeftCompact, currentStuckCount,
			fixedRightCols, fixedRightCompact, fixedRightTotalW, currentRightStuckCount,
			bodyDiv, headerH,
		} = this.renderer;
		const inStuckLeft = (col: number) => {
			const i = fixedLeftCols.indexOf(col);
			return i >= 0 && i < currentStuckCount;
		};
		const nR = fixedRightCols.length;
		const inStuckRight = (col: number) => {
			const i = fixedRightCols.indexOf(col);
			return i >= 0 && i >= nR - currentRightStuckCount;
		};
		this.range.style.borderLeft = inStuckLeft(rect.leftCol) ? "none" : "";
		this.range.style.borderRight = inStuckRight(rect.rightCol) ? "none" : "";

		// Fill handle позиционируем в container-координатах (учитываем scroll и fixed-зону)
		const rightColFixedIdx = fixedLeftCols.indexOf(rect.rightCol);
		const isFixedLeft = rightColFixedIdx >= 0 && rightColFixedIdx < currentStuckCount;
		const isFixedRight = inStuckRight(rect.rightCol);
		let containerRight: number;
		if (isFixedLeft) {
			// Прилипшая: позиция по компактному offset в слое
			containerRight = INDEX_HEADER_WIDTH + fixedLeftCompact[rightColFixedIdx] + (right - this.renderer.colLeft(fixedLeftCols[rightColFixedIdx]));
		} else if (isFixedRight) {
			const rightColFrIdx = fixedRightCols.indexOf(rect.rightCol);
			const startIdxR = nR - currentRightStuckCount;
			const layerW = fixedRightTotalW - fixedRightCompact[startIdxR];
			const p = fixedRightCompact[rightColFrIdx] - fixedRightCompact[startIdxR];
			containerRight = bodyDiv.clientWidth - layerW + p + this.renderer.getColWidth(rect.rightCol);
		} else {
			containerRight = INDEX_HEADER_WIDTH + right - bodyDiv.scrollLeft;
		}
		const containerBottom = headerH + bottom - bodyDiv.scrollTop;
		const containerW = this.renderer.container.clientWidth;
		const containerH = this.renderer.container.clientHeight;
		const scrollbarH = bodyDiv.offsetHeight - bodyDiv.clientHeight;
		const scrollbarW = bodyDiv.offsetWidth - bodyDiv.clientWidth;
		// Скрываем fill handle если нижний или правый край выделения вне видимой области
		const maxBottom = containerH - scrollbarH;
		const maxRight = containerW - scrollbarW;
		if (containerBottom > maxBottom || containerBottom < headerH
			|| containerRight > maxRight + 8 || containerRight < INDEX_HEADER_WIDTH) {
			this.fillHandle.style.display = "none";
			return;
		}
		// Скрываем fill handle, если обычная (не зафиксированная) ячейка сейчас
		// скрыта под fixed-left/fixed-right слоем во время горизонтального скролла —
		// иначе значок (z-index выше fixed-слоёв) рисуется поверх чужих закреплённых ячеек.
		if (!isFixedLeft && !isFixedRight) {
			const stuckLeftWidth = currentStuckCount > 0
				? fixedLeftCompact[currentStuckCount - 1] + this.renderer.getColWidth(fixedLeftCols[currentStuckCount - 1])
				: 0;
			const leftZoneEnd = INDEX_HEADER_WIDTH + stuckLeftWidth;

			const stuckRightStartIdx = nR - currentRightStuckCount;
			const rightZoneStart = currentRightStuckCount > 0
				? bodyDiv.clientWidth - (fixedRightTotalW - fixedRightCompact[stuckRightStartIdx])
				: bodyDiv.clientWidth;

			if (containerRight <= leftZoneEnd || containerRight >= rightZoneStart) {
				this.fillHandle.style.display = "none";
				return;
			}
		}
		this.fillHandle.style.left = `${Math.min(containerRight, maxRight) - 4}px`;
		this.fillHandle.style.top = `${containerBottom - 4}px`;
		this.fillHandle.style.display = this.renderer.readOnly || this.editing ? "none" : "block";
	}

	/** Показать/спрятать fill-handle на время редактирования ячейки. */
	setEditing(editing: boolean): void {
		this.editing = editing;
		this.fillHandle.style.display = this.renderer.readOnly || this.editing ? "none" : "block";
	}

	/** Показать пунктирную рамку копирования (после Ctrl+C). */
	showCopyRange(rect: SelectionRect): void {
		const norm = normRect(rect);
		if (!norm || this.renderer.visibleRowCount() === 0) {
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
	hideCopyRange(): void {
		this.copyRange.style.display = "none";
	}

	/** Получить DOM-элемент fill-handle (для привязки событий drag). */
	fillHandleElement(): HTMLDivElement {
		return this.fillHandle;
	}
}
