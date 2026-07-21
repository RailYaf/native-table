// ── Дерево колонок: разворачивание иерархии в плоскую сетку шапки ────────────
/**
 * Развернуть иерархическое дерево колонок в плоский список листовых колонок
 * и сетку ячеек шапки с colSpan.
 */
export function flattenColumns(columns) {
    const flatColumns = [];
    const headerGrid = [];
    let maxDepth = 1;
    function walk(nodes, depth, startCol) {
        if (depth + 1 > maxDepth)
            maxDepth = depth + 1;
        let col = startCol;
        for (const node of nodes) {
            if (node.children && node.children.length > 0) {
                // Групповая колонка: не листовая, рендерится как объединённая ячейка шапки
                const childStart = col;
                col = walk(node.children, depth + 1, col);
                const span = col - childStart;
                headerGrid.push({
                    label: node.label ?? "",
                    col: childStart,
                    colSpan: span,
                    row: depth,
                    rowSpan: 1,
                    def: node,
                });
            }
            else {
                // Листовая колонка
                flatColumns.push(node);
                const leafCol = flatColumns.length - 1;
                headerGrid.push({
                    label: node.label ?? "",
                    col: leafCol,
                    colSpan: 1,
                    row: depth,
                    rowSpan: 1, // будет пересчитан после определения maxDepth
                    def: node,
                });
                col++;
            }
        }
        return col;
    }
    walk(columns, 0, 0);
    // Для листовых колонок: rowSpan = сколько строк осталось до низа шапки
    for (const h of headerGrid) {
        if (!h.def?.children && h.colSpan === 1) {
            h.rowSpan = maxDepth - h.row;
        }
    }
    return { flatColumns, headerGrid, maxDepth };
}
//# sourceMappingURL=column-tree.js.map