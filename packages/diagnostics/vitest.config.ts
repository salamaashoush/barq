import barq from "@barqjs/vite";
import { type ViteUserConfig, defineConfig } from "vitest/config";

// `barq()` compiles the components and, because vitest serves through a Vite
// dev server, resolves the `development` condition in every environment. vitest
// passes the server environment's conditions on to the worker's Node, so a
// dependency it loads natively gets the same development build.
const config: ViteUserConfig = defineConfig({
  plugins: [barq()],
  test: {
    include: ["src/**/*.vitest.{ts,tsx}"],
    environment: "happy-dom",
    setupFiles: ["./src/vitest-setup.ts"],
  },
});

export default config;
