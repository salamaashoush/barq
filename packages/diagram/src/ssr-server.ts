/**
 * The server half of the SSR suite: one render, in a process with no DOM.
 *
 * `bun run ssr-server.ts <module>`, answered on stdout as JSON after a marker,
 * so anything a fixture logs on the way does not corrupt the result. This
 * package's components are compiled for the string backend as they load, as a
 * server build compiles a source package.
 */

import { dirname } from "node:path";
import { plugin } from "bun";
import { renderPage } from "@barqjs/server";
import { compilerLoader } from "@barqjs/vite/internal";

import { RESULT } from "./ssr-harness.ts";

const escape = (path: string): string => path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ui = dirname(Bun.resolveSync("@barqjs/ui/package.json", import.meta.dir));
const styled = new RegExp(`^(${escape(`${import.meta.dir}/ui`)}|${escape(ui)}/src)/.*\\.ts$`);

plugin(compilerLoader({ transform: { ssr: true, hydratable: true, strictCss: true }, ts: styled }));

const [modulePath = ""] = process.argv.slice(2);
const fixture = (await import(modulePath)) as { page: () => () => unknown };
const page = await renderPage(fixture.page() as never);

process.stdout.write(RESULT + JSON.stringify({ html: page.html, script: page.script }));
process.exit(0);
