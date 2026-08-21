import { useState } from "react";
import { NativeTable } from "../src";
import type { ColumnDef } from "../src/utils/types";

const columns: ColumnDef[] = [
	{ name: "account", label: "Счёт", width: 160 },
	{ name: "owner", label: "Владелец", width: 200 },
	{ name: "balance", label: "Остаток, ₽", type: "number", decimals: 2, width: 140 },
	{ name: "frozen", label: "Заморожен", type: "boolean", width: 120 },
];

const initialData = [
	{ id: 1, account: "40817-810-1-0001", owner: "ООО «Вектор»", balance: 1254000.5, frozen: false },
	{ id: 2, account: "40817-810-1-0002", owner: "ИП Смирнов", balance: 84320.18, frozen: false },
	{ id: 3, account: "40817-810-1-0003", owner: "АО «Прогресс»", balance: 0, frozen: true },
	{ id: 4, account: "40817-810-1-0004", owner: "ООО «Луч»", balance: 230500.75, frozen: false },
];

export function DataTableReadOnly() {
	const [data, setData] = useState(initialData);
	return (
		<div>
			<div className="demo-panel">
				<h3>Только чтение: редактирование и тулбар отключены</h3>
				<NativeTable
					data={initialData}
					columns={columns}
					readOnly
					allowAddRows={false}
					style={{ maxHeight: 500 }}
				/>
			</div>
			<div className="demo-panel">
				<h3>Заблокированные строки (id 2 и 3) и без добавления новых</h3>
				<NativeTable
					data={data}
					columns={columns}
					onSave={(allRows) => setData(allRows as typeof initialData)}
					disabledRows={[2, 3]}
					allowAddRows={false}
					style={{ maxHeight: 500 }}
				/>
			</div>
		</div>
	);
}
