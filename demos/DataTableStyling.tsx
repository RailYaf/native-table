import { useState } from "react";
import { NativeTable } from "../src";
import type { ColumnDef, LayoutData } from "../src/utils/types";

const columns: ColumnDef[] = [
	{ name: "project", label: "Проект", width: 180 },
	{ name: "manager", label: "Менеджер", width: 140 },
	{ name: "deadline", label: "Срок", type: "date", width: 120 },
	{ name: "budget", label: "Бюджет, млн ₽", type: "number", decimals: 1, width: 130 },
	{ name: "progress", label: "Готовность, %", type: "number", width: 130,
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
	{ id: 1, project: "Мобильное приложение", manager: "Иванов", deadline: "2026-09-30", budget: 45.5, progress: 80, status: "on-track" },
	{ id: 2, project: "Портал ДБО", manager: "Петрова", deadline: "2026-10-15", budget: 32.0, progress: 45, status: "at-risk" },
	{ id: 3, project: "Миграция БД", manager: "Сидоров", deadline: "2026-08-25", budget: 12.8, progress: 100, status: "on-track" },
	{ id: 4, project: "Интеграция CRM", manager: "Козлова", deadline: "2026-11-05", budget: 20.3, progress: 15, status: "delayed" },
];

export function DataTableStyling() {
	const [widths, setWidths] = useState<Record<string, number>>({});

	const handleLayout = (layout: LayoutData) => {
		setWidths(layout.widths);
	};

	return (
		<div className="demo-panel">
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
