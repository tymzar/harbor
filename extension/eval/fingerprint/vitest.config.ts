import path from "node:path";
import { defineConfig } from "vitest/config";

// The offline layout-matching evaluation; kept out of `npm test` (it needs the local snapshots).
export default defineConfig({
  root: path.resolve(import.meta.dirname, "../.."),
  test: { include: ["eval/fingerprint/*.eval.test.ts"], testTimeout: 600_000 },
});
