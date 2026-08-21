import { NativeTable } from "../src";
import type { ColumnDef } from "../src/utils/types";

const columns: ColumnDef[] = [
	{ name: "id", label: "ID", type: "number", width: 90 },
	{ name: "name", label: "Наименование", width: 260 },
	{ name: "category", label: "Категория", width: 140 },
	{ name: "price", label: "Цена, ₽", type: "number", decimals: 2, width: 130 },
	{ name: "quantity", label: "Кол-во", type: "number", width: 100 },
];

const CATEGORIES = ["Электроника", "Мебель", "Освещение", "Канцелярия", "Бытовая техника"];

const initialData = Array.from({ length: 1500 }, (_, i) => ({
	id: i + 1,
	name: `Товар ${String(i + 1).padStart(4, "0")}`,
	category: CATEGORIES[i % CATEGORIES.length],
	price: Math.round((500 + (i * 137.5) % 95000) * 100) / 100,
	quantity: (i * 7) % 200,
}));

export function DataTableManyRows() {
	return (
		<div className="demo-panel">
			<NativeTable
				data={initialData}
				columns={columns}
				allowAddRows={false}
				style={{ maxHeight: 500 }}
			/>
		</div>
	);
}
