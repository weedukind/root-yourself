import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" wirft außerhalb von Next.js; in Tests ist der Import bedeutungslos.
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    globalSetup: ["./test/global-setup.ts"],
    env: {
      PREVIEW_SECRET: "test-secret",
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/rootyourself_test",
    },
  },
});
