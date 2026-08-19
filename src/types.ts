import type { ColumnDef, HeaderConfig, LayoutData, PaginationConfig, SortFilterSnapshot, ValidationError, CellStyle, ToolbarConfig, CellConfig, ChangeItem } from "./utils/types";

export type { ToolbarButton, ToolbarConfig } from "./utils/types";

export interface NativeTableProps {
	className?: string;
	style?: React.CSSProperties;
	/** Массив объектов данных. Каждый должен иметь поле id. */
	data?: Record<string, unknown>[];
	/** Колонки. Поле name должно совпадать с ключами объектов в data. */
	columns: ColumnDef[];
	/** Имя поля в data, которое использовать как id строки (по умолчанию "id") */
	rowKey?: string;
	/** Вызывается при любом изменении данных */
	onChange?: (allRows: Record<string, unknown>[], changes: ChangeItem[]) => void;
	/**
	 * Вызывается при сохранении (Ctrl+S / кнопка):
	 * allRows — все строки таблицы, changes — гранулярные изменения
	 * (created/updated ячейки, deleted строки), layout — ширины/стили.
	 */
	onSave?: (allRows: Record<string, unknown>[], changes: ChangeItem[], layout?: LayoutData) => void;
	/** Показать спиннер загрузки */
	loading?: boolean;
	/** Индексы строк, запрещённых к редактированию */
	disabledRows?: number[];
	/** Ошибки валидации: rowId + columnName + message */
	validationErrors?: ValidationError[];
	/** Предупреждения валидации: rowId + columnName + message (жёлтый треугольник) */
	validationWarnings?: ValidationError[];
	/** Разрешить бесконечное добавление строк. false = только данные из data */
	allowAddRows?: boolean;
	/** Таблица только для чтения (все ячейки — readonly, только Copy в меню) */
	readOnly?: boolean;
	/** Разрешить изменение ширины столбцов перетаскиванием (default: true) */
	resizableColumns?: boolean;
	/** Настройка шапки: ellipsis — обрезка текста, layout — позиции label/иконки */
	header?: HeaderConfig;
	/** Настройки ячеек */
	cell?: CellConfig;
	/** Настройки тулбара */
	toolbar?: ToolbarConfig;
	/** Заданные стили ячеек: ключ = columnName|rowId, значение = цвет текста + заливка */
	cellStyles?: Record<string, CellStyle>;
	/** Заданные ширины колонок: columnName → px */
	columnWidths?: Record<string, number>;
	/** Зебра — чередующаяся расцветка строк */
	striped?: boolean;
	/** Тема: "light" | "dark" */
	theme?: "light" | "dark";
	/** Серверная сортировка/фильтрация */
	serverSide?: boolean;
	/** Колбэк при применении сортировки/фильтра (при serverSide) */
	onApplySortFilter?: (snapshot: SortFilterSnapshot) => void;
	/** Колбэк при сбросе сортировки/фильтра (при serverSide) */
	onClearSortFilter?: (snapshot: SortFilterSnapshot) => void;
	/** Текущее состояние сортировки/фильтра (индикаторы в заголовках) */
	sortFilter?: SortFilterSnapshot;
	/** Конфигурация пагинации */
	pagination?: PaginationConfig;
}
