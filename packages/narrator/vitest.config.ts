import { defineConfig } from "vitest/config";

// The adapter tests run the real world engine for 100+ shifts, which takes longer than the 5s default.
export default defineConfig({ test: { testTimeout: 120_000 } });
