import { Prec, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  type Command,
  type EditorView,
  type Tooltip,
  type TooltipView,
  keymap,
  showTooltip,
} from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import {
  type Connected,
  ask,
  askMapped,
  capabilityOf,
  connected,
  clampedOffset,
} from "./lsp-context.ts";

type ServerAction = lsp.Command | lsp.CodeAction;

interface ActionMenu {
  pos: number;
  actions: readonly ServerAction[];
}

const setMenu = StateEffect.define<ActionMenu | null>({
  map: (menu, mapping) => (menu === null ? null : { ...menu, pos: mapping.mapPos(menu.pos) }),
});

let menus = 0;

function isCommand(action: ServerAction): action is lsp.Command {
  return typeof action.command === "string";
}

async function run(found: Connected, action: ServerAction): Promise<void> {
  const { plugin, context } = found;
  if (isCommand(action)) {
    await context.executeCommand(action);
    return;
  }
  let full = action;
  const resolves = capabilityOf(plugin.client, "codeActionProvider");
  if (
    full.edit === undefined &&
    typeof resolves === "object" &&
    resolves.resolveProvider === true
  ) {
    full = await ask<lsp.CodeAction>(plugin.client, "codeAction/resolve", full);
  }
  if (full.edit !== undefined) await context.applyEdit(full.edit);
  if (full.command !== undefined) await context.executeCommand(full.command);
}

function close(view: EditorView): void {
  view.dispatch({ effects: setMenu.of(null) });
  view.focus();
}

function menuView(view: EditorView, menu: ActionMenu): TooltipView {
  const id = `cm-lsp-actions-${String(menus++)}`;
  const list = document.createElement("ul");
  list.className = "cm-lsp-actions";
  list.id = id;
  list.tabIndex = 0;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", view.state.phrase("Code actions"));
  const options: HTMLElement[] = [];
  let active = 0;
  if (menu.actions.length === 0) {
    const empty = list.appendChild(document.createElement("li"));
    empty.className = "cm-lsp-actions-empty";
    empty.setAttribute("role", "option");
    empty.setAttribute("aria-disabled", "true");
    empty.textContent = view.state.phrase("No code actions");
  }
  menu.actions.forEach((action, index) => {
    const option = list.appendChild(document.createElement("li"));
    option.id = `${id}-${String(index)}`;
    option.className = "cm-lsp-action";
    option.setAttribute("role", "option");
    option.textContent = action.title;
    if (!isCommand(action) && action.isPreferred === true) option.dataset.preferred = "";
    option.addEventListener("mousedown", (event) => event.preventDefault());
    option.addEventListener("click", () => choose(index));
    options.push(option);
  });
  function select(index: number): void {
    if (options.length === 0) return;
    active = (index + options.length) % options.length;
    options.forEach((option, at) => option.setAttribute("aria-selected", String(at === active)));
    list.setAttribute("aria-activedescendant", options[active]?.id ?? "");
    options[active]?.scrollIntoView?.({ block: "nearest" });
  }
  function choose(index: number): void {
    const action = menu.actions[index];
    const found = connected(view);
    close(view);
    if (action === undefined || found === null) return;
    run(found, action).catch((error: unknown) => found.context.report(error));
  }
  list.addEventListener("keydown", (event) => {
    const moves: Readonly<Record<string, number>> = {
      ArrowDown: active + 1,
      ArrowUp: active - 1,
      Home: 0,
      End: options.length - 1,
    };
    const move = moves[event.key];
    if (move !== undefined) select(move);
    else if (event.key === "Enter" || event.key === " ") choose(active);
    else if (event.key === "Escape" || event.key === "Tab") close(view);
    else return;
    event.preventDefault();
  });
  select(0);
  return { dom: list, mount: () => list.focus() };
}

function tooltipOf(menu: ActionMenu): Tooltip {
  return { pos: menu.pos, above: false, create: (view) => menuView(view, menu) };
}

const menuField = StateField.define<ActionMenu | null>({
  create: () => null,
  update: (menu, transaction) => {
    for (const effect of transaction.effects) if (effect.is(setMenu)) return effect.value;
    if (menu === null || transaction.docChanged || transaction.selection !== undefined) return null;
    return menu;
  },
  provide: (field) => showTooltip.from(field, (menu) => (menu === null ? null : tooltipOf(menu))),
});

function overlapping(found: Connected, from: number, to: number): lsp.Diagnostic[] {
  const { plugin, context } = found;
  const published = context.published(plugin.uri);
  if (published === undefined) return [];
  const doc = plugin.syncedDoc;
  const pending = plugin.unsyncedChanges;
  return published.diagnostics.filter((one) => {
    const start = pending.mapPos(clampedOffset(doc, one.range.start), 1);
    const end = pending.mapPos(clampedOffset(doc, one.range.end), -1);
    return start <= to && end >= from;
  });
}

/**
 * Asks the server what it can do to the text from `from` to `to` (fixes
 * for `diagnostics`, or for those there), and lists the answers under it:
 * arrows move, Enter applies, Escape closes.
 */
export function openCodeActions(
  view: EditorView,
  from: number,
  to: number,
  diagnostics?: readonly lsp.Diagnostic[],
): boolean {
  const found = connected(view);
  if (found === null) return false;
  const { plugin, context } = found;
  if (
    plugin.client.serverCapabilities !== null &&
    capabilityOf(plugin.client, "codeActionProvider") === undefined
  ) {
    return false;
  }
  askMapped<ServerAction[] | null>(found, "textDocument/codeAction", {
    textDocument: { uri: plugin.uri },
    range: { start: plugin.toPosition(from), end: plugin.toPosition(to) },
    context: {
      diagnostics: [...(diagnostics ?? overlapping(found, from, to))],
      triggerKind: 1,
    },
  }).then(
    (answer) => {
      const actions = (answer.result ?? [])
        .filter((action) => isCommand(action) || action.disabled === undefined)
        .toSorted(
          (a, b) =>
            Number(!isCommand(b) && b.isPreferred === true) -
            Number(!isCommand(a) && a.isPreferred === true),
        );
      const pos = answer.since === null ? from : answer.since.mapPos(from);
      view.dispatch({ effects: setMenu.of({ pos, actions }) });
    },
    (error: unknown) => context.report(error),
  );
  return true;
}

/** Lists the code actions for the selection, or for the cursor's place. */
export const showCodeActions: Command = (view) => {
  const { from, to } = view.state.selection.main;
  return openCodeActions(view, from, to);
};

/** Code actions and quick fixes on Mod-. */
export function codeActions(): Extension {
  return [menuField, Prec.high(keymap.of([{ key: "Mod-.", run: showCodeActions }]))];
}
