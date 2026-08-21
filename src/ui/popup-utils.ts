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

/**
 * Видимый прямоугольник скролл-вьюпорта в координатах host-слоя (cellsLayer).
 * Внутритабличные попапы (select-дропдаун, календарь) позиционируются
 * в координатах cellsLayer, поэтому границы видимости считаем от него:
 * слой смещён вправо на INDEX_HEADER_WIDTH внутри прокручиваемой области.
 */
export function hostViewport(
	host: HTMLElement,
): { left: number; top: number; right: number; bottom: number } {
	const body = host.closest<HTMLElement>(".nt-body") ?? host;
	const offsetX = parseFloat(host.style.left ?? "0") || 0;
	return {
		left: body.scrollLeft - offsetX,
		top: body.scrollTop,
		right: body.scrollLeft + body.clientWidth - offsetX,
		bottom: body.scrollTop + body.clientHeight,
	};
}

/**
 * Разместить попап размера popupW×popupH возле ячейки box, не выходя за
 * видимый вьюпорт: если не влезает справа — выравниваем правый край попапа
 * по правому краю ячейки; если не влезает снизу — показываем над ячейкой.
 * Координаты — в той же системе, что и box (cellsLayer).
 */
export function flipNearBox(
	box: { left: number; top: number; width: number; height: number },
	popupW: number,
	popupH: number,
	viewport: { left: number; top: number; right: number; bottom: number },
): { left: number; top: number } {
	let left = box.left;
	if (left + popupW > viewport.right) {
		left = Math.max(viewport.left, box.left + box.width - popupW);
	}

	let top = box.top + box.height;
	if (top + popupH > viewport.bottom) {
		top = box.top - popupH;
	}
	if (top < viewport.top) top = viewport.top;

	return { left, top };
}
