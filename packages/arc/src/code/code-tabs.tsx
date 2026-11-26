import { type Child, Show, createSignal, onCleanup, onSettled, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { isServer } from "@barqjs/web";

import { ResponsiveTabs, type TabItem } from "../components/responsive-tabs.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, type } from "../style/index.ts";
import { CodeBlock } from "./code-block.tsx";
import type { CodeLanguage } from "./languages.ts";
import { TerminalBlock } from "./terminal-block.tsx";

export interface CodeTab extends TabItem {
  code: string;
  /** @default "shell" for a terminal, plain text otherwise */
  language?: CodeLanguage;
  /** Names the code: a file, or where it is typed. */
  filename?: string;
  /** Drawn as `TerminalBlock` draws commands; `transcript` with their output. */
  terminal?: boolean | "transcript";
  /** Above the code: what to do with it, where it goes. */
  note?: Child;
}

export const codeTabsStyles = variants({
  slots: {
    root: arc(layout.minZero),
    panel: arc(layout.column, gap[3], layout.minZero),
    note: arc(type.body, fg.muted),
  },
});

type Slots = ReturnType<typeof codeTabsStyles>;

export interface CodeTabsProps extends Customisable<Slots> {
  items: readonly CodeTab[];
  /** Names the tab list: "Install", "Connect a client". */
  "aria-label": string;
  selectedKey?: string;
  defaultSelectedKey?: string;
  onSelectionChange?: (id: string) => void;
  /**
   * Tabs with the same `group` show the same choice: picking the package
   * manager in one picks it in every other on the page, and on the next page
   * the choice is still made.
   */
  group?: string;
  /** @default "grammar" */
  highlighter?: "grammar" | "light";
  lineNumbers?: boolean;
  wrap?: boolean;
  maxHeight?: string | number;
}

type Listener = (id: string) => void;

const groups = new Map<string, Set<Listener>>();

function storageKey(group: string): string {
  return `arc-code-tabs:${group}`;
}

function remembered(group: string): string | undefined {
  try {
    return localStorage.getItem(storageKey(group)) ?? undefined;
  } catch {
    return undefined;
  }
}

function remember(group: string, id: string, from: Listener): void {
  try {
    localStorage.setItem(storageKey(group), id);
  } catch {
    // A choice not remembered is still made on this page.
  }
  for (const listener of groups.get(group) ?? []) if (listener !== from) listener(id);
}

interface PanelProps {
  tab: CodeTab;
  props: CodeTabsProps;
  classes: Slots;
}

function Panel(props: PanelProps) {
  return (
    <div class={props.classes.panel} data-slot="code-tabs-panel">
      <Show when={props.tab.note !== undefined}>
        <div class={props.classes.note} data-slot="code-tabs-note">
          {props.tab.note}
        </div>
      </Show>
      <Show
        when={props.tab.terminal !== undefined && props.tab.terminal !== false}
        fallback={
          <CodeBlock
            code={props.tab.code}
            language={props.tab.language}
            filename={props.tab.filename}
            label={props.tab.filename === undefined ? props.tab.label : undefined}
            highlighter={props.props.highlighter}
            lineNumbers={props.props.lineNumbers}
            wrap={props.props.wrap}
            maxHeight={props.props.maxHeight}
          />
        }
      >
        <TerminalBlock
          code={props.tab.code}
          transcript={props.tab.terminal === "transcript"}
          language={props.tab.language}
          filename={props.tab.filename}
          highlighter={props.props.highlighter}
          wrap={props.props.wrap}
          maxHeight={props.props.maxHeight}
        />
      </Show>
    </div>
  );
}

/**
 * The same thing done several ways, a tab each: the install command per
 * package manager, the config per client, the job per CI provider.
 *
 * ```tsx
 * <CodeTabs
 *   aria-label="Install"
 *   group="package-manager"
 *   items={[
 *     { id: "bun", label: "bun", code: "bun add @barqjs/arc", terminal: true },
 *     { id: "npm", label: "npm", code: "npm install @barqjs/arc", terminal: true },
 *   ]}
 * />
 * ```
 *
 * The tab row scrolls under a finger when it does not fit. The code is
 * whatever the caller makes it, so options that rewrite a command (a key
 * inline or as a variable, a flag left out at its default) are a function of
 * the caller's state, and `shellQuote` quotes a value that needs it. With
 * `group`, the server and the first render show the default tab and the
 * remembered one takes over once the page is live.
 */
export function CodeTabs(props: CodeTabsProps) {
  function cls(): Slots {
    return parts(codeTabsStyles(), props.classes);
  }
  function has(id: string | undefined): id is string {
    return id !== undefined && props.items.some((one) => one.id === id && one.hidden !== true);
  }
  const [selected, setSelected] = controllable<string | undefined>(
    () => props.selectedKey,
    () => props.defaultSelectedKey ?? props.items.find((one) => one.hidden !== true)?.id,
    (next) => {
      if (next !== undefined) props.onSelectionChange?.(next);
    },
  );
  const [ready, setReady] = createSignal(false, { ownedWrite: true });
  const group = untrack(() => props.group);
  const listener: Listener = (id) => {
    if (has(id)) setSelected(id);
  };
  if (group !== undefined && !isServer) {
    onSettled(() => {
      let listeners = groups.get(group);
      if (listeners === undefined) {
        listeners = new Set();
        groups.set(group, listeners);
      }
      listeners.add(listener);
      const stored = remembered(group);
      if (untrack(() => props.selectedKey) === undefined && has(stored)) setSelected(stored);
      setReady(true);
    });
    onCleanup(() => groups.get(group)?.delete(listener));
  }
  function choose(id: string): void {
    setSelected(id);
    if (group !== undefined && untrack(ready)) remember(group, id, listener);
  }
  function tabOf(item: TabItem): CodeTab | undefined {
    return props.items.find((one) => one.id === item.id);
  }
  return (
    <ResponsiveTabs
      items={props.items}
      aria-label={props["aria-label"]}
      selectedKey={selected()}
      onSelectionChange={choose}
      overflow="scroll"
      class={arc(cls().root, props.class, props.className)}
    >
      {(item: TabItem) => (
        <Show when={tabOf(item)}>
          {(tab: () => CodeTab) => <Panel tab={tab()} props={props} classes={cls()} />}
        </Show>
      )}
    </ResponsiveTabs>
  );
}

const PLAIN = /^[\w@%+=:,./-]+$/;
const VARIABLE = /\$(?:\{[A-Za-z_]\w*\}|[A-Za-z_]\w*)/;

/**
 * `value` as one shell word: as it is when it needs no quoting, in double
 * quotes when it holds a `$VARIABLE` the shell should expand, in single
 * quotes otherwise, so spaces, wildcards and quotes reach the command intact.
 *
 * ```ts
 * shellQuote("eu-west-1"); // eu-west-1
 * shellQuote("$API_TOKEN"); // "$API_TOKEN"
 * shellQuote("*.example.com"); // '*.example.com'
 * ```
 */
export function shellQuote(value: string): string {
  if (value !== "" && PLAIN.test(value)) return value;
  if (VARIABLE.test(value)) return `"${value.replace(/["\\`]/g, "\\$&")}"`;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
