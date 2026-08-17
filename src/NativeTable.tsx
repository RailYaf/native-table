// ── React-обёртка NativeTable ─────────────────────────────────────────────────
//
// Компонент управляет жизненным циклом NativeSheet:
//   1. Принимает data (массив объектов) + columns (ColumnDef[]) как публичный API
//   2. Внутри конвертирует data → rows/cols/initialData/rowIds для NativeSheet
//   3. Применяет заданные ширины/стили (columnWidths/cellStyles)
//   4. Создаёт NativeSheet и сохраняет в sheetRef
//   5. Рендерит тулбар (нативные кнопки с data-action)
//   6. Рендерит div-контейнер для NativeSheet (.nt-container)
//
// Колбэки onChange/onSave работают со структурированными данными
// (DataChange[] / SaveRow[]), а не с A1-ключами.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NativeSheet } from "./core/native-sheet";
import { SaveIcon, UndoIcon, RedoIcon, PaintBucketIcon, TextColorIcon } from "./ui/icons";
import { dataToCells, cellChangesToDataChanges, cellsToSaveRows, isTempRowId } from "./utils/data-convert";
import { validateCell } from "./utils/validation";
import { cellKey, colToLetter } from "./utils/cell-addr";
import { TOOLBAR_ICON_SIZE } from "./utils/consts";
import type { ChangeItem, ScalarCellValue, ToolbarButton, ValidationError } from "./utils/types";
import type { NativeTableProps } from "./types";

