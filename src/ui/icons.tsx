import type { SVGProps } from "react";

function Icon({ children, size = 16, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
			stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
			{children}
		</svg>
	);
}

export function SaveIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
			<path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
			<path d="M7 3v4a1 1 0 0 0 1 1h7" />
		</Icon>
	);
}

export function UndoIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M9 14 4 9l5-5" />
			<path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
		</Icon>
	);
}

export function RedoIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M15 14 20 9l-5-5" />
			<path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
		</Icon>
	);
}

export function BoldIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
		</Icon>
	);
}

export function ItalicIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<line x1="19" x2="10" y1="4" y2="4" />
			<line x1="14" x2="5" y1="20" y2="20" />
			<line x1="15" x2="9" y1="4" y2="20" />
		</Icon>
	);
}

export function UnderlineIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M6 4v6a6 6 0 0 0 12 0V4" />
			<line x1="4" x2="20" y1="20" y2="20" />
		</Icon>
	);
}

export function AlignIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<line x1="21" x2="3" y1="6" y2="6" />
			<line x1="17" x2="7" y1="12" y2="12" />
			<line x1="19" x2="5" y1="18" y2="18" />
		</Icon>
	);
}

export function WrapIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<line x1="3" x2="21" y1="6" y2="6" />
			<path d="M3 12h15a3 3 0 1 1 0 6h-4" />
			<polyline points="16 16 14 18 16 20" />
			<line x1="3" x2="10" y1="18" y2="18" />
		</Icon>
	);
}

export function PaletteIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<circle cx="13.5" cy="6.5" r=".5" fill="currentColor" stroke="none" />
			<circle cx="17.5" cy="10.5" r=".5" fill="currentColor" stroke="none" />
			<circle cx="8.5" cy="7.5" r=".5" fill="currentColor" stroke="none" />
			<circle cx="6.5" cy="12.5" r=".5" fill="currentColor" stroke="none" />
			<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.8-.1 2.7-.3A1 1 0 0 0 15.5 21c-.5 0-1-.4-1-1s.4-1 1-1H18a4 4 0 0 0 4-4c0-5.5-4.5-10-10-10z" />
		</Icon>
	);
}

export function TextColorIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="m6 16 6-12 6 12" />
			<path d="M8 12h8" />
		</Icon>
	);
}

export function InfoIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<circle cx="12" cy="12" r="10" />
			<path d="M12 16v-4" />
			<path d="M12 8h.01" />
		</Icon>
	);
}
