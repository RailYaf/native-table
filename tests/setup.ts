// ── Глобальная настройка тестов ──────────────────────────────────────────────
// jsdom не имеет лейаута и части браузерных API — эмулируем необходимое.

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
	cleanup();
});

// ResizeObserver использует NativeTable (ресайз контейнера)
class ResizeObserverMock {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// jsdom: нет лейаута. Даём элементам «видимый» размер, чтобы виртуализация
// рендерила строки/колонки (иначе clientHeight = 0 и таблица пустая).
for (const prop of ["clientHeight", "offsetHeight"]) {
	Object.defineProperty(HTMLElement.prototype, prop, {
		configurable: true,
		get() { return 600; },
	});
}
for (const prop of ["clientWidth", "offsetWidth"]) {
	Object.defineProperty(HTMLElement.prototype, prop, {
		configurable: true,
		get() { return 800; },
	});
}

// scrollIntoView может вызываться при навигации по таблице
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
