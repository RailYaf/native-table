// ── Типы данных NativeSheet ──────────────────────────────────────────────────

/** Допустимые типы колонок */
export type ColumnType = "text" | "number" | "boolean" | "select" | "date";

/** Тип действия при изменении данных */
export type ChangeAction = "edit" | "delete" | "insert" | "clear" | "paste" | "fill" | "undo" | "redo";

export interface SelectOption {
	value: string | number;
	label: string;
}

export interface ColumnDef {
	/** Тип колонки (default: "text") */
	type?: ColumnType;
	/** Заголовок колонки. Если не задан — используется буква (A, B, C...) */
	label?: string;
	/** Ширина колонки в px */
	width?: number;
	/** Только для чтения — редактирование заблокировано */
	readOnly?: boolean;
	/** Выравнивание содержимого. По умолчанию: right для number, center для boolean, left для остальных */
	align?: "left" | "center" | "right";
	/** Опции для типа select */
	options?: SelectOption[];
	/** Количество знаков после запятой для типа number */
	decimals?: number;
	/** Дочерние колонки — создают многоуровневую шапку. Листовые колонки = колонки данных. */
	children?: ColumnDef[];
	/** Видимость колонки. false = скрыта. */
	visible?: boolean;
}

export interface CellStyle {
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	align?: "left" | "center" | "right";
	valign?: "top" | "middle" | "bottom";
	background?: string;
	color?: string;
	wrap?: boolean;
}

export type ScalarCellValue = string | number | boolean | null;

export interface Cell {
	value?: ScalarCellValue;
	display?: string;
	style?: CellStyle;
}

export interface CellCoord {
	row: number;
	col: number;
}

export type SelectionRect = {
	start: CellCoord | null;
	end: CellCoord | null;
};

export interface NativeSheetOptions {
	rows: number;
	cols: number;
	columns?: ColumnDef[];
	tableName: string;
	defaultColWidth?: number;
	defaultRowHeight?: number;
	initialWidths?: Record<string, number>;
	initialHeights?: number[];
	initialStyles?: Record<string, CellStyle>;
	headerWidth?: number;
	headerHeight?: number;
	bufferRows?: number;
	bufferCols?: number;
	initialData?: Record<string, Cell>;
	onChange?: (_cells: Record<string, Cell>, action?: ChangeAction) => void;
	/** Индексы строк, запрещённых к редактированию */
	disabledRows?: number[];
}
