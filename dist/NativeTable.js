import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
/** Основной компонент: тулбар + таблица. */
export function NativeTable({ className, style, rows, cols, columns, tableName, initialData, defaultColWidth, defaultRowHeight, headerWidth, headerHeight, bufferRows, bufferCols, onChange, }) {
    /** Ссылка на контейнер таблицы (.nt-container). */
    const ref = useRef(null);
    /** Ссылка на экземпляр NativeSheet. */
    const sheetRef = useRef(null);
    /** Реф для onChange (чтобы не пересоздавать NativeSheet при смене колбэка). */
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    // Состояние color picker'ов (заливка и текст)
    const [lastBg, setLastBg] = useState("#c8e6c9");
    const [lastFg, setLastFg] = useState("#000000");
    // ── Mount: загрузка из IndexedDB → создание NativeSheet ───────────────────
    useEffect(() => {
        if (!ref.current || !tableName)
            return;
        let cancelled = false;
        loadState(tableName).then((data) => {
            if (cancelled || !ref.current)
                return;
            const sheet = new NativeSheet(ref.current, {
                rows, cols, columns, tableName, initialData, defaultColWidth, defaultRowHeight,
                headerWidth, headerHeight, bufferRows, bufferCols,
                initialWidths: data?.widths,
                initialHeights: data?.heights,
                initialStyles: data?.styles,
                onChange: (cells) => onChangeRef.current?.(cells),
            });
            sheetRef.current = sheet;
        });
        return () => { cancelled = true; sheetRef.current?.destroy(); sheetRef.current = null; };
    }, [rows, cols, tableName, defaultColWidth, defaultRowHeight, headerWidth, headerHeight, bufferRows, bufferCols]);
    // ── Реактивные пропсы: обновление данных/колонок без пересоздания таблицы ──
    useEffect(() => {
        if (sheetRef.current && initialData)
            sheetRef.current.setData(initialData);
    }, [initialData]);
    useEffect(() => {
        if (sheetRef.current && columns)
            sheetRef.current.setColumns(columns);
    }, [columns]);
    // ── Обработчик тулбара: делегирование по data-action ───────────────────────
    const onToolbar = useCallback((e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn)
            return;
        if (btn.dataset.action === "undo")
            sheetRef.current?.undo();
        else if (btn.dataset.action === "redo")
            sheetRef.current?.redo();
        else if (btn.dataset.action === "save")
            sheetRef.current?.save();
        else if (btn.dataset.action === "wrap")
            sheetRef.current?.toggleWrap();
        else if (btn.dataset.action === "bold")
            sheetRef.current?.toggleBold();
        else if (btn.dataset.action === "italic")
            sheetRef.current?.toggleItalic();
        else if (btn.dataset.action === "underline")
            sheetRef.current?.toggleUnderline();
        else if (btn.dataset.action === "align") {
            sheetRef.current?.showAlignPopup(e.clientX, e.clientY);
        }
    }, []);
    // ── Рендер ────────────────────────────────────────────────────────────────
    return (_jsxs("div", { className: `nt-table-wrapper ${className ?? ""}`, children: [_jsxs("div", { className: "nt-toolbar", onClick: onToolbar, children: [_jsxs("button", { className: "nt-tb-btn nt-tb-save", "data-action": "save", "data-tooltip": "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C (Ctrl+S)", children: ["\uD83D\uDCBE", _jsx("span", { className: "nt-tb-dot", style: { display: "none" } })] }), _jsx("span", { className: "nt-tb-sep" }), _jsx("button", { className: "nt-tb-btn", "data-action": "undo", disabled: true, "data-tooltip": "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C (Ctrl+Z)", children: "\u21A9" }), _jsx("button", { className: "nt-tb-btn", "data-action": "redo", disabled: true, "data-tooltip": "\u0412\u0435\u0440\u043D\u0443\u0442\u044C (Ctrl+Y)", children: "\u21AA" }), _jsx("span", { className: "nt-tb-sep" }), _jsx("button", { className: "nt-tb-btn", "data-action": "bold", "data-tooltip": "\u0416\u0438\u0440\u043D\u044B\u0439", children: "B" }), _jsx("button", { className: "nt-tb-btn", "data-action": "italic", "data-tooltip": "\u041A\u0443\u0440\u0441\u0438\u0432", children: _jsx("i", { children: "I" }) }), _jsx("button", { className: "nt-tb-btn", "data-action": "underline", "data-tooltip": "\u041F\u043E\u0434\u0447\u0451\u0440\u043A\u043D\u0443\u0442\u044B\u0439", children: "U" }), _jsx("span", { className: "nt-tb-sep" }), _jsx("button", { className: "nt-tb-btn", "data-action": "align", "data-tooltip": "\u0412\u044B\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u043D\u0438\u0435", children: "\u2261" }), _jsx("span", { className: "nt-tb-sep" }), _jsx("button", { className: "nt-tb-btn", "data-action": "wrap", "data-tooltip": "\u041F\u0435\u0440\u0435\u043D\u043E\u0441 \u0442\u0435\u043A\u0441\u0442\u0430", children: "\u21B2" }), _jsx("span", { className: "nt-tb-sep" }), _jsxs("label", { className: "nt-tb-btn nt-tb-color-btn", "data-tooltip": "\u0426\u0432\u0435\u0442 \u0437\u0430\u043B\u0438\u0432\u043A\u0438", children: ["\uD83C\uDFA8", _jsx("span", { className: "nt-tb-color-bar", style: { backgroundColor: lastBg } }), _jsx("input", { type: "color", className: "nt-tb-color", value: lastBg, onChange: (e) => { setLastBg(e.target.value); sheetRef.current?.setCellStyle({ background: e.target.value }); } })] }), _jsxs("label", { className: "nt-tb-btn nt-tb-color-btn", "data-tooltip": "\u0426\u0432\u0435\u0442 \u0442\u0435\u043A\u0441\u0442\u0430", children: [_jsx("strong", { children: "A" }), _jsx("span", { className: "nt-tb-color-bar", style: { backgroundColor: lastFg } }), _jsx("input", { type: "color", className: "nt-tb-color", value: lastFg, onChange: (e) => { setLastFg(e.target.value); sheetRef.current?.setCellStyle({ color: e.target.value }); } })] })] }), _jsx("div", { ref: ref, className: "nt-container", style: style })] }));
}
//# sourceMappingURL=NativeTable.js.map