export function NativeTable({
	className,
	style,
	data = [],
	columns,
	onChange,
	onSave,
	loading = false,
	disabledRows = [],
	validationErrors,
	validationWarnings,
	allowAddRows = true,
	readOnly,
	resizableColumns,
	header,
	cell,
	toolbar,
	columnWidths,
	cellStyles,
	striped = false,
	theme,
	pagination,
	serverSide,
	onApplySortFilter,
	onClearSortFilter,
	sortFilter,
	rowKey = "id",
}: NativeTableProps) {
	const ref = useRef<HTMLDivElement | null>(null);
	const sheetRef = useRef<NativeSheet | null>(null);

	// ── Конвертация data → внутренний формат ───────────────────────────
	const converted = useMemo(
		() => dataToCells(data, columns, rowKey),
		[data, columns, rowKey],
	);

	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const onSaveRef = useRef(onSave);
	onSaveRef.current = onSave;
	const leafNamesRef = useRef(converted.leafNames);
	leafNamesRef.current = converted.leafNames;
	const rowIdsRef = useRef(converted.rowIds);
	rowIdsRef.current = converted.rowIds;
	const convertedRef = useRef(converted);
	convertedRef.current = converted;

	// Клиентская валидация
	const [clientErrors, setClientErrors] = useState<ValidationError[]>([]);
	const columnsRef = useRef(columns);
	columnsRef.current = columns;

	// Только hex: <input type="color"> не принимает CSS-переменные
	const [lastBg, setLastBg] = useState("#c8e6c9");
	const [lastFg, setLastFg] = useState("#000000");

	const effectiveAllowAddRows = readOnly ? false : allowAddRows;

	// ── Ошибки валидации → формат renderer ──────────────────────────
	const errMap = useMemo(() => {
		// Клиентские ошибки + серверные (серверные имеют приоритет при конфликте)
		const merged = new Map<string, string[]>();
		for (const e of clientErrors) {
			const k = `${e.columnName}|${e.rowId}`;
			if (!merged.has(k)) merged.set(k, []);
			merged.get(k)!.push(e.message);
		}
		for (const e of (validationErrors ?? [])) {
			const k = `${e.columnName}|${e.rowId}`;
			merged.set(k, [e.message]); // серверная ошибка перезаписывает клиентскую
		}
		const result: Record<string, string[]> = {};
		for (const [k, v] of merged) result[k] = v;
		return result;
	}, [clientErrors, validationErrors]);
	const errRef = useRef(errMap);
	errRef.current = errMap;

	const warnMap = useMemo(() => {
		const result: Record<string, string[]> = {};
		for (const w of (validationWarnings ?? [])) {
			const k = `${w.columnName}|${w.rowId}`;
			if (!result[k]) result[k] = [];
			result[k].push(w.message);
		}
		return result;
	}, [validationWarnings]);
	const warnRef = useRef(warnMap);
	warnRef.current = warnMap;

	// ── Mount/обновление: NativeSheet создаётся при первом появлении контейнера,
	//    дальше данные/колонки обновляются инкрементально (без пересоздания) ──
	useEffect(() => {
		// Плейсхолдер «Нет данных» рендерится без контейнера — ждём его появления
		if (!ref.current) return;

		// Контейнер пересоздан (плейсхолдер ↔ таблица) — пересоздать и таблицу
		if (sheetRef.current && sheetRef.current.renderer.container !== ref.current) {
			sheetRef.current.destroy();
			sheetRef.current = null;
		}

		if (!sheetRef.current) {
			const sheet = new NativeSheet(ref.current, {
				rows: converted.rows,
				cols: converted.cols,
				columns,
				initialData: converted.initialData,
				disabledRows,
				allowAddRows: effectiveAllowAddRows,
				readOnly,
				resizableColumns,
				header,
				cell,
				striped,
				pagination,
				serverSide,
				onApplySortFilter,
				onClearSortFilter,
				rowIds: converted.rowIds,
				columnWidths,
				cellStyles,
				sortFilter,
				theme,
				initialWarnings: warnMap,
				// Внутренний колбэк — нативный формат → конвертируем для пользователя
				onChange: (_cells, changed, _action) => {
					const leafNames = leafNamesRef.current;
					const rowIds = rowIdsRef.current;
					const cols = columnsRef.current;
					const changes = cellChangesToDataChanges(changed, leafNames, rowIds);
					if (changes.length > 0) {
						setClientErrors((prev) => {
							const next = prev.filter((e) =>
								!changes.some((ch) => ch.rowId === e.rowId && ch.columnName === e.columnName),
							);
							for (const ch of changes) {
								const colDef = cols.find((c) => c.name === ch.columnName);
								if (!colDef?.validationRules) continue;
								const ci = leafNames.indexOf(ch.columnName);
								const allVals: ScalarCellValue[] = [];
								if (colDef.validationRules.unique && ci >= 0) {
									const prefix = colToLetter(ci);
									for (const [key, cell] of Object.entries(_cells)) {
										if (key.startsWith(prefix)) allVals.push(cell.value ?? null);
									}
								}
								const msg = validateCell(ch.newValue, ch.oldValue, colDef.validationRules, allVals);
								if (msg) next.push({ rowId: ch.rowId, columnName: ch.columnName, message: msg });
							}
							return next;
						});
						onChangeRef.current?.(changes);
					}
				},
				onSave: (cells, layout) => {
					const leafNames = leafNamesRef.current;
					const rowIds = rowIdsRef.current;
					const rows = cellsToSaveRows(cells, leafNames, rowIds);

					// Все строки таблицы: { id, ...значения колонок }
					const allRows: Record<string, unknown>[] = rows.map((r) => ({ id: r.rowId, ...r.values }));

					// Гранулярные изменения для сохранения
					const changes: ChangeItem[] = [];

					// Удалённые строки: исходные rowId, которых больше нет среди текущих
					const savedIds = new Set(rows.map((r) => r.rowId));
					for (const id of rowIds) {
						if (!savedIds.has(id)) changes.push({ deletedRowId: id });
					}

					// База для diff существующих строк — исходные (типизированные) значения из data
					const initialData = convertedRef.current.initialData;
					const rowIndexById = new Map<string | number, number>();
					rowIds.forEach((id, idx) => rowIndexById.set(id, idx));

					for (const r of rows) {
						if (isTempRowId(r.rowId)) {
							// Новая строка: по элементу на каждую непустую ячейку
							for (const [columnName, value] of Object.entries(r.values)) {
								if (value !== null && value !== undefined) {
									changes.push({ createdRowId: r.rowId, columnName, value });
								}
							}
							continue;
						}
						// Существующая строка: diff с исходными данными по каждой колонке
						const dataIdx = rowIndexById.get(r.rowId);
						if (dataIdx === undefined) continue;
						for (let c = 0; c < leafNames.length; c++) {
							const columnName = leafNames[c];
							const prev = initialData[cellKey(dataIdx, c)]?.value ?? null;
							const value = r.values[columnName] ?? null;
							if (value === prev) continue;
							changes.push({ updatedRowId: r.rowId, columnName, value });
						}
					}

					onSaveRef.current?.(allRows, changes, layout);
				},
			});
			sheetRef.current = sheet;
			sheet.renderer.validationErrors = errRef.current ?? {};
			sheet.renderer.validationWarnings = warnRef.current ?? {};
			sheet.renderer.render(true);
			ref.current?.focus();
			return;
		}

		// Инкрементальное обновление уже созданной таблицы
		sheetRef.current.setColumns(columns);
		sheetRef.current.setData(converted.initialData);
		sheetRef.current.updateRowIds(converted.rowIds);
	}, [converted, columns]);

	// Уничтожить таблицу только при размонтировании компонента
	useEffect(() => {
		return () => { sheetRef.current?.destroy(); sheetRef.current = null; };
	}, []);

	// ── Сохранённый лейаут приходит асинхронно (IndexedDB) — применить после mount ──
	useEffect(() => {
		if (sheetRef.current && columnWidths) sheetRef.current.setColumnWidths(columnWidths);
	}, [columnWidths]);

	useEffect(() => {
		if (sheetRef.current && cellStyles) sheetRef.current.setCellStyles(cellStyles);
	}, [cellStyles]);

	// ── Ресайз контейнера: maxHeight извне меняется после mount → пересчитать окно ──
	useEffect(() => {
		if (!ref.current) return;
		const ro = new ResizeObserver(() => {
			requestAnimationFrame(() => sheetRef.current?.renderer?.render(true));
		});
		ro.observe(ref.current);
		return () => ro.disconnect();
	}, []);

	// ── Ресайз окна ──────────────────────────────────────────────────────────
	useEffect(() => {
		const onResize = () => {
			requestAnimationFrame(() => sheetRef.current?.renderer?.render(true));
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	// ── Пагинация ────────────────────────────────────────────────────────────
	useEffect(() => {
		if (sheetRef.current && pagination) sheetRef.current.updatePagination(pagination);
	}, [pagination]);

	// Пропсы-объекты: сравниваем по содержимому, иначе перерисовка на каждый рендер
	const errorsKey = useMemo(() => JSON.stringify(errMap), [errMap]);
	const disabledRowsKey = useMemo(() => disabledRows.join(","), [disabledRows]);

	useEffect(() => {
		if (sheetRef.current) {
			sheetRef.current.renderer.validationErrors = errRef.current ?? {};
			sheetRef.current.renderer.render(true);
		}
	}, [errorsKey]);

	const warningsKey = useMemo(() => JSON.stringify(warnMap), [warnMap]);
	useEffect(() => {
		if (sheetRef.current) {
			sheetRef.current.renderer.validationWarnings = warnRef.current ?? {};
			sheetRef.current.renderer.render(true);
		}
	}, [warningsKey]);

	useEffect(() => {
		if (sheetRef.current) {
			sheetRef.current.renderer.readOnly = readOnly ?? false;
			sheetRef.current.renderer.render(true);
		}
	}, [readOnly]);

	// Флаг ресайза колонок может меняться без пересоздания таблицы
	useEffect(() => {
		sheetRef.current?.setColumnResizable(resizableColumns ?? true);
	}, [resizableColumns]);

	useEffect(() => {
		if (sheetRef.current && !pagination) {
			sheetRef.current.renderer.allowAddRows = effectiveAllowAddRows;
			sheetRef.current.renderer.render(true);
		}
	}, [effectiveAllowAddRows, pagination]);

	useEffect(() => {
		if (sheetRef.current && header) {
			sheetRef.current.renderer.headerConfig = header;
			sheetRef.current.renderer.render(true);
		}
	}, [header]);

	useEffect(() => {
		if (sheetRef.current) {
			sheetRef.current.renderer.cellConfig = cell;
			sheetRef.current.renderer.render(true);
		}
	}, [cell]);

	// Тема переключается без пересоздания NativeSheet — обновляем таблицу и попапы
	useEffect(() => {
		sheetRef.current?.setTheme(theme ?? "light");
	}, [theme]);

	useEffect(() => {
		if (sheetRef.current) {
			const set = new Set(disabledRows);
			sheetRef.current.renderer.disabledRows = set;
			sheetRef.current.disabledRows = set;
			sheetRef.current.renderer.render(true);
		}
	}, [disabledRowsKey]);

	const hasErrors = errMap && Object.keys(errMap).length > 0;

	// ── Пагинация UI ──────────────────────────────────────────────────────────
	const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 0;
	const isFirstPage = pagination ? pagination.page === 0 : true;
	const isLastPage = pagination ? (pagination.page + 1) * pagination.pageSize >= pagination.total : true;

	const [pageInput, setPageInput] = useState(String(pagination ? pagination.page + 1 : 1));
	useEffect(() => {
		if (pagination) setPageInput(String(pagination.page + 1));
	}, [pagination?.page]);

	const handlePageInput = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key !== "Enter" || !pagination) return;
		const n = Number((e.target as HTMLInputElement).value);
		if (Number.isNaN(n) || n < 1) return;
		const page = Math.min(n - 1, totalPages - 1);
		setPageInput(String(page + 1));
		pagination.onPageChange(page, pagination.pageSize);
	}, [pagination, totalPages]);

	const handlePageSize = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
		pagination?.onPageChange(0, Number(e.target.value));
	}, [pagination]);

	const handlePrev = useCallback(() => {
		if (pagination && pagination.page > 0) pagination.onPageChange(pagination.page - 1, pagination.pageSize);
	}, [pagination]);

	const handleNext = useCallback(() => {
		if (pagination && (pagination.page + 1) * pagination.pageSize < pagination.total) {
			pagination.onPageChange(pagination.page + 1, pagination.pageSize);
		}
	}, [pagination]);

	// ── Тулбар: делегирование по data-action ──────────────────────────────────
	const onToolbar = useCallback((e: React.MouseEvent) => {
		const btn = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
		if (!btn) return;
			if (btn.dataset.action === "undo") sheetRef.current?.undo();
		else if (btn.dataset.action === "redo") sheetRef.current?.redo();
		else if (btn.dataset.action === "save") { if (!hasErrors) sheetRef.current?.save(); }
	}, [hasErrors]);

	// ── Рендер ────────────────────────────────────────────────────────────────

	if (!loading && !effectiveAllowAddRows && converted.rows === 0 && converted.cols === 0) {
		return (
			<div className={`nt-table-wrapper ${className ?? ""}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--nt-text-muted, #999)", fontSize: "14px", minHeight: "120px" }}>
				Нет данных
			</div>
		);
	}

	const iconSize = toolbar?.iconSize ?? TOOLBAR_ICON_SIZE;
	const hidden = toolbar?.hidden ?? [];
	const show = (name: ToolbarButton) => !hidden.includes(name);

	return (
		<div className={`nt-table-wrapper ${className ?? ""}${theme === "dark" ? " nt-dark" : ""}`} data-nt-theme={theme ?? "light"} style={{ position: "relative" }}
			onMouseDownCapture={() => {
				if (!sheetRef.current?.hasActiveEditor()) ref.current?.focus();
			}}
		>
			{loading && (
				<div className="nt-loading-overlay" style={{
					position: "absolute", inset: 0, zIndex: 99,
					display: "flex", alignItems: "center", justifyContent: "center",
				}}>
					<div className="nt-loading-spinner" />
				</div>
			)}
			<div className="nt-toolbar" onClick={onToolbar}>
				{show("save") && <button className="nt-tb-btn nt-tb-save" data-action="save" disabled={hasErrors} data-tooltip="Сохранить (Ctrl+S)"><SaveIcon size={iconSize} /><span className="nt-tb-dot" /></button>}
				{show("undo") && <button className="nt-tb-btn" data-action="undo" data-tooltip="Отменить (Ctrl+Z)"><UndoIcon size={iconSize} /></button>}
				{show("redo") && <button className="nt-tb-btn" data-action="redo" data-tooltip="Вернуть (Ctrl+Y)"><RedoIcon size={iconSize} /></button>}
				{show("background") && <label className="nt-tb-btn nt-tb-color-btn" data-tooltip="Цвет заливки">
					<PaintBucketIcon size={iconSize} />
					<span className="nt-tb-color-bar" style={{backgroundColor: lastBg}} />
					<input type="color" className="nt-tb-color" value={lastBg}
						onChange={(e) => { setLastBg(e.target.value); sheetRef.current?.setCellStyle({ background: e.target.value }); }}
					/>
				</label>}
				{show("textColor") && <label className="nt-tb-btn nt-tb-color-btn" data-tooltip="Цвет текста">
					<TextColorIcon size={iconSize} />
					<span className="nt-tb-color-bar" style={{backgroundColor: lastFg}} />
					<input type="color" className="nt-tb-color" value={lastFg}
						onChange={(e) => { setLastFg(e.target.value); sheetRef.current?.setCellStyle({ color: e.target.value }); }}
					/>
				</label>}
			</div>
			<div ref={ref} className={`nt-container nt-root${theme === "dark" ? " nt-dark" : ""}`} style={style} />
			{pagination && (
				<div className="nt-pagination">
					<div className="nt-pagination-right">
						<button className="nt-pagination-btn" disabled={isFirstPage} onClick={handlePrev}>◀</button>
						<input
							className="nt-pagination-input"
							value={pageInput}
							onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
							onKeyDown={handlePageInput}
							inputMode="numeric"
						/>
						<span className="nt-pagination-info">
							из {totalPages} (всего {pagination.total.toLocaleString()})
						</span>
						<button className="nt-pagination-btn" disabled={isLastPage} onClick={handleNext}>▶</button>
						<select className="nt-pagination-pagesize" value={pagination.pageSize} onChange={handlePageSize}>
							{pagination.pageSizeOptions.map((n) => (
								<option key={n} value={n}>{n.toLocaleString()}</option>
							))}
						</select>
					</div>
				</div>
			)}
		</div>
	);
}
