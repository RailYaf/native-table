import { useState } from "react";
import { NativeTable } from "../src";
import type { ColumnDef } from "../src/utils/types";

const columns: ColumnDef[] = [
	{ name: "crypto", label: "Актив", width: 140 },
	{ name: "price", label: "Цена, $", type: "number", decimals: 2, width: 130 },
	{
		name: "change24h", label: "Изменение, %", type: "number", decimals: 2, width: 140,
		color: (v) => {
			const n = Number(v);
			if (!n) return null;
			return n >= 0 ? "#26a69a" : "#ef5350";
		},
	},
	{ name: "volume", label: "Объём, млн $", type: "number", decimals: 1, width: 140 },
	{ name: "risk", label: "Риск", width: 120, backgroundColor: (v) => {
		switch (v) {
			case "Высокий": return "rgba(239, 83, 80, 0.25)";
			case "Средний": return "rgba(255, 193, 7, 0.25)";
			default: return "rgba(38, 166, 154, 0.25)";
		}
	} },
];

const initialData = [
	{ id: 1, crypto: "Bitcoin", price: 64210.5, change24h: 2.4, volume: 320.5, risk: "Средний" },
	{ id: 2, crypto: "Ethereum", price: 3510.2, change24h: -1.2, volume: 180.3, risk: "Средний" },
	{ id: 3, crypto: "Solana", price: 148.75, change24h: 5.8, volume: 42.1, risk: "Высокий" },
	{ id: 4, crypto: "Cardano", price: 0.42, change24h: -0.6, volume: 8.7, risk: "Низкий" },
	{ id: 5, crypto: "Polkadot", price: 6.31, change24h: 0.9, volume: 12.4, risk: "Низкий" },
];

export function DataTableTheme() {
	const [theme, setTheme] = useState<"light" | "dark">("dark");
	const [striped, setStriped] = useState(true);
	return (
		<div className="demo-panel">
			<div style={{ margin: "0 0 12px", fontSize: 16 }}>
				Тема:{" "}
				<label style={{ marginRight: 8 }}>
					<input type="radio" checked={theme === "light"} onChange={() => setTheme("light")} /> светлая
				</label>
				<label style={{ marginRight: 16 }}>
					<input type="radio" checked={theme === "dark"} onChange={() => setTheme("dark")} /> тёмная
				</label>
				<label>
					<input type="checkbox" checked={striped} onChange={(e) => setStriped(e.target.checked)} /> зебра
				</label>
			</div>
			<NativeTable
				data={initialData}
				columns={columns}
				theme={theme}
				striped={striped}
				style={{ maxHeight: 500 }}
			/>
		</div>
	);
}
