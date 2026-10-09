/// <reference types="vitest" />
import { defineConfig } from "vite";

const BASE_PATH = process.env.VITE_BASE_PATH ?? "/rope-tangle/";

export default defineConfig({
  base: BASE_PATH,
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version ?? "dev"),
  },
  test: {
    globals: true,
    environment: "node",
    exclude: [
      "**/node_modules/**", "**/dist/**", "**/spike/**", "**/.worktrees/**", "**/.claude/**",
      ...(process.env.MEASURE ? [] : ["**/*.measure.test.ts"]),
    ],
  },
});
