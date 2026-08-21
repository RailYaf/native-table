import { useMemo, useState } from "react";
import { NativeTable } from "../src";
import type { ColumnDef } from "../src/utils/types";

const columns: ColumnDef[] = [
	{ name: "order", label: "Заказ", width: 120 },
	{ name: "client", label: "Клиент", width: 180 },
	{ name: "date", label: "Дата", type: "date", width: 120 },
	{ name: "amount", label: "Сумма, ₽", type: "number", decimals: 2, width: 130 },
	{ name: "manager", label: "Менеджер", width: 140 },
	{ name: "comment", label: "Комментарий", width: 200 },
	{ name: "status", label: "Статус", type: "select", width: 140, options: [
		{ value: "new", label: "Новый" },
		{ value: "paid", label: "Оплачен" },
		{ value: "shipped", label: "Отгружен" },
	] },
];

const allOrders = Array.from({ length: 57 }, (_, i) => ({
	id: i + 1,
	order: `ORD-${String(i + 1).padStart(4, "0")}`,
	client: ["ООО «Вектор»", "ИП Смирнов", "АО «Прогресс»", "ООО «Луч»", "ИП Козлова"][i % 5],
	date: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
	amount: Math.round((15000 + i * 1730.5) * 100) / 100,
	manager: ["Иванов", "Петрова", "Сидоров"][i % 3],
	comment: i % 4 === 0 ? "Требует подтверждения клиента" : "",
	status: ["new", "paid", "shipped"][i % 3],
}));

export function DataTablePagination() {
	const [page, setPage] = useState(0);
	const [pageSize, setPageSize] = useState(10);

	const data = useMemo(
		() => allOrders.slice(page * pageSize, page * pageSize + pageSize),
		[page, pageSize],
	);

	return (
		<div className="demo-panel">
			<NativeTable
				data={data}
				columns={columns}
				style={{ maxHeight: 500 }}
				pagination={{
					page,
					pageSize,
					total: allOrders.length,
					pageSizeOptions: [5, 10, 25],
					onPageChange: (p, ps) => {
						setPageSize(ps);
						setPage(p);
					},
				}}
			/>
		</div>
	);
}
