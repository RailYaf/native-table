# NativeTable

Нативная React-таблица в стиле Excel / Google Sheets: виртуализация строк и столбцов,
встроенные редакторы по типам колонок, валидация, пагинация, undo/redo, темы.

## Возможности

- Виртуализация: тысячи строк и сотни столбцов без потери производительности
- Типы колонок: `text`, `number`, `boolean`, `select`, `date`, `datetime`, `array`, `json`
- Встроенные редакторы: textarea с авто-ростом, select-дропдаун с поиском, date/datetime-пикер, редакторы массива и JSON, чекбокс
- Группированная (многоуровневая) шапка через `children`
- Зафиксированные колонки: `fixed: "left" | "right"`
- Клиентская валидация: `required`, `pattern`, `minLength`, `maxLength`, `unique` + внешние ошибки/предупреждения
- Undo/Redo (Ctrl+Z / Ctrl+Y), сохранение по Ctrl+S
- Server-side пагинация и сортировка/фильтрация
- Темы `light` / `dark`, зебра, цвета колонок функциями от значения
- Сохранение лейаута (ширины колонок) через `onLayoutChange`

## Подключение

```tsx
import { NativeTable } from "@rshb/native-table";
import "@rshb/native-table/src/styles.css";
```

```tsx
const columns = [
  { name: "name", label: "Название", width: 180 },
  { name: "price", label: "Цена, ₽", type: "number", decimals: 2 },
  { name: "status", label: "Статус", type: "select", options: [
    { value: "new", label: "Новый" },
    { value: "done", label: "Готово" },
  ] },
];

const data = [
  { id: 1, name: "Монитор", price: 54990, status: "new" },
];

<NativeTable
  data={data}
  columns={columns}
  onSave={(allRows, changes) => saveToServer(allRows, changes)}
  style={{ maxHeight: 500 }}
/>;
```

## Как работает

- Таблица «управляется данными»: передали `data` — таблица построилась. При изменении
  массива `data` (по ссылке) или состава колонок таблица пересоздаётся.
- `onChange` вызывается при любом изменении, `onSave` — по Ctrl+S или кнопке «Сохранить».
  Оба получают все строки + гранулярные изменения (`ChangeItem[]`).
- Лейаут (ширины колонок) не входит в `onSave` — он уходит отдельно через
  `onLayoutChange` сразу при изменении.
- Undo/redo отменяют только изменения данных (значения ячеек). Сортировка/фильтр,
  ресайз колонок в историю не попадают.

## API

### `NativeTableProps`

| Проп | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `data` | `Record<string, unknown>[]` | `[]` | Массив строк. Каждая должна иметь поле-идентификатор |
| `columns` | `ColumnDef[]` | — | Описание колонок (обязательный) |
| `rowKey` | `string` | `"id"` | Имя поля-идентификатора строки в `data` |
| `className` | `string` | — | Класс враппера таблицы |
| `style` | `CSSProperties` | — | Стили контейнера (обычно `maxHeight`) |
| `onChange` | `(allRows, changes) => void` | — | Вызывается при любом изменении данных |
| `onSave` | `(allRows, changes) => void` | — | Сохранение: Ctrl+S или кнопка. `changes` — гранулярные изменения |
| `onLayoutChange` | `(layout: LayoutData) => void` | — | Изменение ширин колонок (для персистенции лейаута) |
| `loading` | `boolean` | `false` | Спиннер загрузки |
| `disabledRows` | `number[]` | `[]` | id строк, запрещённых к редактированию |
| `validationErrors` | `ValidationError[]` | — | Внешние ошибки валидации (`rowId`, `columnName`, `message`) |
| `validationWarnings` | `ValidationError[]` | — | Предупреждения (жёлтый индикатор) |
| `allowAddRows` | `boolean` | `true` | Добавление новых строк внизу таблицы |
| `readOnly` | `boolean` | `false` | Полный запрет редактирования, тулбар скрыт |
| `resizableColumns` | `boolean` | `true` | Изменение ширины колонок перетаскиванием |
| `header` | `HeaderConfig` | — | `ellipsis` — обрезка заголовков, `layout` — позиции label/иконки |
| `cell` | `CellConfig` | — | `ellipsis`, `capLines` — обрезка текста ячеек |
| `hiddenToolbarActions` | `ToolbarButton[]` | — | Кнопки тулбара для скрытия: `"save"`, `"undo"`, `"redo"` |
| `columnWidths` | `Record<string, number>` | — | Сохранённые ширины колонок (`columnName → px`) |
| `striped` | `boolean` | `false` | Зебра — чередующаяся расцветка строк |
| `theme` | `"light" \| "dark"` | `"light"` | Тема таблицы |
| `serverSide` | `boolean` | `false` | Сортировка/фильтрация на сервере |
| `onApplySortFilter` | `(snapshot: SortFilterSnapshot) => void` | — | Применение сортировки/фильтра (при `serverSide`) |
| `onClearSortFilter` | `(snapshot: SortFilterSnapshot) => void` | — | Сброс сортировки/фильтра (при `serverSide`) |
| `sortFilter` | `SortFilterSnapshot` | — | Текущее состояние сортировки/фильтра (индикаторы в шапке) |
| `pagination` | `PaginationConfig` | — | Конфигурация server-side пагинации |

