import { NativeTable } from "../src";
import type { ColumnDef } from "../src/utils/types";

const MONTH_NAMES = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

const MONTHS = Array.from({ length: 100 }, (_, i) => {
	const year = 2025 + Math.floor(i / 12);
	return `${MONTH_NAMES[i % 12]} ${year}`;
});

const columns: ColumnDef[] = [
	{ name: "branch", label: "Филиал", width: 170 },
	{ name: "manager", label: "Менеджер", width: 140 },
	...MONTHS.map((m, i) => ({
		name: `m${i + 1}`,
		label: m,
		type: "number" as const,
		width: 100,
	})),
	{ name: "total", label: "Итого", type: "number", decimals: 2, width: 130 },
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
	for (let m = 0; m < MONTHS.length; m++) {
		const value = Math.round((800 + (r + 1) * 340 + m * 75.5) * 10) / 10;
		row[`m${m + 1}`] = value;
		total += value;
	}
	row.total = Math.round(total * 100) / 100;
	return row;
});

export function DataTableManyColumns() {
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
