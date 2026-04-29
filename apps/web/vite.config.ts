import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  envDir: repoRoot,
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5174
  },
  test: {
    environment: "jsdom",
    globals: true
  }
});