### `ColumnDef`

| Поле | Тип | Описание |
| --- | --- | --- |
| `name` | `string` | Уникальное имя колонки — ключ значений в `data` |
| `label` | `string` | Заголовок колонки |
| `type` | `ColumnType` | `"text" \| "number" \| "boolean" \| "select" \| "date" \| "datetime" \| "array" \| "json"` (default: `"text"`) |
| `width` | `number` | Ширина в px. Без неё колонки делят свободное место поровну |
| `color` | `string \| (value) => string \| null` | Цвет текста ячеек |
| `backgroundColor` | `string \| (value) => string \| null` | Цвет заливки ячеек |
| `readOnly` | `boolean` | Колонка только для чтения |
| `align` | `"left" \| "center" \| "right"` | Выравнивание (default: right для number, center для boolean) |
| `options` | `SelectOption[]` | Пункты для `type: "select"` |
| `decimals` | `number` | Знаков после запятой для `number` |
| `subtype` | `"text" \| "number"` | Тип элементов для `type: "array"` |
| `children` | `ColumnDef[]` | Вложенные колонки — многоуровневая шапка |
| `visible` | `boolean` | Скрыть колонку |
| `nullable` | `boolean` | Разрешить `null` (для boolean — третье состояние) |
| `default` | `ScalarCellValue` | Значение по умолчанию для новых строк |
| `validationRules` | `ValidationRules` | Клиентская валидация |
| `fixed` | `"left" \| "right"` | Зафиксировать колонку при горизонтальном скролле |

### `ValidationRules`

| Поле | Тип | Описание |
| --- | --- | --- |
| `required` | `boolean` | Обязательное значение |
| `pattern` | `string` | Регулярное выражение |
| `patternMessage` | `string` | Сообщение при несоответствии pattern |
| `minLength` / `maxLength` | `number` | Минимальная/максимальная длина |
| `unique` | `boolean` | Уникальность значения в колонке |

### Типы колбэков

```ts
type ChangeItem =
  | { createdRowId: string | number; columnName: string; value: ScalarCellValue }
  | { updatedRowId: string | number; columnName: string; value: ScalarCellValue }
  | { deletedRowId: string | number };

interface LayoutData {
  widths: Record<string, number>; // columnName → px
}

interface PaginationConfig {
  page: number;              // 0-based
  pageSize: number;
  total: number;
  pageSizeOptions: number[];
  onPageChange: (page: number, pageSize: number) => void;
}
```

## Клавиатура

| Комбинация | Действие |
| --- | --- |
| Стрелки / Tab / Enter | Навигация по ячейкам |
| Любая буква/цифра | Начать редактирование |
| Enter / Tab | Завершить редактирование |
| Esc | Отменить редактирование |
| Ctrl+Z / Ctrl+Y | Отменить / вернуть |
| Ctrl+S | Сохранить |
| Ctrl+C / Ctrl+V / Ctrl+X | Копировать / вставить / вырезать |
| Delete | Очистить выделение |

## Демо и тесты

```bash
npm run demo   # демо-стенд (http://localhost:5173) со всеми примерами и разделом API
npm test       # тесты (vitest + testing-library)
npm run build  # сборка (tsc + styles.css)
```

## Архитектура

- `NativeTable` (React-обёртка) — data/columns → `NativeSheet`, колбэки в структурированном виде
- `NativeSheet` — координатор: модель, представление, редактор, выделение, undo, попапы
- `Renderer` — нативный DOM + виртуализация строк и столбцов, фиксированные слои
- `SheetModel` — данные ячеек в A1-ключ → значение
- `SheetView` — сортировка/фильтрация (rowMap)
- `Editor` — редакторы по типам колонок
- `UndoManager` — стек изменений данных (только значения ячеек)
