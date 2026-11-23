import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Lokal ishlab chiqishda /api so'rovlari backendga proksi qilinadi —
// shunda cookie bir xil origin'da ishlaydi (CORS kerak emas).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api/": "http://localhost:8000" },
  },
  build: { sourcemap: false },
});
