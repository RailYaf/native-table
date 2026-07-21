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
export type { NativeTableProps } from "./NativeTable";
export type {
	Cell,
	CellCoord,
	CellStyle,
	ChangeAction,
	ColumnDef,
	ColumnType,
	ScalarCellValue,
	SelectionRect,
	SelectOption,
	NativeSheetOptions,
} from "./utils/types";
import "./styles.css";
