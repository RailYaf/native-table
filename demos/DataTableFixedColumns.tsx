import { NativeTable } from "../src";
import type { ColumnDef } from "../src/utils/types";

const columns: ColumnDef[] = [
	{ name: "branch", label: "Филиал", fixed: "left", width: 170 },
	{ name: "manager", label: "Менеджер", fixed: "left", width: 140 },
	...Array.from({ length: 12 }, (_, i) => ({
		name: `m${i + 1}`,
		label: `Месяц ${i + 1}`,
		type: "number" as const,
		width: 100,
	})),
	{ name: "total", label: "Итого", type: "number", decimals: 2, fixed: "right", width: 130 },
];

const BRANCHES = [
	["Центральный", "Иванов"],
	["Северо-Западный", "Петрова"],
	["Уральский", "Сидоров"],
	["Сибирский", "Козлова"],
	["Дальневосточный", "Морозов"],
	["Южный", "Николаева"],
];

const initialData = BRANCHES.map(([branch, manager], r) => {
	const row: Record<string, unknown> = { id: r + 1, branch, manager };
	let total = 0;
	for (let m = 0; m < 12; m++) {
		const value = Math.round((800 + (r + 1) * 340 + m * 75.5) * 10) / 10;
		row[`m${m + 1}`] = value;
		total += value;
	}
	row.total = Math.round(total * 100) / 100;
	return row;
});

export function DataTableFixedColumns() {
	return (
		<div className="demo-panel">
			<NativeTable
				data={initialData}
				columns={columns}
				style={{ maxHeight: 500 }}
			/>
		</div>
	);
}
