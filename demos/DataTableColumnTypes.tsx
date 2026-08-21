import { useState } from "react";
import { NativeTable } from "../src";
import type { ColumnDef } from "../src/utils/types";

const columns: ColumnDef[] = [
	{ name: "task", label: "Задача", width: 200 },
	{
		name: "status", label: "Статус", type: "select", width: 150,
		options: [
			{ value: "todo", label: "К выполнению" },
			{ value: "progress", label: "В работе" },
			{ value: "done", label: "Готово" },
			{ value: "blocked", label: "Заблокировано" },
		],
	},
	{ name: "due", label: "Срок", type: "date", width: 130 },
	{ name: "remindAt", label: "Напоминание", type: "datetime", width: 170 },
	{ name: "progress", label: "Прогресс, %", type: "number", decimals: 0 },
	{ name: "billable", label: "Оплачивается", type: "boolean" },
	{ name: "tags", label: "Теги", type: "array", subtype: "text", width: 160 },
	{ name: "meta", label: "Метаданные", type: "json", width: 200 },
];

const initialData = [
	{ id: 1, task: "Сверстать главную страницу", status: "done", due: "2026-08-10", remindAt: "2026-08-10T10:00", progress: 100, billable: true, tags: ["frontend", "design"], meta: { sprint: 12 } },
	{ id: 2, task: "Написать API клиента", status: "progress", due: "2026-08-22", remindAt: "2026-08-21T09:30", progress: 60, billable: true, tags: ["backend"], meta: { sprint: 13 } },
	{ id: 3, task: "Ревью кода", status: "todo", due: "2026-08-25", remindAt: null, progress: 0, billable: false, tags: [], meta: null },
	{ id: 4, task: "Починить CI", status: "blocked", due: null, remindAt: null, progress: 30, billable: true, tags: ["devops", "ci"], meta: { sprint: 13, urgent: true } },
];

export function DataTableColumnTypes() {
	const [data, setData] = useState(initialData);
	return (
		<div className="demo-panel">
			<NativeTable
				data={data}
				columns={columns}
				onSave={(allRows) => setData(allRows as typeof initialData)}
				style={{ maxHeight: 500 }}
			/>
		</div>
	);
}
