// ── Группированные заголовки: многоуровневая шапка через children ───────────

import { useState } from "react";
import { NativeTable } from "../src";
import type { ColumnDef } from "../src/utils/types";

const columns: ColumnDef[] = [
	{ name: "region", label: "Регион", fixed: "left", width: 130 },
	{
		label: "Продажи", children: [
			{ name: "salesQ1", label: "Q1", type: "number", width: 100 },
			{ name: "salesQ2", label: "Q2", type: "number", width: 100 },
			{ name: "salesQ3", label: "Q3", type: "number", width: 100 },
			{ name: "salesQ4", label: "Q4", type: "number", width: 100 },
		],
	},
	{
		label: "Персонал", children: [
			{ name: "employees", label: "Сотрудники", type: "number", width: 110 },
			{ name: "managers", label: "Руководители", type: "number", width: 120 },
		],
	},
	{ name: "budget", label: "Бюджет, млн ₽", type: "number", decimals: 1, width: 140 },
];

const initialData = [
	{ id: 1, region: "Центральный", salesQ1: 120.5, salesQ2: 134.2, salesQ3: 141.8, salesQ4: 156.3, employees: 342, managers: 21, budget: 210 },
	{ id: 2, region: "Северо-Западный", salesQ1: 87.4, salesQ2: 91.1, salesQ3: 95.6, salesQ4: 102.4, employees: 187, managers: 14, budget: 150 },
	{ id: 3, region: "Уральский", salesQ1: 64.2, salesQ2: 70.9, salesQ3: 68.3, salesQ4: 74.8, employees: 143, managers: 11, budget: 98 },
	{ id: 4, region: "Сибирский", salesQ1: 55.8, salesQ2: 60.1, salesQ3: 62.7, salesQ4: 66.0, employees: 121, managers: 9, budget: 86 },
	{ id: 5, region: "Дальневосточный", salesQ1: 31.6, salesQ2: 34.2, salesQ3: 33.9, salesQ4: 37.5, employees: 74, managers: 6, budget: 52 },
];

export function DataTableGroupedColumns() {
	const [data, setData] = useState(initialData);
	return (
		<div className="demo-panel">
			<h3>Вложенные колонки (children) + зафиксированная колонка «Регион» при горизонтальном скролле</h3>
			<NativeTable
				data={data}
				columns={columns}
				onSave={(allRows) => setData(allRows as typeof initialData)}
				style={{ maxHeight: 340 }}
			/>
			<p className="demo-note">Прокрутите таблицу вправо — колонка «Регион» останется на месте (fixed: "left").</p>
		</div>
	);
}
