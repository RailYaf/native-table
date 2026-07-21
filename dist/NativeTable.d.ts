import type { Cell, NativeSheetOptions } from "./utils/types";
/** Пропсы компонента — расширяют NativeSheetOptions, добавляя className и style. */
export interface NativeTableProps extends Omit<NativeSheetOptions, "onChange"> {
    className?: string;
    style?: React.CSSProperties;
    onChange?: (_cells: Record<string, Cell>) => void;
}
/** Основной компонент: тулбар + таблица. */
export declare function NativeTable({ className, style, rows, cols, columns, tableName, initialData, defaultColWidth, defaultRowHeight, headerWidth, headerHeight, bufferRows, bufferCols, onChange, }: NativeTableProps): import("react").JSX.Element;
//# sourceMappingURL=NativeTable.d.ts.map