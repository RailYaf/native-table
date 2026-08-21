// ── Типы данных NativeSheet ──────────────────────────────────────────────────

/** Допустимые типы колонок */
export type ColumnType = "text" | "number" | "boolean" | "select" | "date" | "datetime" | "array" | "json";

/** Тип действия при изменении данных */
export type ChangeAction = "edit" | "delete" | "insert" | "clear" | "paste" | "fill" | "undo" | "redo";

/** Один пункт выпадающего списка колонки типа select. */
export interface SelectOption {
	/** Значение, сохраняемое в ячейку */
	value: string | number;
	/** Отображаемый текст пункта */
	label: string;
}

/** Правила клиентской валидации значения ячейки (задаются на колонке). */
export interface ValidationRules {
	/** Значение обязательно для заполнения */
	required?: boolean | null;
	/** Регулярное выражение для проверки значения */
	pattern?: string | null;
	/** Сообщение об ошибке при несоответствии pattern */
	patternMessage?: string | null;
	/** Минимальная длина строки */
	minLength?: number | null;
	/** Максимальная длина строки */
	maxLength?: number | null;
	/** Значение должно быть уникальным в колонке */
	unique?: boolean | null;
}

/** Описание колонки таблицы: тип, ширина, блокировки, вложенность и правила валидации. */
export interface ColumnDef {
	/** Уникальное имя колонки (используется для ключей валидации и сохранения) */
	name?: string;
	/** Тип колонки (default: "text") */
	type?: ColumnType;
	/** Заголовок колонки */
	label?: string;
	/**
	 * Ширина колонки в px. Без width колонка делит свободное место поровну.
	 * Таблица всегда занимает 100% ширины: если ширин хватает — колонки
	 * растягиваются, если нет — горизонтальный скролл.
	 * Ручной ресайз/сохранённый лейаут переводят колонку в фикс. px.
	 */
	width?: number;
	/** Цвет текста ячеек: CSS-строка (#FFFFFF) или функция от значения ячейки */
	color?: string | ((value: ScalarCellValue) => string | null | undefined);
	/** Цвет заливки ячеек: CSS-строка (#FFFFFF) или функция от значения ячейки */
	backgroundColor?: string | ((value: ScalarCellValue) => string | null | undefined);
	/** Только для чтения — редактирование заблокировано */
	readOnly?: boolean;
	/** Выравнивание содержимого. По умолчанию: right для number, center для boolean, left для остальных */
	align?: "left" | "center" | "right";
	/** Опции для типа select */
	options?: SelectOption[];
	/** Количество знаков после запятой для типа number */
	decimals?: number;
	/** Тип элементов массива (только для type="array") */
	subtype?: "text" | "number";
	/** Дочерние колонки — создают многоуровневую шапку. Листовые колонки = колонки данных. */
	children?: ColumnDef[];
	/** Видимость колонки. false = скрыта. */
	visible?: boolean;
	/** Разрешить null как значение (boolean: три состояния, clear: сброс в null) */
	nullable?: boolean;
	/** Значение по умолчанию для новых строк */
	default?: ScalarCellValue;
	/** Правила клиентской валидации */
	validationRules?: ValidationRules;
	/** Зафиксировать колонку при горизонтальном скролле */
	fixed?: "left" | "right";
}

/** Скалярное значение ячейки: строка, число, boolean, null или массив строк/чисел (для array/json). */
export type ScalarCellValue = string | number | boolean | null | string[] | number[];

export interface Cell {
	/** Сырое значение ячейки (тип соответствует типу колонки) */
	value?: ScalarCellValue;
	/** Готовый текст для отображения (отформатирован по типу колонки) */
	display?: string;
}

// ── Структурированные колбэки (data-ориентированный API) ────────────────────

/** Одно изменение ячейки */
export interface DataChange {
	/** ID строки (значение поля rowKey из data) */
	rowId: string | number;
	/** Имя колонки (ColumnDef.name) */
	columnName: string;
	/** Значение до изменения */
	oldValue: ScalarCellValue;
	/** Значение после изменения */
	newValue: ScalarCellValue;
}

/** Одна строка для сохранения */
export interface SaveRow {
	/** ID строки (значение поля rowKey из data) */
	rowId: string | number;
	/** Значения колонок строки: columnName → значение */
	values: Record<string, ScalarCellValue>;
}

/** Элемент списка изменений для сохранения: созданная/изменённая ячейка или удалённая строка. */
export type ChangeItem =
	| { createdRowId: string | number; columnName: string; value: ScalarCellValue }
	| { updatedRowId: string | number; columnName: string; value: ScalarCellValue }
	| { deletedRowId: string | number };

/** Данные лейаута для сохранения */
export interface LayoutData {
	/** Ширины колонок: columnName → px */
	widths: Record<string, number>;
}

/** Ошибка валидации */
export interface ValidationError {
	/** ID строки с ошибкой */
	rowId: string | number;
	/** Имя колонки с ошибкой */
	columnName: string;
	/** Текст ошибки */
	message: string;
}

/** Координата ячейки: строка и колонка (display-координаты). */
export interface CellCoord {
	/** Индекс строки (0-based, display-координата) */
	row: number;
	/** Индекс листовой колонки (0-based) */
	col: number;
}

/** Прямоугольник выделения: start = якорь (где началось), end = текущая позиция курсора. */
export type SelectionRect = {
	/** Якорь выделения (начальная ячейка) */
	start: CellCoord | null;
	/** Противоположный угол (текущее положение курсора) */
	end: CellCoord | null;
};

/** Состояние сортировки и фильтра колонки (для колбэков server-side пагинации) */
export type SortDirection = "asc" | "desc" | "none";

