/**
 * A panel that shows what the router thinks is true.
 *
 * Deliberately NOT a second diagnostics channel: `@barqjs/compiler`'s Vite
 * plugin already ships a panel for compile-time diagnostics, fed by a custom HMR
 * event. This one answers a different question — what the ROUTER is doing right
 * now — and it is a plain component rather than a plugin, so it lives and dies
 * with the scope that renders it and needs no build integration at all.
 *
 * Built on the primitive ABI like the rest of this package, so there is one
 * implementation in an application bundle and in this package's tests.
 *
 * It reads. It never writes. A devtool that can change what it is observing is a
 * devtool whose readings cannot be trusted, and a navigate button is one
 * `useNavigate` away for anyone who wants it.
 */

import { type Scope, bindProp, block, insert, listen, setAttr, setStyle } from "@barqjs/core";

import { useRouter } from "./components.ts";
import { type RouterState, unmask } from "./router.ts";

export interface RouterDevtoolsProps {
  /**
   * The router to report on. Falls back to the one in scope.
   *
   * Explicit because `RouterProvider` takes no children — it renders the matched
   * chain and nothing else — so a panel placed beside it is NOT inside its
   * context. Passing the state is how the page handler already does this, and
   * it is the only arrangement that works for an app that builds its own state.
   */
  readonly state?: RouterState;
  /** Start expanded. Default false. */
  readonly open?: boolean;
}

const PANEL_STYLE: Record<string, string> = {
  position: "fixed",
  bottom: "0",
  right: "0",
  "z-index": "2147483646",
  font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
  background: "#111",
  color: "#eee",
  "max-width": "min(32rem, 100vw)",
  "max-height": "50vh",
  overflow: "auto",
  "border-top-left-radius": "6px",
  "box-shadow": "0 0 0 1px #333",
};

function row(label: string, value: () => string): HTMLElement {
  const line = document.createElement("div");
  line.style.padding = "1px 8px";
  line.style.whiteSpace = "pre-wrap";
  line.style.wordBreak = "break-all";
  const name = document.createElement("span");
  name.style.color = "#6b7cff";
  name.textContent = `${label} `;
  line.append(name);
  const slot = document.createElement("span");
  line.append(slot);
  insert(null, slot, value);
  return line;
}

function RouterDevtoolsImpl(
  scope: Scope | null,
  props: { state?: () => unknown; open?: () => unknown },
): Node {
  // `useRouter` throws when there is no provider above, so it is only reached
  // when nothing was handed over.
  const state = (props.state === undefined ? useRouter() : props.state()) as RouterState;
  const panel = document.createElement("div");
  for (const [name, value] of Object.entries(PANEL_STYLE)) setStyle(panel, name, value);

  const header = document.createElement("button");
  header.type = "button";
  header.style.all = "unset";
  header.style.display = "block";
  header.style.width = "100%";
  header.style.padding = "4px 8px";
  header.style.cursor = "pointer";
  header.style.background = "#1b1b1b";
  panel.append(header);

  let open = Boolean(props.open?.());
  const body = document.createElement("div");
  body.style.display = open ? "block" : "none";
  panel.append(body);

  const label = (): string => `barq router — ${state.chain().length} matched ${open ? "▾" : "▸"}`;
  insert(scope, header, label);
  listen(scope, header, "click", () => {
    open = !open;
    body.style.display = open ? "block" : "none";
    // The header's own label carries the caret, so it has to re-read.
    header.textContent = "";
    insert(scope, header, label);
  });

  body.append(
    row("url", () => state.location().pathname + state.location().search + state.location().hash),
    // Only ever different under a mask, and silence would be the confusing
    // answer when it IS different.
    row("matches", () => unmask(state.location())),
    row("params", () => JSON.stringify(state.params())),
    row("search", () => JSON.stringify(state.validSearch())),
    row(
      "chain",
      () =>
        state
          .chain()
          .map((route) => route.id)
          .join(" › ") || "(none)",
    ),
    row("context", () => JSON.stringify(state.contexts()[state.contexts().length - 1] ?? {})),
    row("ssr", () => state.ssrModes().map(String).join(" › ") || "(none)"),
    row("navigating", () => String(state.isNavigating())),
    row("canGoBack", () => String(state.canGoBack())),
  );

  bindProp(scope, panel, setAttr, "data-barq-devtools", () => "");
  return panel;
}

/**
 * `<RouterDevtools />`, applied by hand like the rest of this package's
 * components — this module is not compiled, so C1's declaration rewrite does not
 * happen to it.
 */
export const RouterDevtools = block(RouterDevtoolsImpl) as unknown as (
  props: RouterDevtoolsProps,
) => unknown;
