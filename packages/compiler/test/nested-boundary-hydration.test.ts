/**
 * A boundary whose content BEGINS with another boundary that parked.
 *
 * The outer boundary settled and the inner one did not, so the outer one's
 * markup starts with the inner one's deferred range. Each still writes a range
 * of its own: with one range for the two, the client's inner boundary finds an
 * element where its `<!--[-->` should be.
 *
 * `@barqjs/router` renders every route depth as Loading > Errored > content, so
 * a layout route with no component of its own is this shape exactly.
 */

import { expect, test } from "bun:test";

import { census, compileText, host, reuse } from "./hydration.ts";
import { assemble } from "./stream.ts";

const SOURCE = `
import { Loading, createMemo } from "@barqjs/core"
export default function Page() {
  const late = createMemo(() => new Promise((r) => setTimeout(() => r("LATE"), 0)))
  return (
    <div>
      <p>before</p>
      <Loading fallback={<span class="outer">outer</span>}>
        <Loading fallback={<span class="inner">inner</span>}>
          <b class="done">{() => late()}</b>
        </Loading>
      </Loading>
    </div>
  )
}
`;

async function hydrated(mode: "buffered" | "streamed") {
  const compiled = await compileText(SOURCE, `nested-boundary-${mode}`, true, false);
  const core = await import("@barqjs/core");
  const server = await import("@barqjs/server");
  const container = host("");
  const seeded = globalThis as { __BARQ_DATA__?: Record<string, unknown> };
  let data: Record<string, unknown> | undefined;

  if (mode === "buffered") {
    const page = await server.renderPage((() => compiled.ssr.default()) as never);
    container.innerHTML = page.html;
    data = page.data;
  } else {
    await assemble(compiled.ssr, container);
  }
  const wire = container.innerHTML;

  const before = census(container);
  core.resetChildIds();
  const dispose = core.hydrate(
    compiled.dom.default as never,
    container,
    data === undefined ? undefined : { data },
  );
  const report = core.hydrate.report;
  const result = {
    wire,
    recovered: report.recovered,
    mismatches: report.mismatches.map((m) => m.kind),
    reuse: reuse(before, container).percent,
  };
  dispose();
  container.remove();
  seeded.__BARQ_DATA__ = undefined;
  return result;
}

for (const mode of ["buffered", "streamed"] as const) {
  test(`a boundary directly inside a boundary hydrates over a ${mode} page`, async () => {
    const result = await hydrated(mode);

    expect(result.wire).toContain('<b class="done">LATE</b>');
    expect({
      recovered: result.recovered,
      mismatches: result.mismatches,
      reuse: result.reuse,
    }).toEqual({ recovered: false, mismatches: [], reuse: 100 });
    // One range per boundary, which is what the client claims against.
    expect(result.wire.match(/<!--\[-->/g)).toHaveLength(2);
  });
}
