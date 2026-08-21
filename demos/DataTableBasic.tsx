import { useState } from "react";
import { NativeTable } from "../src";
import type { ChangeItem } from "../src/utils/types";

const columns = [
	{ name: "name", label: "Название", width: 180 },
	{ name: "category", label: "Категория", width: 140 },
	{ name: "price", label: "Цена, ₽", type: "number" as const, decimals: 2 },
	{ name: "quantity", label: "Кол-во", type: "number" as const },
	{ name: "active", label: "Активен", type: "boolean" as const },
];

const initialData = [
	{ id: 1, name: "Монитор Dell U2723QE", category: "Электроника", price: 54990, quantity: 12, active: true },
	{ id: 2, name: "Клавиатура Keychron K8", category: "Электроника", price: 7990, quantity: 34, active: true },
	{ id: 3, name: "Стул Herman Miller Aeron", category: "Мебель", price: 129990, quantity: 3, active: false },
	{ id: 4, name: "Лампа настольная Xiaomi", category: "Освещение", price: 2490, quantity: 56, active: true },
];

export function DataTableBasic() {
	const [data, setData] = useState(initialData);
	const [log, setLog] = useState("");

	const handleSave = (allRows: Record<string, unknown>[], changes: ChangeItem[]) => {
		setLog(JSON.stringify(changes, null, 2));
		setData(allRows as typeof initialData);
	};

	return (
		<div className="demo-panel">
			<h3>Редактирование ячеек, добавление строк, Ctrl+Z/Y, сохранение по Ctrl+S</h3>
			<NativeTable
				data={data}
				columns={columns}
				onSave={handleSave}
				style={{ maxHeight: 500 }}
			/>
			{log && <div className="demo-log">onSave changes:\n{log}</div>}
		</div>
	);
}
