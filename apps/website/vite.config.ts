import { defineConfig } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    proxy: {
      "/api": "http://localhost:5101",
      "/images": "http://localhost:5101",
    },
  },
  test: { environment: "jsdom" },
});
