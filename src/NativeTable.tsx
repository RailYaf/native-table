// ── React-обёртка NativeTable ─────────────────────────────────────────────────
//
// Компонент управляет жизненным циклом NativeSheet:
//   1. useEffect → загружает состояние из IndexedDB
//   2. Создаёт NativeSheet и сохраняет в sheetRef
//   3. Рендерит тулбар (нативные кнопки с data-action)
//   4. Рендерит div-контейнер для NativeSheet (.nt-container)
//
// Тулбар использует делегирование событий: onClick на контейнере,
// action определяется по data-action у ближайшего родителя.

import { useCallback, useEffect, useRef, useState } from "react";
import { NativeSheet } from "./core/native-sheet";
import { loadState } from "./services/storage";
import type { Cell, NativeSheetOptions } from "./utils/types";

/** Пропсы компонента — расширяют NativeSheetOptions, добавляя className и style. */
export interface NativeTableProps extends Omit<NativeSheetOptions, "onChange"> {
	className?: string;
	style?: React.CSSProperties;
	onChange?: (allCells: Record<string, Cell>, changedCells: Record<string, { old: Cell | null; new: Cell | null }>, action?: import("./utils/types").ChangeAction) => void;
	/** Вызывается при нажатии Сохранить (Ctrl+S / кнопка) с текущими ячейками */
	onSave?: (cells: Record<string, Cell>) => void;
	/** Показать спиннер загрузки */
	loading?: boolean;
	/** Индексы строк, запрещённых к редактированию */
	disabledRows?: number[];
	/** Ошибки валидации: cellKey → сообщения */
	validationErrors?: Record<string, string[]>;
	/** Разрешить бесконечное добавление строк. false = только данные из dataSource */
	allowAddRows?: boolean;
	/** Таблица только для чтения (все ячейки — readonly, только Copy в меню) */
	readonly?: boolean;
	/** Текст подсказки (иконка info в тулбаре) */
	info?: string;
}

