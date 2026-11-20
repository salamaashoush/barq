import barq from "@barqjs/vite";
import { type ViteUserConfig, defineConfig } from "vitest/config";

// `barq()` compiles the components and, because vitest serves through a Vite
// dev server, resolves the `development` condition in every environment. vitest
// passes the server environment's conditions on to the worker's Node, so a
// dependency it loads natively gets the same development build.
//
// Refresh is off: vitest serves with `server.hmr: false`, and the
// `import.meta.hot` its module runner hands a module has no `data`, which the
// component wrap `refresh` adds reads as the module loads.
const config: ViteUserConfig = defineConfig({
  plugins: [barq({ refresh: { disabled: true } })],
  test: {
    include: ["src/**/*.vitest.{ts,tsx}"],
    environment: "happy-dom",
    setupFiles: ["./src/vitest-setup.ts"],
  },
});

export default config;
