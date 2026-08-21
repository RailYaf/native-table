// ── Валидация: клиентские правила, внешние ошибки, disabled-строки ──────────

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { NativeTable } from "../src";
import type { ColumnDef, ValidationError } from "../src/utils/types";
import { editCell, dblClickCell, findCell } from "./helpers";

const columns: ColumnDef[] = [
	{
		name: "email", label: "E-mail", width: 200,
		validationRules: {
			required: true,
			pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
			patternMessage: "Некорректный e-mail",
		},
	},
	{
		name: "login", label: "Логин", width: 150,
		validationRules: { required: true, unique: true, minLength: 3 },
	},
];

const data = [
	{ id: 1, email: "a@b.ru", login: "alpha" },
	{ id: 2, email: "c@d.ru", login: "beta" },
];

describe("NativeTable: валидация", () => {
	it("показывает клиентскую ошибку required при очистке ячейки", () => {
		const { container } = render(<NativeTable data={data} columns={columns} />);

		editCell(findCell(container, 0, 0), "");

		expect(findCell(container, 0, 0).querySelector(".nt-cell-error")).toBeTruthy();
		// Ошибки блокируют кнопку сохранения
		expect(container.querySelector('[data-action="save"]')).toBeDisabled();
	});

	it("показывает ошибку pattern при некорректном e-mail", () => {
		const { container } = render(<NativeTable data={data} columns={columns} />);

		editCell(findCell(container, 0, 0), "не-email");

		expect(findCell(container, 0, 0).querySelector(".nt-cell-error")).toBeTruthy();
		expect(container.querySelector('[data-action="save"]')).toBeDisabled();
	});

	it("снимает ошибку после исправления значения", () => {
		const { container } = render(<NativeTable data={data} columns={columns} />);

		const cell = findCell(container, 0, 0);
		editCell(cell, "");
		expect(cell.querySelector(".nt-cell-error")).toBeTruthy();

		editCell(findCell(container, 0, 0), "ok@ok.ru");
		expect(findCell(container, 0, 0).querySelector(".nt-cell-error")).not.toBeVisible();
		expect(container.querySelector('[data-action="save"]')).not.toBeDisabled();
	});

	it("ловит дубликат при unique", () => {
		const { container } = render(<NativeTable data={data} columns={columns} />);

		editCell(findCell(container, 1, 1), "alpha");

		expect(findCell(container, 1, 1).querySelector(".nt-cell-error")).toBeTruthy();
	});

	it("показывает внешние ошибки и предупреждения из пропсов", () => {
		const errors: ValidationError[] = [{ rowId: 1, columnName: "email", message: "E-mail занят" }];
		const warnings: ValidationError[] = [{ rowId: 2, columnName: "login", message: "Проверьте логин" }];
		const { container } = render(
			<NativeTable data={data} columns={columns} validationErrors={errors} validationWarnings={warnings} />,
		);

		expect(findCell(container, 0, 0).querySelector(".nt-cell-error")).toBeTruthy();
		expect(findCell(container, 1, 1).querySelector(".nt-cell-warning")).toBeTruthy();
		expect(container.querySelector('[data-action="save"]')).toBeDisabled();
	});

	it("не позволяет редактировать disabled-строки", () => {
		const onChange = vi.fn();
		const { container } = render(
			<NativeTable data={data} columns={columns} disabledRows={[2]} onChange={onChange} />,
		);

		const row = findCell(container, 1, 0).closest(".nt-row")!;
		expect(row.classList.contains("nt-row--disabled")).toBe(true);

		dblClickCell(findCell(container, 1, 0));
		expect(document.querySelector(".nt-editor")).toBeNull();
		expect(onChange).not.toHaveBeenCalled();
	});

	it("onSave не вызывается при активных ошибках", () => {
		const onSave = vi.fn();
		const { container } = render(<NativeTable data={data} columns={columns} onSave={onSave} />);

		editCell(findCell(container, 0, 0), "");
		fireEvent.click(container.querySelector('[data-action="save"]')!);

		expect(onSave).not.toHaveBeenCalled();
	});
});