/** Основной компонент: тулбар + таблица. */
export function NativeTable({
	className,
	style,
	rows,
	cols,
	columns,
	tableName,
	initialData,
	defaultColWidth,
	defaultRowHeight,
	headerWidth,
	headerHeight,
	bufferRows,
	bufferCols,
	onChange,
	onSave,
	loading = false,
	disabledRows = [],
	validationErrors,
	allowAddRows = true,
	readonly: readOnlyTable,
	info,
}: NativeTableProps) {
	/** Ссылка на контейнер таблицы (.nt-container). */
	const ref = useRef<HTMLDivElement | null>(null);
	/** Ссылка на экземпляр NativeSheet. */
	const sheetRef = useRef<NativeSheet | null>(null);
	/** Реф для onChange (чтобы не пересоздавать NativeSheet при смене колбэка). */
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const onSaveRef = useRef(onSave);
	onSaveRef.current = onSave;
	const validationErrorsRef = useRef(validationErrors);
	validationErrorsRef.current = validationErrors;

	// Состояние color picker'ов (заливка и текст)
	const [lastBg, setLastBg] = useState("#c8e6c9");
	const [lastFg, setLastFg] = useState("#000000");

	// ── Mount: загрузка из IndexedDB → создание NativeSheet ───────────────────
	useEffect(() => {
		if (!ref.current || !tableName) return;
		let cancelled = false;
		loadState(tableName).then((data) => {
			if (cancelled || !ref.current) return;
			const sheet = new NativeSheet(ref.current, {
				rows, cols, columns, tableName, initialData, defaultColWidth, defaultRowHeight,
				headerWidth, headerHeight, bufferRows, bufferCols, disabledRows, allowAddRows,
				readonly: readOnlyTable,
				initialWidths: data?.widths as Record<string, number> | undefined,
				initialHeights: data?.heights as number[] | undefined,
				initialStyles: data?.styles as Record<string, import("./utils/types").CellStyle> | undefined,
				onChange: (cells, changed, action) => onChangeRef.current?.(cells, changed, action),
			});
			sheetRef.current = sheet;
			sheet.renderer.validationErrors = validationErrorsRef.current ?? {};
			sheet.renderer.validationErrors = validationErrorsRef.current ?? {};
			sheet.renderer.render(true);
		});
		return () => { cancelled = true; sheetRef.current?.destroy(); sheetRef.current = null; };
	}, [rows, cols, tableName, defaultColWidth, defaultRowHeight, headerWidth, headerHeight, bufferRows, bufferCols]);

	// ── Реактивные пропсы: обновление данных/колонок без пересоздания таблицы ──
	useEffect(() => {
		if (sheetRef.current && initialData) sheetRef.current.setData(initialData);
	}, [initialData]);

	useEffect(() => {
		if (sheetRef.current && columns) sheetRef.current.setColumns(columns ?? []);
	}, [columns]);

	// ── Ресайз окна: пересчитать фантомные строки/колонки ────────────────────
	useEffect(() => {
		const onResize = () => {
			requestAnimationFrame(() => sheetRef.current?.renderer?.render(true));
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	useEffect(() => {
		if (sheetRef.current) {
			sheetRef.current.renderer.validationErrors = validationErrors ?? {};
			sheetRef.current.renderer.render(true);
		}
	}, [validationErrors, tableName]);

	// ── Обработчик тулбара: делегирование по data-action ───────────────────────
	const onToolbar = useCallback((e: React.MouseEvent) => {
		const btn = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
		if (!btn) return;
			if (btn.dataset.action === "undo") sheetRef.current?.undo();
		else if (btn.dataset.action === "redo") sheetRef.current?.redo();
		else if (btn.dataset.action === "save") { sheetRef.current?.save(); onSaveRef.current?.(sheetRef.current?.getData() ?? {}); }
		else if (btn.dataset.action === "wrap") sheetRef.current?.toggleWrap();
		else if (btn.dataset.action === "bold") sheetRef.current?.toggleBold();
		else if (btn.dataset.action === "italic") sheetRef.current?.toggleItalic();
		else if (btn.dataset.action === "underline") sheetRef.current?.toggleUnderline();
		else if (btn.dataset.action === "align") { sheetRef.current?.showAlignPopup((e as unknown as MouseEvent).clientX, (e as unknown as MouseEvent).clientY); }
	}, []);

	// ── Рендер ────────────────────────────────────────────────────────────────

	return (
		<div className={`nt-table-wrapper ${className ?? ""}`} style={{ position: "relative" }}>
			{loading && (
				<div style={{
					position: "absolute", inset: 0, zIndex: 99,
					background: "rgba(255,255,255,0.6)", display: "flex",
					alignItems: "center", justifyContent: "center",
				}}>
					<div className="nt-loading-spinner" />
				</div>
			)}
			<div className="nt-toolbar" onClick={onToolbar}>
				<button className="nt-tb-btn nt-tb-save" data-action="save" data-tooltip="Сохранить (Ctrl+S)">💾<span className="nt-tb-dot" style={{display: "none"}} /></button>
				<span className="nt-tb-sep" />
				<button className="nt-tb-btn" data-action="undo" disabled data-tooltip="Отменить (Ctrl+Z)">↩</button>
				<button className="nt-tb-btn" data-action="redo" disabled data-tooltip="Вернуть (Ctrl+Y)">↪</button>
				<span className="nt-tb-sep" />
				<button className="nt-tb-btn" data-action="bold" data-tooltip="Жирный">B</button>
				<button className="nt-tb-btn" data-action="italic" data-tooltip="Курсив"><i>I</i></button>
				<button className="nt-tb-btn" data-action="underline" data-tooltip="Подчёркнутый">U</button>
				<span className="nt-tb-sep" />
				<button className="nt-tb-btn" data-action="align" data-tooltip="Выравнивание">≡</button>
				<span className="nt-tb-sep" />
				<button className="nt-tb-btn" data-action="wrap" data-tooltip="Перенос текста">↲</button>
				<span className="nt-tb-sep" />
				<label className="nt-tb-btn nt-tb-color-btn" data-tooltip="Цвет заливки">
					🎨
					<span className="nt-tb-color-bar" style={{backgroundColor: lastBg}} />
					<input type="color" className="nt-tb-color" value={lastBg}
						onChange={(e) => { setLastBg(e.target.value); sheetRef.current?.setCellStyle({ background: e.target.value }); }}
					/>
				</label>
				<label className="nt-tb-btn nt-tb-color-btn" data-tooltip="Цвет текста">
					<strong>A</strong>
					<span className="nt-tb-color-bar" style={{backgroundColor: lastFg}} />
					<input type="color" className="nt-tb-color" value={lastFg}
						onChange={(e) => { setLastFg(e.target.value); sheetRef.current?.setCellStyle({ color: e.target.value }); }}
					/>
				</label>
				{info && (
					<>
						<span className="nt-tb-sep" />
						<span className="nt-tb-btn nt-tb-info" data-tooltip={info}>ⓘ</span>
					</>
				)}
			</div>
			{/* Контейнер для NativeSheet — .nt-root создаётся внутри конструктора */}
			<div ref={ref} className="nt-container" style={style} />
		</div>
	);
}
