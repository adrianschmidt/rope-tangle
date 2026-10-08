/// <reference types="vitest" />
import { defineConfig } from "vite";

const BASE_PATH = process.env.VITE_BASE_PATH ?? "/rope-tangle/";

export default defineConfig({
  base: BASE_PATH,
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/spike/**", "**/.worktrees/**"],
  },
});
