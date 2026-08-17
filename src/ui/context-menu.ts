// ── Контекстное меню таблицы ─────────────────────────────────────────────────
//
// Один экземпляр на таблицу; DOM живёт в document.body (чтобы не обрезался
// overflow:hidden контейнера). Пункты передаются при каждом открытии.

import { onDismiss, positionInViewport } from "./popup-utils";

export interface ContextMenuItem {
	/** "sep" — разделитель (label/action не нужны) */
	type?: "sep";
	label?: string;
	action?: () => void;
}

export class ContextMenu {
	private el: HTMLDivElement;
	private disposeDismiss: (() => void) | null = null;

	constructor(theme?: "light" | "dark") {
		this.el = document.createElement("div");
		this.el.className = `nt-context-menu${theme === "dark" ? " nt-dark" : ""}`;
		this.el.style.display = "none";
		document.body.append(this.el);
	}

	/** Обновить тему уже созданного меню. */
	setTheme(theme: "light" | "dark"): void {
		this.el.classList.toggle("nt-dark", theme === "dark");
	}

	open(items: ContextMenuItem[], clientX: number, clientY: number): void {
		this.close();
		this.el.replaceChildren();

		for (const item of items) {
			if (item.type === "sep") {
				const sep = document.createElement("div");
				sep.className = "nt-context-menu-sep";
				this.el.append(sep);
				continue;
			}
			const el = document.createElement("div");
			el.className = "nt-context-menu-item";
			el.textContent = item.label ?? "";
			el.addEventListener("mousedown", (ev) => { ev.preventDefault(); ev.stopPropagation(); });
			el.addEventListener("click", () => { this.close(); item.action?.(); });
			this.el.append(el);
		}

		// Показать скрытым, чтобы измерить размеры для позиционирования
		this.el.style.visibility = "hidden";
		this.el.style.display = "block";
		positionInViewport(this.el, clientX, clientY);
		this.el.style.visibility = "visible";

		this.disposeDismiss = onDismiss(() => [this.el], () => this.close());
	}

	close(): void {
		this.disposeDismiss?.();
		this.disposeDismiss = null;
		this.el.style.display = "none";
	}

	destroy(): void {
		this.close();
		this.el.remove();
	}
}
