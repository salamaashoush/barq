import { defineConfig, type Plugin } from "vite";

function probe(): Plugin {
  return {
    name: "p6-probe",
    apply: "build",
    buildEnd() {
      const out: Record<string, unknown> = {};
      for (const id of this.getModuleIds()) {
        if (!id.includes("/src/")) continue;
        const info = this.getModuleInfo(id);
        if (info === null) continue;
        out[id.split("/scratch/p6/app/")[1] ?? id] = {
          importedIds: info.importedIds.map((i) => i.split("/scratch/p6/app/")[1] ?? i),
          dynamicallyImportedIds: info.dynamicallyImportedIds.map((i) => i.split("/scratch/p6/app/")[1] ?? i),
          isEntry: info.isEntry,
        };
      }
      this.emitFile({ type: "asset", fileName: "p6-graph.json", source: JSON.stringify(out, null, 2) });
    },
    generateBundle(_options, bundle) {
      const out: Record<string, unknown> = {};
      for (const [file, chunk] of Object.entries(bundle)) {
        if (chunk.type !== "chunk") continue;
        out[file] = {
          isEntry: chunk.isEntry,
          isDynamicEntry: chunk.isDynamicEntry,
          facadeModuleId: chunk.facadeModuleId?.split("/scratch/p6/app/")[1] ?? null,
          moduleIds: Object.keys(chunk.modules).map((i) => i.split("/scratch/p6/app/")[1] ?? i),
          imports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
        };
      }
      this.emitFile({ type: "asset", fileName: "p6-bundle.json", source: JSON.stringify(out, null, 2) });
    },
  };
}

export default defineConfig({
  plugins: [probe()],
  build: { manifest: true, outDir: "dist" },
  resolve: { conditions: ["bun", "import", "module", "browser", "default"] },
  esbuild: { jsx: "automatic", jsxImportSource: "@barqjs/core" },
});
