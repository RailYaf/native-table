import { useState } from "react";
import { NativeTable } from "../src";
import type { ColumnDef, ValidationError } from "../src/utils/types";

const columns: ColumnDef[] = [
	{
		name: "email", label: "E-mail", width: 220,
		validationRules: {
			required: true,
			pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
			patternMessage: "Некорректный e-mail",
		},
	},
	{
		name: "login", label: "Логин", width: 150,
		validationRules: { required: true, unique: true, minLength: 3, maxLength: 20 },
	},
	{ name: "age", label: "Возраст", type: "number", width: 100 },
	{ name: "department", label: "Отдел", width: 140 },
	{ name: "role", label: "Роль", type: "select", width: 140, options: [
		{ value: "admin", label: "Администратор" },
		{ value: "editor", label: "Редактор" },
		{ value: "viewer", label: "Наблюдатель" },
	] },
];

const initialData = [
	{ id: 1, email: "ivanov@example.com", login: "ivanov", age: 34, department: "Разработка", role: "admin" },
	{ id: 2, email: "petrova@example.com", login: "petrova", age: 28, department: "Аналитика", role: "editor" },
	{ id: 3, email: "sidorov@example.com", login: "sidorov", age: 41, department: "Тестирование", role: "viewer" },
];

const serverErrors: ValidationError[] = [
	{ rowId: 3, columnName: "email", message: "E-mail уже используется" },
];

const serverWarnings: ValidationError[] = [
	{ rowId: 2, columnName: "age", message: "Проверьте возраст сотрудника" },
];

export function DataTableValidation() {
	const [data, setData] = useState(initialData);

	return (
		<div className="demo-panel">
			<NativeTable
				data={data}
				columns={columns}
				validationErrors={serverErrors}
				validationWarnings={serverWarnings}
				onSave={(allRows) => setData(allRows as typeof initialData)}
				style={{ maxHeight: 500 }}
			/>
		</div>
	);
}
