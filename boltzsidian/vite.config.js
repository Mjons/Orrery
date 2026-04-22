import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    strictPort: false,
    // TEND_BULK_RESET.md §5C — keep the dev watcher out of paths
    // Boltzsidian writes to when the user happens to have a vault
    // inside this repo. A bulk tend accept can write ~150 .md files
    // in a few seconds; without this, Vite's change-buffer trips into
    // a full page reload mid-batch.
    //
    // Also ignores the .universe/ sidecar tree (state.json, prune-
    // candidates.json, dream-log/, regions/, archive/, etc.) so the
    // dev server doesn't churn on state persistence either.
    watch: {
      ignored: ["**/*.md", "**/.universe/**", "**/ideas/**"],
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
  },
});
