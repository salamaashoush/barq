/**
 * Pick a theme, watch the page take it, copy the result out.
 *
 * shadcn's configurator is the thing people try before they install anything,
 * and it is three moves: choose, see, copy. This is those three over the data
 * in `@barqjs/ui/theme`, which splits them differently — seven BASES declare
 * the whole token set and seventeen ACCENTS layer a handful over one, where
 * shadcn has one flat list.
 *
 * The copy half is `themeCss`, the same function `installTheme` calls, and the
 * swatches are `themeValues`, which `themeCss` is built from. That is the one
 * design decision here: shadcn's customiser spells the CSS a second time in
 * `getThemeCodeOKLCH`, so what it shows you and what it gives you are two
 * pieces of code that have to be kept saying the same thing. These cannot
 * disagree.
 */

import { effect, For, signal, type Accessor } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  ACCENT_THEMES,
  BASE_THEMES,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  installTheme,
  Label,
  Select,
  SelectItem,
  Switch,
  themeCss,
  themeValues,
  type ThemeSelection,
} from "@barqjs/ui";
import { Check } from "@barqjs/lucide/icons/check";
import { Copy } from "@barqjs/lucide/icons/copy";

interface Entry {
  readonly id: string;
  readonly name: string;
}

const BASES: readonly Entry[] = BASE_THEMES.map((theme) => ({
  id: theme.name,
  name: theme.title,
}));

/**
 * `NONE` is a key rather than `null` because a list needs something to select.
 * The selection turns it back into an absent `accent`.
 */
const NONE = "none";

const ACCENTS: readonly Entry[] = [
  { id: NONE, name: "No accent" },
  ...ACCENT_THEMES.map((theme) => ({ id: theme.name, name: theme.title })),
];

/** shadcn's own four, plus leaving whatever the base declares. */
const RADII: readonly Entry[] = [
  { id: NONE, name: "Theme radius" },
  { id: "0", name: "None" },
  { id: "0.45rem", name: "Small" },
  { id: "0.625rem", name: "Medium" },
  { id: "0.875rem", name: "Large" },
];

const bar = css`
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin: 0 -1.5rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
  background: color-mix(in oklab, var(--background) 85%, transparent);
  backdrop-filter: blur(8px);
`;

const title = css`
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
`;

const spacer = css`
  flex: 1;
`;

const code = css`
  max-height: 22rem;
  overflow: auto;
  margin: 0;
  padding: 0.875rem 1rem;
  border-radius: var(--radius);
  background: var(--muted);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.75rem;
  line-height: 1.6;
  white-space: pre;
`;

const line = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted-foreground);
`;

const swatch = css`
  display: inline-block;
  flex: none;
  width: 0.75rem;
  height: 0.75rem;
  border: 1px solid color-mix(in oklab, var(--border) 50%, transparent);
  border-radius: 2px;
`;

const copied = css`
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--muted-foreground);
`;

/**
 * A value worth drawing a square for.
 *
 * Every colour in the table is `oklch(…)`; `--radius` is a length and
 * `--font-*` a stack, and a swatch beside either of those is noise.
 */
function isColour(value: string): boolean {
  return /^(?:oklch|oklab|rgb|hsl|color|#)/i.test(value);
}

function Declarations(props: { tokens: Accessor<Record<string, string>> }) {
  return (
    <For each={() => Object.entries(props.tokens())}>
      {(entry: [string, string]) => (
        <div class={line}>
          {isColour(entry[1]) ? (
            <span class={swatch} style={{ background: entry[1] }} />
          ) : (
            <span class={swatch} style={{ border: "0" }} />
          )}
          <span>
            {"  --"}
            {entry[0]}: {entry[1]};
          </span>
        </div>
      )}
    </For>
  );
}

export function Configurator() {
  const base = signal("neutral");
  const accent = signal(NONE);
  const radius = signal(NONE);
  const dark = signal(false);
  const took = signal(false);

  // The whole selection as ONE call, because that is what the compiler can
  // prove moves. Read piecemeal at a prop it would be bound once.
  const selection = (): ThemeSelection => ({
    base: base(),
    ...(accent() === NONE ? {} : { accent: accent() }),
    ...(radius() === NONE ? {} : { radius: radius() }),
  });

  effect(() => {
    installTheme(selection());
  });

  effect(() => {
    document.documentElement.classList.toggle("dark", dark());
  });

  const copy = () => {
    void navigator.clipboard.writeText(themeCss(selection()));
    took.set(true);
    setTimeout(() => took.set(false), 2000);
  };

  return (
    <div class={bar}>
      <h1 class={title}>@barqjs/ui</h1>
      <span class={spacer} />

      <Label for="base">Base</Label>
      <Select
        id="base"
        items={BASES}
        aria-label="Base theme"
        size="sm"
        defaultSelectedKey="neutral"
        onSelectionChange={(key) => base.set(String(key ?? "neutral"))}
      >
        {(entry: Entry) => <SelectItem>{entry.name}</SelectItem>}
      </Select>

      <Label for="accent">Accent</Label>
      <Select
        id="accent"
        items={ACCENTS}
        aria-label="Accent theme"
        size="sm"
        defaultSelectedKey={NONE}
        onSelectionChange={(key) => accent.set(String(key ?? NONE))}
      >
        {(entry: Entry) => <SelectItem>{entry.name}</SelectItem>}
      </Select>

      <Label for="radius">Radius</Label>
      <Select
        id="radius"
        items={RADII}
        aria-label="Corner radius"
        size="sm"
        defaultSelectedKey={NONE}
        onSelectionChange={(key) => radius.set(String(key ?? NONE))}
      >
        {(entry: Entry) => <SelectItem>{entry.name}</SelectItem>}
      </Select>

      <Switch aria-label="Dark mode" onChange={(on: boolean) => dark.set(on)} />
      <Label>Dark</Label>

      <Dialog>
        <DialogTrigger>
          <Button variant="secondary" size="sm">
            <Copy />
            Copy code
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>The theme, as CSS</DialogTitle>
            <DialogDescription>
              Paste this into your stylesheet. It is what installTheme registers, so what you are
              looking at is what you get.
            </DialogDescription>
          </DialogHeader>
          <div class={code}>
            <div class={line}>@layer barq.theme {"{"}</div>
            <div class={line}>:root {"{"}</div>
            <Declarations tokens={() => themeValues(selection()).light} />
            <div class={line}>{"}"}</div>
            <div class={line}>.dark {"{"}</div>
            <Declarations tokens={() => themeValues(selection()).dark} />
            <div class={line}>{"}"}</div>
            <div class={line}>{"}"}</div>
          </div>
          <div class={line}>
            <Button size="sm" onPress={copy}>
              {took() ? <Check /> : <Copy />}
              {took() ? "Copied" : "Copy"}
            </Button>
            <span class={copied}>{took() ? "On your clipboard." : ""}</span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
