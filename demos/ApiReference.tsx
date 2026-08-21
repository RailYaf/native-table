interface ApiRow {
	prop: string;
	type: string;
	default?: string;
	required?: boolean;
	description: string;
}

interface ApiSection {
	title: string;
	rows: ApiRow[];
}

const SECTIONS: ApiSection[] = [
	{
		title: "NativeTableProps",
		rows: [
			{ prop: "data", type: "Record<string, unknown>[]", default: "[]", description: "Массив строк. Каждая должна иметь поле-идентификатор (см. rowKey)" },
			{ prop: "columns", type: "ColumnDef[]", required: true, description: "Описание колонок (обязательный)" },
			{ prop: "rowKey", type: "string", default: '"id"', description: "Имя поля-идентификатора строки в data" },
			{ prop: "className", type: "string", description: "Класс враппера таблицы" },
			{ prop: "style", type: "CSSProperties", description: "Стили контейнера (обычно maxHeight)" },
			{ prop: "onChange", type: "(allRows, changes) => void", description: "Вызывается при любом изменении данных" },
			{ prop: "onSave", type: "(allRows, changes) => void", description: "Сохранение: Ctrl+S или кнопка. changes — гранулярные изменения" },
			{ prop: "onLayoutChange", type: "(layout: LayoutData) => void", description: "Изменение ширин колонок — лейаут для персистенции" },
			{ prop: "loading", type: "boolean", default: "false", description: "Спиннер загрузки" },
			{ prop: "disabledRows", type: "number[]", default: "[]", description: "id строк, запрещённых к редактированию" },
			{ prop: "validationErrors", type: "ValidationError[]", description: "Внешние ошибки: rowId, columnName, message" },
			{ prop: "validationWarnings", type: "ValidationError[]", description: "Предупреждения (жёлтый индикатор)" },
			{ prop: "allowAddRows", type: "boolean", default: "true", description: "Добавление новых строк внизу таблицы" },
			{ prop: "readOnly", type: "boolean", default: "false", description: "Полный запрет редактирования, тулбар скрыт" },
			{ prop: "resizableColumns", type: "boolean", default: "true", description: "Изменение ширины колонок перетаскиванием" },
			{ prop: "header", type: "HeaderConfig", description: "ellipsis — обрезка заголовков, layout — позиции label/иконки" },
			{ prop: "cell", type: "CellConfig", description: "ellipsis и capLines — обрезка текста ячеек" },
			{ prop: "hiddenToolbarActions", type: "ToolbarButton[]", description: 'Кнопки тулбара для скрытия: "save" | "undo" | "redo"' },
			{ prop: "columnWidths", type: "Record<string, number>", description: "Сохранённые ширины колонок: columnName → px" },
			{ prop: "striped", type: "boolean", default: "false", description: "Зебра — чередующаяся расцветка строк" },
			{ prop: "theme", type: '"light" | "dark"', default: '"light"', description: "Тема таблицы" },
			{ prop: "serverSide", type: "boolean", default: "false", description: "Сортировка/фильтрация выполняются на сервере" },
			{ prop: "onApplySortFilter", type: "(snapshot: SortFilterSnapshot) => void", description: "Применение сортировки/фильтра (при serverSide)" },
			{ prop: "onClearSortFilter", type: "(snapshot: SortFilterSnapshot) => void", description: "Сброс сортировки/фильтра (при serverSide)" },
			{ prop: "sortFilter", type: "SortFilterSnapshot", description: "Текущее состояние сортировки/фильтра (индикаторы в шапке)" },
			{ prop: "pagination", type: "PaginationConfig", description: "Конфигурация server-side пагинации" },
		],
	},
	{
		title: "ColumnDef",
		rows: [
			{ prop: "name", type: "string", required: true, description: "Уникальное имя колонки — ключ значений в data" },
			{ prop: "label", type: "string", description: "Заголовок колонки" },
			{ prop: "type", type: "ColumnType", default: '"text"', description: '"text" | "number" | "boolean" | "select" | "date" | "datetime" | "array" | "json"' },
			{ prop: "width", type: "number", description: "Ширина в px. Без неё колонки делят свободное место поровну" },
			{ prop: "color", type: "string | (value) => string | null", description: "Цвет текста ячеек (строка или функция от значения)" },
			{ prop: "backgroundColor", type: "string | (value) => string | null", description: "Цвет заливки ячеек" },
			{ prop: "readOnly", type: "boolean", description: "Колонка только для чтения" },
			{ prop: "align", type: '"left" | "center" | "right"', description: "Выравнивание (default: right для number, center для boolean)" },
			{ prop: "options", type: "SelectOption[]", description: "Пункты выпадающего списка для type: select" },
			{ prop: "decimals", type: "number", description: "Знаков после запятой для number" },
			{ prop: "subtype", type: '"text" | "number"', description: "Тип элементов для type: array" },
			{ prop: "children", type: "ColumnDef[]", description: "Вложенные колонки — многоуровневая шапка" },
			{ prop: "visible", type: "boolean", description: "false — колонка скрыта" },
			{ prop: "nullable", type: "boolean", description: "Разрешить null (для boolean — третье состояние)" },
			{ prop: "default", type: "ScalarCellValue", description: "Значение по умолчанию для новых строк" },
			{ prop: "validationRules", type: "ValidationRules", description: "Правила клиентской валидации" },
			{ prop: "fixed", type: '"left" | "right"', description: "Зафиксировать колонку при горизонтальном скролле" },
		],
	},
	{
		title: "ValidationRules",
		rows: [
			{ prop: "required", type: "boolean", description: "Значение обязательно для заполнения" },
			{ prop: "pattern", type: "string", description: "Регулярное выражение для проверки" },
			{ prop: "patternMessage", type: "string", description: "Сообщение при несоответствии pattern" },
			{ prop: "minLength / maxLength", type: "number", description: "Минимальная / максимальная длина строки" },
			{ prop: "unique", type: "boolean", description: "Уникальность значения в колонке" },
		],
	},
	{
		title: "Типы колбэков",
		rows: [
			{ prop: "ChangeItem", type: "createdRowId | updatedRowId | deletedRowId", description: "Гранулярное изменение: созданная/изменённая ячейка или удалённая строка" },
			{ prop: "LayoutData", type: "{ widths: Record<string, number> }", description: "Лейаут для персистенции: columnName → px" },
			{ prop: "PaginationConfig", type: "{ page; pageSize; total; pageSizeOptions; onPageChange }", description: "page — 0-based; onPageChange(page, pageSize)" },
			{ prop: "SortFilterSnapshot", type: "{ sort; filters }", description: "Сортировки и фильтры по колонкам для серверных колбэков" },
		],
	},
];

function ApiTable({ section }: { section: ApiSection }) {
	return (
		<div className="api-section">
			<h3>{section.title}</h3>
			<table className="api-table">
				<thead>
					<tr>
						<th>Проп</th>
						<th>Тип</th>
						<th>Обязательный</th>
						<th>По умолчанию</th>
						<th>Описание</th>
					</tr>
				</thead>
				<tbody>
					{section.rows.map((row) => (
						<tr key={row.prop}>
							<td className="api-prop">{row.prop}</td>
							<td className="api-type">{row.type}</td>
							<td className="api-required">{row.required ? "да" : "нет"}</td>
							<td className="api-default">{row.default ?? "—"}</td>
							<td>{row.description}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export function ApiReference() {
	return (
		<div className="demo-panel">
			{SECTIONS.map((section) => (
				<ApiTable key={section.title} section={section} />
			))}
		</div>
	);
}
