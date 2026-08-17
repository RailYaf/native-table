// ── Общие утилиты для всплывающих панелей ────────────────────────────────────
//
// Все попапы (контекстное меню, сортировка/фильтр, выравнивание) выносятся
// в document.body, поэтому им нужны:
//   - экранирование пользовательских строк перед вставкой через innerHTML
//   - позиционирование с учётом границ окна
//   - единый механизм закрытия по клику вне/Escape с гарантированной отпиской

/** Экранировать строку для безопасной вставки в HTML (текст и значения атрибутов). */
export function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Разместить элемент в точке (clientX, clientY), не выходя за границы окна.
 * Элемент должен быть уже в DOM (нужны его размеры).
 */
export function positionInViewport(el: HTMLElement, clientX: number, clientY: number): void {
	const rect = el.getBoundingClientRect();
	const w = rect.width || 240;
	const h = rect.height || 340;
	el.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - w - 8))}px`;
	el.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - h - 8))}px`;
}

/**
 * Подписаться на закрытие попапа: mousedown вне указанных элементов или Escape.
 *
 * Возвращает функцию отписки — её ОБЯЗАТЕЛЬНО нужно вызвать при любом способе
 * закрытия попапа, иначе слушатели накапливаются на document.
 *
 * @param inside — функция, возвращающая элементы, клик внутри которых не закрывает попап
 *                 (функция, а не массив: дочерние попапы создаются позже подписки)
 */
export function onDismiss(inside: () => Array<Node | null | undefined>, onClose: () => void): () => void {
	const onMouseDown = (ev: MouseEvent) => {
		const target = ev.target as Node;
		for (const el of inside()) {
			if (el?.contains(target)) return;
		}
		onClose();
	};
	const onKeyDown = (ev: KeyboardEvent) => {
		if (ev.key === "Escape") onClose();
	};
	// Подписка откладывается: иначе тот же клик, что открыл попап, сразу его закроет
	const timer = window.setTimeout(() => {
		document.addEventListener("mousedown", onMouseDown, true);
		document.addEventListener("keydown", onKeyDown, true);
	}, 0);

	return () => {
		clearTimeout(timer);
		document.removeEventListener("mousedown", onMouseDown, true);
		document.removeEventListener("keydown", onKeyDown, true);
	};
}

/** Не давать mousedown/click «утечь» наружу (чтобы попап не закрыл сам себя). */
export function stopEventPropagation(el: HTMLElement): void {
	el.addEventListener("mousedown", (ev) => ev.stopPropagation());
	el.addEventListener("click", (ev) => ev.stopPropagation());
}
