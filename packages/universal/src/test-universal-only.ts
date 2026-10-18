/**
 * Run as its own process by `hosts.test.ts`: an app that never loads the
 * document's host, calling a core component outside any tree it rendered.
 */

import { Show, block, createRoot } from "@barqjs/core";
import { createRenderer } from "./renderer.ts";
import { createTestHost, serialize } from "./test-host.ts";

const host = createTestHost();
const r = createRenderer(host.ops);

const out = createRoot((dispose) => {
  const shown = Show({
    when: () => true,
    children: block(() => r.createElement("shown")),
  });
  const root = host.root();
  r.insert(root, shown);
  const markup = serialize(root);
  dispose();
  return markup;
});

console.log(out);
