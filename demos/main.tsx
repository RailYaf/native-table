import { StrictMode, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles.css";
import "./demos.css";

import { DataTableBasic } from "./DataTableBasic";
import { DataTableColumnTypes } from "./DataTableColumnTypes";
import { DataTableManyColumns } from "./DataTableManyColumns";
import { DataTableManyRows } from "./DataTableManyRows";
import { DataTableGroupedColumns } from "./DataTableGroupedColumns";
import { DataTableFixedColumns } from "./DataTableFixedColumns";
import { DataTableValidation } from "./DataTableValidation";
import { DataTablePagination } from "./DataTablePagination";
import { DataTableReadOnly } from "./DataTableReadOnly";
import { DataTableDisabledRows } from "./DataTableDisabledRows";
import { DataTableTheme } from "./DataTableTheme";
import { DataTableStyling } from "./DataTableStyling";

interface DemoItem {
	id: string;
	title: string;
	component: ComponentType;
}

const demos: DemoItem[] = [
	{ id: "basic", title: "Базовый пример", component: DataTableBasic },
	{ id: "column-types", title: "Типы колонок", component: DataTableColumnTypes },
	{ id: "many-columns", title: "Виртуализация столбцов", component: DataTableManyColumns },
	{ id: "many-rows", title: "Виртуализация строк", component: DataTableManyRows },
	{ id: "grouped", title: "Группированная шапка", component: DataTableGroupedColumns },
	{ id: "fixed-columns", title: "Зафиксированные столбцы", component: DataTableFixedColumns },
	{ id: "validation", title: "Валидация", component: DataTableValidation },
	{ id: "pagination", title: "Пагинация", component: DataTablePagination },
	{ id: "disabled-rows", title: "Задизейбленные строки и столбцы", component: DataTableDisabledRows },
	{ id: "readonly", title: "Режим просмотра", component: DataTableReadOnly },
	{ id: "theme", title: "Смена темы", component: DataTableTheme },
	{ id: "styling", title: "Стилизация ячеек", component: DataTableStyling },
];

const getDemoId = (): string => {
	const id = window.location.hash.replace(/^#\/?/, "");
	return demos.some((d) => d.id === id) ? id : demos[0].id;
};

function App() {
	const [activeId, setActiveId] = useState(getDemoId);

	useEffect(() => {
		const onHash = () => setActiveId(getDemoId());
		window.addEventListener("hashchange", onHash);
		return () => window.removeEventListener("hashchange", onHash);
	}, []);

	const selectDemo = (id: string) => {
		window.location.hash = `/${id}`;
		setActiveId(id);
	};

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
						onClick={() => selectDemo(d.id)}
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
