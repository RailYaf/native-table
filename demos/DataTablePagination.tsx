import { useMemo, useState } from "react";
import { NativeTable } from "../src";
import type { ColumnDef } from "../src/utils/types";

const columns: ColumnDef[] = [
	{ name: "order", label: "Заказ", width: 120 },
	{ name: "client", label: "Клиент", width: 200 },
	{ name: "amount", label: "Сумма, ₽", type: "number", decimals: 2, width: 130 },
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
	amount: Math.round((15000 + i * 1730.5) * 100) / 100,
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
			<h3>Серверная пагинация: данные страницы приходят извне, всего {allOrders.length} записей</h3>
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
