// ── Кастомный календарь выбора даты (и даты со временем) ──────────────────────
//
// Датапикер в стиле таблицы: месяц/год с навигацией, недели с понедельника,
// подсветка сегодняшнего дня и выбранной даты. При withTime=true справа
// появляется секция времени (часы и минуты, как в antd) и кнопка «Подтвердить»:
// день и время выбираются, а применяются только по кнопке. Живёт в host-слое
// ячейки (координаты — как у box редактора), закрывается по клику вне.

const MONTHS_RU = [
	"Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
	"Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const WEEKDAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

export function isoFromDate(d: Date): string {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function isoToDate(iso: string): Date | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
	if (!m) return null;
	const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	return Number.isNaN(d.getTime()) ? null : d;
}

export class DatePickerPopup {
	private el: HTMLDivElement;
	private titleEl: HTMLDivElement;
	private gridEl: HTMLDivElement;
	private timeHeaderEl: HTMLDivElement;
	private timeSection: HTMLDivElement;
	private hoursList: HTMLDivElement;
	private minutesList: HTMLDivElement;
	private confirmBtn: HTMLButtonElement;
	private viewYear = 0;
	private viewMonth = 0;
	private selectedISO = "";
	private withTime = false;
	private hours = 0;
	private minutes = 0;
	private onPick: (iso: string) => void = () => {};
	private onClose: () => void = () => {};
	private disposeDismiss: (() => void) | null = null;
	private openState = false;

	constructor(private host: HTMLElement) {
		this.el = document.createElement("div");
		this.el.className = "nt-date-picker";
		this.el.style.position = "absolute";
		this.el.style.zIndex = "100";
		this.el.style.display = "none";

		const header = document.createElement("div");
		header.className = "nt-date-picker-header";

		const prevBtn = document.createElement("button");
		prevBtn.type = "button";
		prevBtn.className = "nt-date-picker-nav";
		prevBtn.textContent = "‹";
		prevBtn.addEventListener("mousedown", (e) => e.preventDefault());
		prevBtn.addEventListener("click", () => this.shiftMonth(-1));

		this.titleEl = document.createElement("div");
		this.titleEl.className = "nt-date-picker-title";

		const nextBtn = document.createElement("button");
		nextBtn.type = "button";
		nextBtn.className = "nt-date-picker-nav";
		nextBtn.textContent = "›";
		nextBtn.addEventListener("mousedown", (e) => e.preventDefault());
		nextBtn.addEventListener("click", () => this.shiftMonth(1));

		header.append(prevBtn, this.titleEl, nextBtn);

		const weekdays = document.createElement("div");
		weekdays.className = "nt-date-picker-weekdays";
		for (const w of WEEKDAYS_RU) {
			const day = document.createElement("div");
			day.className = "nt-date-picker-weekday";
			day.textContent = w;
			weekdays.append(day);
		}

		this.gridEl = document.createElement("div");
		this.gridEl.className = "nt-date-picker-grid";

		// Секция времени (показывается только при withTime): своя шапка с выбранным
		// временем + колонки часов и минут, справа от календаря через разделитель
		this.timeHeaderEl = document.createElement("div");
		this.timeHeaderEl.className = "nt-date-picker-time-header";

		this.hoursList = document.createElement("div");
		this.hoursList.className = "nt-date-picker-time-col";
		this.minutesList = document.createElement("div");
		this.minutesList.className = "nt-date-picker-time-col";
		const timeLists = document.createElement("div");
		timeLists.className = "nt-date-picker-time-lists";
		timeLists.append(this.hoursList, this.minutesList);

		this.timeSection = document.createElement("div");
		this.timeSection.className = "nt-date-picker-time-section";
		this.timeSection.style.display = "none";
		this.timeSection.append(this.timeHeaderEl, timeLists);

		const body = document.createElement("div");
		body.className = "nt-date-picker-body";
		const calCol = document.createElement("div");
		calCol.className = "nt-date-picker-cal";
		calCol.append(header, weekdays, this.gridEl);
		body.append(calCol, this.timeSection);

		const footer = document.createElement("div");
		footer.className = "nt-date-picker-footer";
		const todayBtn = document.createElement("button");
		todayBtn.type = "button";
		todayBtn.textContent = "Сегодня";
		todayBtn.addEventListener("mousedown", (e) => e.preventDefault());
		todayBtn.addEventListener("click", () => this.pickDay(isoFromDate(new Date())));
		const clearBtn = document.createElement("button");
		clearBtn.type = "button";
		clearBtn.textContent = "Очистить";
		clearBtn.addEventListener("mousedown", (e) => e.preventDefault());
		clearBtn.addEventListener("click", () => this.onPick(""));
		const leftWrap = document.createElement("div");
		leftWrap.className = "nt-date-picker-footer-left";
		leftWrap.append(todayBtn, clearBtn);

		this.confirmBtn = document.createElement("button");
		this.confirmBtn.type = "button";
		this.confirmBtn.className = "nt-date-picker-confirm";
		this.confirmBtn.textContent = "Подтвердить";
		this.confirmBtn.style.display = "none";
		this.confirmBtn.addEventListener("mousedown", (e) => e.preventDefault());
		this.confirmBtn.addEventListener("click", () => this.confirm());

		footer.append(leftWrap, this.confirmBtn);

		this.el.append(body, footer);
		this.host.append(this.el);

		// mousedown внутри попапа не должен уводить фокус из редактора
		// (иначе клик по скроллу колонок времени закрывает попап)
		this.el.addEventListener("mousedown", (e) => e.preventDefault());
	}

	isOpen(): boolean {
		return this.openState;
	}

	/** Содержит ли попап узел (для проверки фокуса снаружи). */
	contains(node: Node | null | undefined): boolean {
		return !!node && this.el.contains(node);
	}

	open(
		box: { left: number; top: number; width: number; height: number },
		valueISO: string,
		withTime: boolean,
		onPick: (iso: string) => void,
		onClose: () => void,
	): void {
		this.close();
		this.onPick = onPick;
		this.onClose = onClose;
		this.withTime = withTime;
		this.selectedISO = valueISO.slice(0, 10);
		const timePart = valueISO.slice(11, 16);
		this.hours = Number(timePart.slice(0, 2)) || 0;
		this.minutes = Number(timePart.slice(3, 5)) || 0;

		const sel = isoToDate(this.selectedISO) ?? new Date();
		this.viewYear = sel.getFullYear();
		this.viewMonth = sel.getMonth();

		this.timeSection.style.display = withTime ? "flex" : "none";
		this.confirmBtn.style.display = withTime ? "block" : "none";
		this.render();
		this.renderTimeLists();

		this.el.style.display = "block";
		this.el.style.visibility = "hidden"; // сначала скрыто, чтобы измерить размеры
		this.el.style.left = `${box.left}px`;
		this.el.style.minWidth = `${Math.max(box.width, withTime ? 340 : 220)}px`;
		const popupW = this.el.offsetWidth || 220;
		const popupH = this.el.offsetHeight || 280;
		const hostH = this.host.clientHeight;
		const maxLeft = Math.max(0, this.host.clientWidth - popupW);
		this.el.style.left = `${Math.min(box.left, maxLeft)}px`;
		const fitsBelow = box.top + box.height + popupH <= hostH;
		this.el.style.top = fitsBelow
			? `${box.top + box.height}px`
			: `${Math.max(0, box.top - popupH)}px`;
		this.el.style.visibility = "";
		this.openState = true;

		// Прокрутить списки времени к выбранным значениям
		this.scrollTimeToSelected();

		// Закрытие по клику вне попапа (Escape обрабатывает редактор, чтобы
		// первое нажатие закрывало календарь, а не отменяло редактирование)
		const onMouseDown = (ev: MouseEvent) => {
			if (this.el.contains(ev.target as Node)) return;
			this.close();
			this.onClose();
		};
		const timer = window.setTimeout(() => {
			document.addEventListener("mousedown", onMouseDown, true);
		}, 0);
		this.disposeDismiss = () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", onMouseDown, true);
		};
	}

	close(): void {
		if (!this.openState) return;
		this.openState = false;
		this.disposeDismiss?.();
		this.disposeDismiss = null;
		this.el.style.display = "none";
	}

	destroy(): void {
		this.close();
		this.el.remove();
	}

	// ── Выбор ─────────────────────────────────────────────────────────────────

	/** Выбор дня. С временем — только подсветка (применение по «Подтвердить»). */
	private pickDay(iso: string): void {
		this.selectedISO = iso;
		this.render();
		if (!this.withTime) this.onPick(iso);
	}

	/** Применить выбранные дату и время. */
	private confirm(): void {
		this.onPick(this.selectedISO
			? `${this.selectedISO}T${pad2(this.hours)}:${pad2(this.minutes)}`
			: "");
	}

	// ── Рендер ────────────────────────────────────────────────────────────────

	private renderTimeLists(): void {
		this.timeHeaderEl.textContent = `${pad2(this.hours)}:${pad2(this.minutes)}`;
		this.hoursList.replaceChildren();
		for (let h = 0; h < 24; h++) {
			const item = document.createElement("button");
			item.type = "button";
			item.className = "nt-time-item";
			item.textContent = pad2(h);
			if (h === this.hours) item.classList.add("nt-time-item--selected");
			item.addEventListener("mousedown", (e) => e.preventDefault());
			item.addEventListener("click", () => {
				this.hours = h;
				this.renderTimeLists();
			});
			this.hoursList.append(item);
		}

		this.minutesList.replaceChildren();
		for (let m = 0; m < 60; m++) {
			const item = document.createElement("button");
			item.type = "button";
			item.className = "nt-time-item";
			item.textContent = pad2(m);
			if (m === this.minutes) item.classList.add("nt-time-item--selected");
			item.addEventListener("mousedown", (e) => e.preventDefault());
			item.addEventListener("click", () => {
				this.minutes = m;
				this.renderTimeLists();
			});
			this.minutesList.append(item);
		}
	}

	private scrollTimeToSelected(): void {
		const scrollTo = (list: HTMLElement, idx: number) => {
			const item = list.children[idx] as HTMLElement | undefined;
			if (!item) return;
			list.scrollTop = item.offsetTop - list.clientHeight / 2 + item.offsetHeight / 2;
		};
		scrollTo(this.hoursList, this.hours);
		scrollTo(this.minutesList, this.minutes);
	}

	private shiftMonth(delta: number): void {
		this.viewMonth += delta;
		if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; }
		else if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; }
		this.render();
	}

	private render(): void {
		this.titleEl.textContent = `${MONTHS_RU[this.viewMonth]} ${this.viewYear}`;

		const todayISO = isoFromDate(new Date());
		const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
		const lead = (new Date(this.viewYear, this.viewMonth, 1).getDay() + 6) % 7; // понедельник = 0
		const total = Math.ceil((lead + daysInMonth) / 7) * 7;

		this.gridEl.replaceChildren();
		for (let i = 0; i < total; i++) {
			const dayNum = i - lead + 1;
			if (dayNum < 1 || dayNum > daysInMonth) {
				const blank = document.createElement("div");
				blank.className = "nt-date-picker-blank";
				this.gridEl.append(blank);
				continue;
			}
			const iso = `${this.viewYear}-${pad2(this.viewMonth + 1)}-${pad2(dayNum)}`;
			const cell = document.createElement("button");
			cell.type = "button";
			cell.className = "nt-date-picker-day";
			cell.textContent = String(dayNum);
			if (iso === todayISO) cell.classList.add("nt-date-picker-day--today");
			if (iso === this.selectedISO) cell.classList.add("nt-date-picker-day--selected");
			cell.addEventListener("mousedown", (e) => e.preventDefault());
			cell.addEventListener("click", () => this.pickDay(iso));
			this.gridEl.append(cell);
		}
	}
}
