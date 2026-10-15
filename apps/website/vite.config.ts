import { defineConfig } from "vite-plus";

export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:5101",
      "/images": "http://localhost:5101",
    },
  },
  test: { environment: "jsdom" },
});
