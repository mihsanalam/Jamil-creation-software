import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest config (Tier 4, item 23).
 *
 * Only pure logic is unit tested right now — the money math (`sales-totals`),
 * the document numbering (`numbering`) and the lockout policy
 * (`login-policy`) — so the tests need no database and no DOM. Node
 * environment keeps them instant, which matters for the CI gate.
 *
 * The `@/*` alias mirrors tsconfig.json so a future test can import app code
 * by alias instead of a relative path.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
