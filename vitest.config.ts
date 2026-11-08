import { defineConfig } from "vitest/config";

const withDb = Boolean(process.env.DATABASE_URL);

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: withDb ? ["node_modules/**"] : ["node_modules/**", "src/**/*.integration.test.ts"],
    fileParallelism: !withDb,
  },
});
