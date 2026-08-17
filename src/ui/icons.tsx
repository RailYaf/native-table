import type { SVGProps } from "react";
import { TOOLBAR_ICON_SIZE } from "../utils/consts";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ children, size = TOOLBAR_ICON_SIZE, ...props }: IconProps) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
			stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
			{children}
		</svg>
	);
}

export function SaveIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
			<path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
			<path d="M7 3v4a1 1 0 0 0 1 1h7" />
		</Icon>
	);
}

export function UndoIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M9 14 4 9l5-5" />
			<path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
		</Icon>
	);
}

export function RedoIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M15 14 20 9l-5-5" />
			<path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
		</Icon>
	);
}

export function PaintBucketIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M11 7 6 2" />
			<path d="M18.992 12H2.041" />
			<path d="M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595" />
			<path d="m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33" />
		</Icon>
	);
}

export function TextColorIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="m6 16 6-12 6 12" />
			<path d="M8 12h8" />
		</Icon>
	);
}

// ── SVG-иконки фильтрации и сортировки (inline HTML-строки) ─────────────────

export function filterDefaultSvg(): string {
	return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="7" viewBox="0 0 9 5" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.97361 0H0.276731C0.0458711 0 -0.0830352 0.24375 0.0599336 0.410156L3.90837 4.87266C4.01853 5.00039 4.23064 5.00039 4.34197 4.87266L8.1904 0.410156C8.33337 0.24375 8.20446 0 7.97361 0Z" fill="currentColor"/></svg>';
}

export function filterActiveSvg(): string {
	return '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="12" viewBox="0 0 13 12" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.51002 6.75H8.98815L10.3147 4.4375H2.18346L3.51002 6.75ZM12.0006 0H0.497523C0.114711 0 -0.124352 0.417188 0.0678357 0.75L1.60846 3.4375H10.8897L12.4319 0.75C12.6225 0.417188 12.3835 0 12.0006 0ZM3.70221 10.6875C3.70221 10.9641 3.92409 11.1875 4.19909 11.1875H8.29909C8.57409 11.1875 8.79596 10.9641 8.79596 10.6875V7.75H3.70221V10.6875Z" fill="currentColor"/></svg>';
}

export function sortAscSvg(): string {
	return '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="11" viewBox="0 0 13 11" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M0.125253 2.46836H1.31275V10.7496C1.31275 10.8184 1.369 10.8746 1.43775 10.8746H2.31275C2.3815 10.8746 2.43775 10.8184 2.43775 10.7496V2.46836H3.62525C3.72994 2.46836 3.78932 2.34648 3.72369 2.26523L1.97369 0.0480469C1.92369 -0.0160156 1.82682 -0.0160156 1.77682 0.0480469L0.0268152 2.26523C-0.0372473 2.34648 0.0205653 2.46836 0.125253 2.46836Z" fill="currentColor"/><path d="M12.0149 1.13519V2.2348H4.58517V1.13519H12.0149Z" fill="currentColor"/><path d="M11.0158 3.7348V4.83441H4.58517V3.7348H11.0158Z" fill="currentColor"/><path d="M8.98068 6.33441V7.43402H4.58517V6.33441H8.98068Z" fill="currentColor"/><path d="M7.00021 8.93402V10.0336H4.58517V8.93402H7.00021Z" fill="currentColor"/></svg>';
}

export function sortDescSvg(): string {
	return '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="11" viewBox="0 0 13 11" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.62594 8.40625H2.43844V0.125C2.43844 0.05625 2.38219 0 2.31344 0H1.43844C1.36969 0 1.31344 0.05625 1.31344 0.125V8.40625H0.125937C0.02125 8.40625 -0.038125 8.52812 0.0275 8.60938L1.7775 10.8266C1.8275 10.8906 1.92438 10.8906 1.97438 10.8266L3.72438 8.60938C3.78844 8.52812 3.73062 8.40625 3.62594 8.40625Z" fill="currentColor"/><path d="M12.0146 1.09607V2.19568H4.58496V1.09607H12.0146Z" fill="currentColor"/><path d="M11.0156 3.69568V4.79529H4.58496V3.69568H11.0156Z" fill="currentColor"/><path d="M8.98047 6.29529V7.3949H4.58496V6.29529H8.98047Z" fill="currentColor"/><path d="M7 8.8949V9.99451H4.58496V8.8949H7Z" fill="currentColor"/></svg>';
}

export function filterAscSvg(): string {
	return '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="12" viewBox="0 0 17 12" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M0.125253 2.71444H1.31275V10.9957C1.31275 11.0644 1.369 11.1207 1.43775 11.1207H2.31275C2.3815 11.1207 2.43775 11.0644 2.43775 10.9957V2.71444H3.62525C3.72994 2.71444 3.78932 2.59256 3.72369 2.51131L1.97369 0.294125C1.92369 0.230063 1.82682 0.230062 1.77682 0.294125L0.0268152 2.51131C-0.0372473 2.59256 0.0205653 2.71444 0.125253 2.71444Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M7.49701 6.75H12.9751L14.3017 4.4375H6.17044L7.49701 6.75ZM15.9876 0H4.48451C4.10169 0 3.86263 0.417188 4.05482 0.75L5.59544 3.4375H14.8767L16.4189 0.75C16.6095 0.417188 16.3704 0 15.9876 0ZM7.68919 10.6875C7.68919 10.9641 7.91107 11.1875 8.18607 11.1875H12.2861C12.5611 11.1875 12.7829 10.9641 12.7829 10.6875V7.75H7.68919V10.6875Z" fill="currentColor"/></svg>';
}

export function filterDescSvg(): string {
	return '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="12" viewBox="0 0 17 12" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.62594 8.7153H2.43844V0.434053C2.43844 0.365303 2.38219 0.309053 2.31344 0.309053H1.43844C1.36969 0.309053 1.31344 0.365303 1.31344 0.434053V8.7153H0.125937C0.02125 8.7153 -0.038125 8.83718 0.0275 8.91843L1.7775 11.1356C1.8275 11.1997 1.92438 11.1997 1.97438 11.1356L3.72438 8.91843C3.78844 8.83718 3.73062 8.7153 3.62594 8.7153Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M7.51025 6.75H12.9884L14.3149 4.4375H6.18368L7.51025 6.75ZM16.0009 0H4.49775C4.11493 0 3.87587 0.417188 4.06806 0.75L5.60868 3.4375H14.8899L16.4321 0.75C16.6227 0.417188 16.3837 0 16.0009 0ZM7.70243 10.6875C7.70243 10.9641 7.92431 11.1875 8.19931 11.1875H12.2993C12.5743 11.1875 12.7962 10.9641 12.7962 10.6875V7.75H7.70243V10.6875Z" fill="currentColor"/></svg>';
}

