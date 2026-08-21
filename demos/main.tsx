// ── Точка входа демо-стенда NativeTable ─────────────────────────────────────
//
// Запуск: npm run demo
// Слева — список примеров (как в antd demos), справа — выбранный пример.

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles.css";
import "./demos.css";

import { DataTableBasic } from "./DataTableBasic";
import { DataTableColumnTypes } from "./DataTableColumnTypes";
import { DataTableGroupedColumns } from "./DataTableGroupedColumns";
import { DataTableValidation } from "./DataTableValidation";
import { DataTablePagination } from "./DataTablePagination";
import { DataTableReadOnly } from "./DataTableReadOnly";
import { DataTableTheme } from "./DataTableTheme";
import { DataTableStyling } from "./DataTableStyling";

const demos = [
	{ id: "basic", title: "Basic", component: DataTableBasic },
	{ id: "column-types", title: "Типы колонок", component: DataTableColumnTypes },
	{ id: "grouped", title: "Группированные заголовки", component: DataTableGroupedColumns },
	{ id: "validation", title: "Валидация", component: DataTableValidation },
	{ id: "pagination", title: "Пагинация (server-side)", component: DataTablePagination },
	{ id: "readonly", title: "Только чтение / disabled", component: DataTableReadOnly },
	{ id: "theme", title: "Тёмная тема", component: DataTableTheme },
	{ id: "styling", title: "Стилизация ячеек", component: DataTableStyling },
];

function App() {
	const [activeId, setActiveId] = useState(demos[0].id);
	const active = demos.find((d) => d.id === activeId)!;
	const Demo = active.component;

	return (
		<div className="demo-layout">
			<nav className="demo-sidebar">
				<h1>NativeTable</h1>
				{demos.map((d) => (
					<button
						key={d.id}
						className={`demo-nav-item${d.id === activeId ? " demo-nav-item--active" : ""}`}
						onClick={() => setActiveId(d.id)}
					>
						{d.title}
					</button>
				))}
			</nav>
			<main className="demo-main">
				<h2>{active.title}</h2>
				<Demo />
			</main>
		</div>
	);
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
