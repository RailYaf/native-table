import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-сервер для просмотра демо-примеров (demos/)
export default defineConfig({
	root: "demos",
	plugins: [react()],
	server: {
		port: 5173,
		open: true,
	},
});
