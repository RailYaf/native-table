// ── Перетаскивание мышью и автопрокрутка ─────────────────────────────────────

/** Ширина зоны у края вьюпорта, в которой начинается автопрокрутка, px. */
const AUTOSCROLL_MARGIN = 30;
/** Коэффициент скорости автопрокрутки. */
const AUTOSCROLL_SPEED = 0.02;

/**
 * Сессия перетаскивания: слушатели на window живут до отпускания кнопки.
 * Возвращает функцию принудительного завершения (нужна в destroy()).
 */
export function startDragSession(
	onMove: (_ev: MouseEvent) => void,
	onUp?: (_ev: MouseEvent) => void,
): () => void {
	let finished = false;
	const finish = (ev?: MouseEvent) => {
		if (finished) return;
		finished = true;
		window.removeEventListener("mousemove", onMove);
		window.removeEventListener("mouseup", handleUp);
		onUp?.(ev ?? new MouseEvent("mouseup"));
	};
	const handleUp = (ev: MouseEvent) => finish(ev);

	window.addEventListener("mousemove", onMove);
	window.addEventListener("mouseup", handleUp);
	return () => finish();
}

/**
 * Автопрокрутка вьюпорта, когда курсор при перетаскивании уходит за его край.
 *
 * Использование: begin(onTick) при старте drag, update(ev) на каждом mousemove,
 * end() при отпускании. onTick вызывается на каждом кадре прокрутки с последним
 * событием мыши — чтобы выделение продолжало расширяться, пока курсор стоит.
 */
export class AutoScroller {
	private raf: number | null = null;
	private dx = 0;
	private dy = 0;
	private lastEvent: MouseEvent | null = null;
	private onTick: ((_ev: MouseEvent) => void) | null = null;

	constructor(private viewport: HTMLElement) {}

	begin(onTick: (_ev: MouseEvent) => void): void {
		this.onTick = onTick;
	}

	update(ev: MouseEvent): void {
		this.lastEvent = ev;
		const rect = this.viewport.getBoundingClientRect();
		const x = ev.clientX - rect.left;
		const y = ev.clientY - rect.top;

		this.dx = 0;
		this.dy = 0;
		if (x < AUTOSCROLL_MARGIN) this.dx = x - AUTOSCROLL_MARGIN;
		else if (x > rect.width - AUTOSCROLL_MARGIN) this.dx = x - rect.width + AUTOSCROLL_MARGIN;
		if (y < AUTOSCROLL_MARGIN) this.dy = y - AUTOSCROLL_MARGIN;
		else if (y > rect.height - AUTOSCROLL_MARGIN) this.dy = y - rect.height + AUTOSCROLL_MARGIN;

		if (this.dx === 0 && this.dy === 0) return;
		if (this.raf === null) this.raf = requestAnimationFrame(this.step);
	}

	end(): void {
		if (this.raf !== null) {
			cancelAnimationFrame(this.raf);
			this.raf = null;
		}
		this.onTick = null;
		this.lastEvent = null;
		this.dx = 0;
		this.dy = 0;
	}

	private step = (): void => {
		if (this.raf === null) return;
		const speed = Math.max(1, Math.abs(this.dx) + Math.abs(this.dy));
		this.viewport.scrollLeft += this.dx * AUTOSCROLL_SPEED * speed;
		this.viewport.scrollTop += this.dy * AUTOSCROLL_SPEED * speed;
		if (this.lastEvent) this.onTick?.(this.lastEvent);
		this.raf = requestAnimationFrame(this.step);
	};
}
