import { useState } from "react";
import { NativeTable } from "../src";
import type { ColumnDef } from "../src/utils/types";

const columns: ColumnDef[] = [
	{ name: "account", label: "Счёт", width: 160, readOnly: true },
	{ name: "owner", label: "Владелец", width: 180 },
	{ name: "currency", label: "Валюта", width: 90, readOnly: true },
	{ name: "balance", label: "Остаток", type: "number", decimals: 2, width: 130 },
	{ name: "opened", label: "Открыт", type: "date", width: 120 },
	{ name: "branch", label: "Филиал", width: 140 },
	{ name: "frozen", label: "Заморожен", type: "boolean", width: 110 },
];

const initialData = [
	{ id: 1, account: "40817-810-1-0001", owner: "ООО «Вектор»", currency: "₽", balance: 1254000.5, opened: "2024-03-15", branch: "Центральный", frozen: false },
	{ id: 2, account: "40817-810-1-0002", owner: "ИП Смирнов", currency: "₽", balance: 84320.18, opened: "2025-01-20", branch: "Северо-Западный", frozen: false },
	{ id: 3, account: "40817-810-1-0003", owner: "АО «Прогресс»", currency: "₽", balance: 0, opened: "2023-11-02", branch: "Уральский", frozen: true },
	{ id: 4, account: "40817-810-1-0004", owner: "ООО «Луч»", currency: "₽", balance: 230500.75, opened: "2025-07-09", branch: "Сибирский", frozen: false },
];

export function DataTableDisabledRows() {
	const [data, setData] = useState(initialData);
	return (
		<div className="demo-panel">
			<NativeTable
				data={data}
				columns={columns}
				onSave={(allRows) => setData(allRows as typeof initialData)}
				disabledRows={[2, 3]}
				allowAddRows={false}
				style={{ maxHeight: 500 }}
			/>
		</div>
	);
}
