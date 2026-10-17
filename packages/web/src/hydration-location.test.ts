/**
 * A hydration mismatch says where it happened: the JSX whose template was
 * being claimed, as `file:line:column`, and the component path the walk was in.
 *
 * Both come from a development compile, which writes the location beside each
 * template and names each component it calls, read by the engine's development
 * build, which keeps owner names. The production engine reports neither, and a
 * production bundle carries none of the code that would, so each claim says
 * what the production engine answers.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { transform } from "@barqjs/compiler";

import * as core from "@barqjs/core";
import * as web from "./index.ts";
import { linkRuntime } from "./test-compile.ts";

const FILE = "/srv/salama/src/page.tsx";

const SOURCE = `import { isServer } from "@barqjs/web";
function Greeting() {
  return isServer ? <main>Welcome back</main> : <div>Welcome back</div>;
}
export function Page() {
  return <section><Greeting /></section>;
}
`;

async function load(): Promise<{ Page: () => core.JSXElement }> {
  const out = transform(SOURCE, { filename: FILE, dev: true, hydratable: true });
  const body = linkRuntime(out.code);
  const directory = mkdtempSync(join(tmpdir(), "barq-hydration-location-"));
  const file = join(directory, "page.js");
  writeFileSync(file, body);
  try {
    return (await import(file)) as { Page: () => core.JSXElement };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

afterEach(() => {
  document.body.textContent = "";
});

describe("a hydration mismatch names the JSX and the component it happened in", () => {
  test("the development compile writes each template's location beside it", () => {
    const out = transform(SOURCE, { filename: `${FILE}?v=1`, dev: true, hydratable: true });
    expect(out.code).toContain(`"${FILE}:3:49")`);
    expect(out.code).toContain(`"${FILE}:6:10")`);
    const production = transform(SOURCE, { filename: FILE, hydratable: true });
    expect(production.code).not.toContain(FILE);
  });

  test("the report carries the template's location and the component path", async () => {
    const { Page } = await load();
    const container = document.createElement("div");
    container.innerHTML = "<section><main>Welcome back</main></section>";
    document.body.append(container);
    const capture = core.DEV.diagnostics.capture();
    const dispose = web.hydrate(() => core.createComponent(Page, {}, "Page"), container);
    const events = capture.stop().filter((event) => event.code === "HYDRATION_MISMATCH");
    dispose();

    expect(web.hydrate.report.recovered).toBe(true);
    expect(events).toHaveLength(1);
    const [event] = events;
    const development = core.OBSERVE !== undefined;
    expect(event?.data?.template).toBe(development ? `${FILE}:3:49` : undefined);
    expect(event?.message.includes(`The template being hydrated is at ${FILE}:3:49.`)).toBe(
      development,
    );
    expect(event?.ownerPath).toEqual(development ? ["<Page>", "<Greeting>"] : undefined);
  });
});
