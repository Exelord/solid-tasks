import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    target: "esnext",
    minify: false,
    lib: {
      entry: "./src/index.ts",
      formats: ["cjs", "es"],
    },
    rollupOptions: {
      external: ["solid-proxies", "solid-js"],
    },
  },
  resolve: {
    conditions: ["browser"],
  },
  test: {
    dir: "./tests/vitest",
  },
});
