import type { SelectionRect } from "./types";
/**
 * Нормализует прямоугольник выделения:
 * приводит start/end к единому порядку (topRow ≤ bottomRow, leftCol ≤ rightCol).
 * Возвращает null, если выделение не задано.
 */
export declare function normRect(rect: SelectionRect): {
    topRow: number;
    bottomRow: number;
    leftCol: number;
    rightCol: number;
} | null;
//# sourceMappingURL=geometry.d.ts.map