/** Одна запись в стеке сортировки. */
export interface SortEntry {
	col: number;
	asc: boolean;
}

/** Операции фильтра. */
export type FilterOp = "values" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "between" | "mask" | "nmask" | "imask" | "nimask";

/** Фильтр для одной колонки. */
export interface ColumnFilter {
	op: FilterOp;
	/** Выбранные значения (для op="values") */
	values?: Set<string>;
	/** Значение сравнения */
	value?: string;
	/** Второе значение (для between) */
	value2?: string;
}

/** Состояние сортировки и фильтра одной колонки (применяется попапом). */
export interface SortFilterState {
	/** Направление сортировки: asc / desc / none */
	sort: SortDirection;
	/** Активный фильтр колонки (null — без фильтра) */
	filter: ColumnFilter | null;
}

/** Полный снапшот сортировки/фильтра для серверных колбэков. */
export interface SortFilterSnapshot {
	/** Активные сортировки в порядке применения: имя колонки и направление */
	sort: Array<{ col: string | number; dir: "asc" | "desc" }>;
	/** Фильтры по колонкам: имя колонки → условие (значения как строки, без Set) */
	filters: Record<string | number, {
		op: string;
		values?: string[];
		value?: string;
		value2?: string;
	}>;
}

/** Конфигурация серверной пагинации */
export interface PaginationConfig {
	/** Текущая страница (0-based) */
	page: number;
	/** Размер страницы */
	pageSize: number;
	/** Общее кол-во записей на сервере */
	total: number;
	/** Колбэк смены страницы / размера страницы */
	onPageChange: (page: number, pageSize: number) => void;
	/** Варианты размера страницы для селекта */
	pageSizeOptions: number[];
}

/** Позиции элементов внутри ячейки шапки. */
export interface HeaderLayoutConfig {
	/** Вертикальная позиция текста заголовка (default: "center") */
	label?: "top" | "center" | "bottom";
	/** Вертикальная позиция иконки фильтра/сортировки (default: "center") */
	icon?: "top" | "center" | "bottom";
	/** Горизонтальное распределение label и иконки (default: "center") */
	horizontal?: "center" | "space-between";
}

export interface HeaderConfig {
	/** Обрезать текст заголовка с многоточием. false = полный текст (перенос) */
	ellipsis?: boolean;
	/** Позиции label и иконки фильтра/сортировки внутри ячейки шапки */
	layout?: HeaderLayoutConfig;
}

export interface CellConfig {
	/** Обрезать текст с многоточием (default: false = полный текст) */
	ellipsis?: boolean;
	/** Максимальное число строк до многоточия, при ellipsis: true (default: 1) */
	capLines?: number;
}

/** Идентификаторы кнопок тулбара (используются в hiddenToolbarActions и data-action). */
export type ToolbarButton = "save" | "undo" | "redo";

export interface NativeSheetOptions {
	/** Количество строк данных */
	rows: number;
	/** Количество листовых (data) колонок */
	cols: number;
	/** Колонки таблицы (поддерживают вложенность children) */
	columns: ColumnDef[];
	/** Заданные ширины колонок: columnName → px */
	columnWidths?: Record<string, number>;
	/** Начальные данные: A1-ключ ("C5") → ячейка */
	initialData?: Record<string, Cell>;
	/**
	 * Вызывается при любом изменении данных.
	 * @param allCells — все ячейки модели (A1-ключ → Cell)
	 * @param changedCells — только изменённые ячейки: A1-ключ → { old, new }
	 * @param action — тип изменения (edit/insert/delete/clear/paste/fill/undo/redo)
	 */
	onChange?: (allCells: Record<string, Cell>, changedCells: Record<string, { old: Cell | null; new: Cell | null }>, action?: ChangeAction) => void;
	/** Вызывается при сохранении — и по кнопке, и по Ctrl+S */
	onSave?: (allCells: Record<string, Cell>) => void;
	/** Вызывается при изменении ширины колонок (ресайз) — лейаут для персистенции */
	onLayoutChange?: (layout: LayoutData) => void;
	/** id записей, запрещённых к редактированию */
	disabledRows?: number[];
	/** Разрешить бесконечное добавление строк. false = только dataSource */
	allowAddRows?: boolean;
	/** ID строк: rowIds[r] = dataSource[r]["id"]. Если не задан — rowIndex+1. */
	rowIds?: (string | number)[];
	/** Таблица только для чтения */
	readOnly?: boolean;
	/** Разрешить изменение ширины столбцов перетаскиванием (default: true) */
	resizableColumns?: boolean;
	/** Настройка шапки: ellipsis — обрезка текста, layout — позиции label/иконки */
	header?: HeaderConfig;
	/** Настройки ячеек */
	cell?: CellConfig;
	/** Зебра — чередующаяся расцветка строк */
	striped?: boolean;
	/** Серверная сортировка/фильтрация (колбэки уходят на сервер, клиент не фильтрует) */
	serverSide?: boolean;
	/** Колбэк при применении сортировки/фильтра (только при serverSide=true) */
	onApplySortFilter?: (snapshot: SortFilterSnapshot) => void;
	/** Колбэк при сбросе сортировки/фильтра (только при serverSide=true) */
	onClearSortFilter?: (snapshot: SortFilterSnapshot) => void;
	/** Текущее состояние сортировки/фильтра (для отображения индикаторов при serverSide) */
	sortFilter?: SortFilterSnapshot;
	/** Предупреждения валидации (жёлтые треугольники) */
	initialWarnings?: Record<string, string[]>;
	/** Конфигурация пагинации (если не задана — все данные загружены) */
	pagination?: PaginationConfig;
	/** Тема: "light" | "dark" */
	theme?: "light" | "dark";
}
