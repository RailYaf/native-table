# NativeTable

Таблица в стиле Excel / Google Sheets, реализованная на нативном DOM без сторонних
UI-библиотек: виртуализация строк и столбцов, встроенные редакторы по типам колонок,
валидация, пагинация, undo/redo, темы.

React — только обёртка (`NativeTable`): весь движок (`NativeSheet`, рендерер, модель,
представление, редактор, undo) — это нативные классы на чистом TypeScript/DOM.
Ядро можно использовать и без React напрямую через `NativeSheet`.

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

| Проп | Тип | Обязательный | По умолчанию | Описание |
| --- | --- | --- | --- | --- |
| `data` | `Record<string, unknown>[]` | нет | `[]` | Массив строк. Каждая должна иметь поле-идентификатор |
| `columns` | `ColumnDef[]` | да | — | Описание колонок |
| `rowKey` | `string` | нет | `"id"` | Имя поля-идентификатора строки в `data` |
| `className` | `string` | нет | — | Класс враппера таблицы |
| `style` | `CSSProperties` | нет | — | Стили контейнера (обычно `maxHeight`) |
| `onChange` | `(allRows, changes) => void` | нет | — | Вызывается при любом изменении данных |
| `onSave` | `(allRows, changes) => void` | нет | — | Сохранение: Ctrl+S или кнопка. `changes` — гранулярные изменения |
| `onLayoutChange` | `(layout: LayoutData) => void` | нет | — | Изменение ширин колонок (для персистенции лейаута) |
| `loading` | `boolean` | нет | `false` | Спиннер загрузки |
| `disabledRows` | `number[]` | нет | `[]` | id строк, запрещённых к редактированию |
| `validationErrors` | `ValidationError[]` | нет | — | Внешние ошибки валидации (`rowId`, `columnName`, `message`) |
| `validationWarnings` | `ValidationError[]` | нет | — | Предупреждения (жёлтый индикатор) |
| `allowAddRows` | `boolean` | нет | `true` | Добавление новых строк внизу таблицы |
| `readOnly` | `boolean` | нет | `false` | Полный запрет редактирования, тулбар скрыт |
| `resizableColumns` | `boolean` | нет | `true` | Изменение ширины колонок перетаскиванием |
| `header` | `HeaderConfig` | нет | — | `ellipsis` — обрезка заголовков, `layout` — позиции label/иконки |
| `cell` | `CellConfig` | нет | — | `ellipsis`, `capLines` — обрезка текста ячеек |
| `hiddenToolbarActions` | `ToolbarButton[]` | нет | — | Кнопки тулбара для скрытия: `"save"`, `"undo"`, `"redo"` |
| `columnWidths` | `Record<string, number>` | нет | — | Сохранённые ширины колонок (`columnName → px`) |
| `striped` | `boolean` | нет | `false` | Зебра — чередующаяся расцветка строк |
| `theme` | `"light" \| "dark"` | нет | `"light"` | Тема таблицы |
| `serverSide` | `boolean` | нет | `false` | Сортировка/фильтрация на сервере |
| `onApplySortFilter` | `(snapshot: SortFilterSnapshot) => void` | нет | — | Применение сортировки/фильтра (при `serverSide`) |
| `onClearSortFilter` | `(snapshot: SortFilterSnapshot) => void` | нет | — | Сброс сортировки/фильтра (при `serverSide`) |
| `sortFilter` | `SortFilterSnapshot` | нет | — | Текущее состояние сортировки/фильтра (индикаторы в шапке) |
| `pagination` | `PaginationConfig` | нет | — | Конфигурация server-side пагинации |

### `ColumnDef`

| Поле | Тип | Обязательный | Описание |
| --- | --- | --- | --- |
| `name` | `string` | да | Уникальное имя колонки — ключ значений в `data` |
| `label` | `string` | нет | Заголовок колонки |
| `type` | `ColumnType` | нет | `"text" \| "number" \| "boolean" \| "select" \| "date" \| "datetime" \| "array" \| "json"` (default: `"text"`) |
| `width` | `number` | нет | Ширина в px. Без неё колонки делят свободное место поровну |
| `color` | `string \| (value) => string \| null` | нет | Цвет текста ячеек |
| `backgroundColor` | `string \| (value) => string \| null` | нет | Цвет заливки ячеек |
| `readOnly` | `boolean` | нет | Колонка только для чтения |
| `align` | `"left" \| "center" \| "right"` | нет | Выравнивание (default: right для number, center для boolean) |
| `options` | `SelectOption[]` | нет | Пункты для `type: "select"` |
| `decimals` | `number` | нет | Знаков после запятой для `number` |
| `subtype` | `"text" \| "number"` | нет | Тип элементов для `type: "array"` |
| `children` | `ColumnDef[]` | нет | Вложенные колонки — многоуровневая шапка |
| `visible` | `boolean` | нет | Скрыть колонку |
| `nullable` | `boolean` | нет | Разрешить `null` (для boolean — третье состояние) |
| `default` | `ScalarCellValue` | нет | Значение по умолчанию для новых строк |
| `validationRules` | `ValidationRules` | нет | Клиентская валидация |
| `fixed` | `"left" \| "right"` | нет | Зафиксировать колонку при горизонтальном скролле |

### `ValidationRules`

| Поле | Тип | Обязательный | Описание |
| --- | --- | --- | --- |
| `required` | `boolean` | нет | Обязательное значение |
| `pattern` | `string` | нет | Регулярное выражение |
| `patternMessage` | `string` | нет | Сообщение при несоответствии pattern |
| `minLength` / `maxLength` | `number` | нет | Минимальная/максимальная длина |
| `unique` | `boolean` | нет | Уникальность значения в колонке |

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

Ядро нативное (чистый TypeScript + DOM, без React): `NativeSheet` создаётся в любой
контейнер и работает сам по себе. React-обёртка `NativeTable` отвечает только за
жизненный цикл: `data`/`columns` → `NativeSheet` и колбэки в структурированном виде.

- `NativeTable` (React-обёртка) — конвертация пропсов, подписки, пересоздание по данным
- `NativeSheet` — нативный координатор: модель, представление, редактор, выделение, undo, попапы
- `Renderer` — нативный DOM + виртуализация строк и столбцов, фиксированные слои
- `SheetModel` — данные ячеек в A1-ключ → значение
- `SheetView` — сортировка/фильтрация (rowMap)
- `Editor` — редакторы по типам колонок
- `UndoManager` — стек изменений данных (только значения ячеек)
