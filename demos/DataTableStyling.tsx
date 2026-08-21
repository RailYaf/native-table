import { useState } from "react";
import { NativeTable } from "../src";
import type { ColumnDef, LayoutData } from "../src/utils/types";

const columns: ColumnDef[] = [
	{ name: "project", label: "Проект", width: 180 },
	{ name: "manager", label: "Менеджер", width: 160 },
	{ name: "progress", label: "Готовность, %", type: "number", width: 140,
		color: (v) => {
			const n = Number(v);
			if (n >= 100) return "#1e7e34";
			if (n < 30) return "#a94442";
			return null;
		},
	},
	{ name: "status", label: "Статус", type: "select", width: 140, options: [
		{ value: "on-track", label: "В графике" },
		{ value: "at-risk", label: "Под риском" },
		{ value: "delayed", label: "Задерживается" },
	],
	backgroundColor: (v) => {
		switch (v) {
			case "at-risk": return "#fff3cd";
			case "delayed": return "#f8d7da";
			default: return null;
		}
	} },
];

const initialData = [
	{ id: 1, project: "Мобильное приложение", manager: "Иванов", progress: 80, status: "on-track" },
	{ id: 2, project: "Портал ДБО", manager: "Петрова", progress: 45, status: "at-risk" },
	{ id: 3, project: "Миграция БД", manager: "Сидоров", progress: 100, status: "on-track" },
	{ id: 4, project: "Интеграция CRM", manager: "Козлова", progress: 15, status: "delayed" },
];

export function DataTableStyling() {
	const [widths, setWidths] = useState<Record<string, number>>({});

	const handleLayout = (layout: LayoutData) => {
		setWidths(layout.widths);
	};

	return (
		<div className="demo-panel">
			<h3>Цвета колонок (color / backgroundColor) и сохранение ширин через onLayoutChange</h3>
			<NativeTable
				data={initialData}
				columns={columns}
				columnWidths={widths}
				onLayoutChange={handleLayout}
				style={{ maxHeight: 500 }}
			/>
		</div>
	);
}
