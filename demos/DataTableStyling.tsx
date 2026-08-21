// ── Стилизация ячеек: cellStyles, тулбар с цветом заливки/текста ───────────

import { useState } from "react";
import { NativeTable } from "../src";
import type { CellStyle, ColumnDef, LayoutData } from "../src/utils/types";

const columns: ColumnDef[] = [
	{ name: "project", label: "Проект", width: 180 },
	{ name: "manager", label: "Менеджер", width: 160 },
	{ name: "progress", label: "Готовность, %", type: "number", width: 140 },
	{ name: "status", label: "Статус", type: "select", width: 140, options: [
		{ value: "on-track", label: "В графике" },
		{ value: "at-risk", label: "Под риском" },
		{ value: "delayed", label: "Задерживается" },
	] },
];

const initialData = [
	{ id: 1, project: "Мобильное приложение", manager: "Иванов", progress: 80, status: "on-track" },
	{ id: 2, project: "Портал ДБО", manager: "Петрова", progress: 45, status: "at-risk" },
	{ id: 3, project: "Миграция БД", manager: "Сидоров", progress: 100, status: "on-track" },
	{ id: 4, project: "Интеграция CRM", manager: "Козлова", progress: 15, status: "delayed" },
];

// Стили, сохранённые ранее (ключ: columnName|rowId)
const initialStyles: Record<string, CellStyle> = {
	"status|2": { background: "#fff3cd", color: "#8a6d00" },
	"status|4": { background: "#f8d7da", color: "#a94442" },
	"progress|1": { background: "#d4edda", color: "#1e7e34" },
};

export function DataTableStyling() {
	const [cellStyles, setCellStyles] = useState(initialStyles);
	const [widths, setWidths] = useState<Record<string, number>>({});
	const [log, setLog] = useState("");

	const handleLayout = (layout: LayoutData) => {
		// Персистенция лейаута: в реальном приложении — сохранение в IndexedDB/на сервер
		setWidths(layout.widths);
		setCellStyles(layout.styles);
	};

	return (
		<div className="demo-panel">
			<h3>Тулбар с заливкой и цветом текста, сохранение лейаута через onLayoutChange</h3>
			<NativeTable
				data={initialData}
				columns={columns}
				cellStyles={cellStyles}
				columnWidths={widths}
				onLayoutChange={handleLayout}
				onSave={(_, changes) => setLog(JSON.stringify(changes, null, 2))}
				style={{ maxHeight: 300 }}
			/>
			<p className="demo-note">Выделите ячейку и выберите цвет в тулбаре — стиль попадёт в onLayoutChange и «переживёт» перерисовку. Правки данных сохраняются через Ctrl+S.</p>
			{log && <div className="demo-log">onSave changes:\n{log}</div>}
		</div>
	);
}
