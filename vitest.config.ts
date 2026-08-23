import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "packages/**/*.test.ts", "mcp/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
  },
});
