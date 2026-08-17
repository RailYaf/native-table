// ── Публичный API компонента NativeTable ────────────────────────────────────
//
// Экспортируются:
//   - NativeTable     — React-обёртка (основной компонент)
//   - NativeSheet     — нативный класс таблицы
//   - SheetModel      — модель данных
//   - Функции адресации (colToLetter, cellKey, ...)
//   - Типы            — Cell, ColumnDef, SelectOption, ...
//   - Стили           — styles.css (импортируется автоматически)

export { NativeTable } from "./NativeTable";
export { NativeSheet } from "./core/native-sheet";
export { SheetModel } from "./core/model";
export { colToLetter, letterToCol, cellKey, parseCellKey } from "./utils/cell-addr";
export type { NativeTableProps } from "./types";
export type {
	Cell,
	CellCoord,
	CellStyle,
	ChangeAction,
	ColumnDef,
	ColumnType,
	ColumnFilter,
	ChangeItem,
	DataChange,
	SaveRow,
	ValidationError,
	ScalarCellValue,
	SelectionRect,
	SelectOption,
	NativeSheetOptions,
	PaginationConfig,
	SortFilterSnapshot,
	SortFilterState,
	SortDirection,
	ToolbarButton,
	ToolbarConfig,
	LayoutData,
	CellConfig,
	ValidationRules,
} from "./utils/types";
import "./styles.css";
