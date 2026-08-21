import { useState } from "react";
import { NativeTable } from "../src";

const columns = [
	{ name: "name", label: "Название", width: 180 },
	{ name: "category", label: "Категория", width: 140 },
	{ name: "supplier", label: "Поставщик", width: 160 },
	{ name: "price", label: "Цена, ₽", type: "number" as const, decimals: 2 },
	{ name: "quantity", label: "Кол-во", type: "number" as const },
	{ name: "delivery", label: "Поставка", type: "date" as const, width: 130 },
	{ name: "active", label: "Активен", type: "boolean" as const },
];

const initialData = [
	{ id: 1, name: "Монитор Dell U2723QE", category: "Электроника", supplier: "ООО «ТехноТрейд»", price: 54990, quantity: 12, delivery: "2026-08-01", active: true },
	{ id: 2, name: "Клавиатура Keychron K8", category: "Электроника", supplier: "ИП Ковалёв", price: 7990, quantity: 34, delivery: "2026-08-05", active: true },
	{ id: 3, name: "Стул Herman Miller Aeron", category: "Мебель", supplier: "АО «ОфисКомплект»", price: 129990, quantity: 3, delivery: "2026-08-12", active: false },
	{ id: 4, name: "Лампа настольная Xiaomi", category: "Освещение", supplier: "ООО «СветПро»", price: 2490, quantity: 56, delivery: "2026-08-15", active: true },
];

export function DataTableBasic() {
	const [data, setData] = useState(initialData);

	const handleSave = (allRows: Record<string, unknown>[]) => {
		setData(allRows as typeof initialData);
	};

	return (
		<div className="demo-panel">
			<NativeTable
				data={data}
				columns={columns}
				onSave={handleSave}
				style={{ maxHeight: 500 }}
			/>
		</div>
	);
}
