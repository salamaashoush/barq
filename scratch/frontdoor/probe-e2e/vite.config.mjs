import { barqStart } from "@barqjs/start/vite";

const CONDITIONS = ["bun", "import", "module", "browser", "default"];

export default {
  logLevel: "warn",
  resolve: { conditions: CONDITIONS },
  // In-repo only: the workspace packages are consumed from `src`, and BOTH
  // environments have to agree or `@barqjs/core` exists twice — one copy holding
  // the async session the render parks into and the other holding the loop that
  // would resume it.
  environments: { ssr: { resolve: { conditions: CONDITIONS } } },
  plugins: [barqStart({ compiler: { hydratable: true } })],
};
