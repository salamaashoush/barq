/**
 * shadcn's `/create` customizer, over this package's data.
 *
 * A dark card docked at the side, a column of pickers, and a footer that hands
 * the result over. Every control drives `installTheme` and every one previews
 * on hover, which is the interaction the page exists for: choosing a colour
 * scheme is comparing, and a list you have to click and undo is a different
 * task from one you sweep.
 *
 * FOUR OF SHADCN'S CONTROLS ARE NOT HERE, and none of them by omission. `Style`
 * (base-nova and the rest), `Icon Library`, `Menu Color` and `Menu Accent`
 * belong to the NEW upstream registry, whose look lives in a stylesheet rather
 * than in the class lists `tools/css.ts` transcribes. This package targets the
 * classic registry, so those four have nothing here to change and a control
 * that changes nothing is worse than an absent one.
 */

import { For, signal, type Incoming } from "@barqjs/core";
import { css, layer } from "@barqjs/css";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Label,
  Separator,
  Switch,
  themeCss,
  themeValues,
} from "@barqjs/ui";
import { Check } from "@barqjs/lucide/icons/check";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Dices } from "@barqjs/lucide/icons/dices";
import { RotateCcw } from "@barqjs/lucide/icons/rotate-ccw";

import { ACCENTS, BASES, CHARTS, FONTS, MONO, RADII, type Option } from "./options.ts";
import { Picker } from "./picker.tsx";
import { selectionOf, type Design, type Params } from "./params.ts";

const ui = layer("barq.ui");

const card = ui({
  position: "sticky",
  top: "calc(var(--spacing) * 6)",
  isolation: "isolate",
  zIndex: "10",
  alignSelf: "start",
  maxHeight: "calc(100dvh - var(--spacing) * 12)",
  minHeight: "0",
  width: "100%",
  borderRadius: "calc(var(--radius) + 8px)",
  "--ui-backdrop-blur": "blur(var(--blur-xl))",
  backdropFilter: "var(--ui-backdrop-blur,)",
  "@media (width >= 48rem)": {
    width: "var(--customizer-width)",
  },
});

const body = css`
  display: flex;
  flex-direction: column;
  gap: 0.8125rem;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
`;

const foot = css`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;

  & > * {
    width: 100%;
  }
`;

const head = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  min-width: 0;
`;

const title = css`
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
`;

const mode = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: none;
  white-space: nowrap;
`;

const code = css`
  max-height: 20rem;
  overflow: auto;
  margin: 0.75rem 0 0;
  padding: 0.75rem 0.875rem;
  border-radius: var(--radius);
  background: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  line-height: 1.7;
`;

const line = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted-foreground);
  white-space: pre;
`;

const chip = css`
  display: inline-block;
  flex: none;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 2px;
  border: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
`;

/** A value worth drawing a square for: every colour here is a colour function. */
function isColour(value: string): boolean {
  return /^(?:oklch|oklab|rgb|hsl|color|#)/i.test(value);
}

function pick(options: readonly Option[]): string {
  const at = Math.floor(Math.random() * options.length);
  return options[at]?.value ?? options[0]?.value ?? "";
}

function Declarations(props: Incoming<{ tokens: Record<string, string> }>) {
  return (
    <For each={() => Object.entries(props.tokens())}>
      {(entry: [string, string]) => (
        <div class={line}>
          <span
            class={chip}
            style={{ background: isColour(entry[1]) ? entry[1] : "transparent" }}
          />
          <span>
            {"  --"}
            {entry[0]}: {entry[1]};
          </span>
        </div>
      )}
    </For>
  );
}

export function Customizer(props: Incoming<{ design: Design }>) {
  const took = signal(false);
  const showing = signal(false);

  const now = (): Params => props.design().params();
  const set = (next: Partial<Params>): void => props.design().set(next);
  const preview = (next: Partial<Params> | null): void => props.design().preview(next);

  const copy = (): void => {
    void navigator.clipboard.writeText(themeCss(selectionOf(now())));
    took.set(true);
    setTimeout(() => took.set(false), 2000);
  };

  const randomise = (): void => {
    set({
      base: pick(BASES),
      accent: pick(ACCENTS),
      chart: pick(CHARTS),
      radius: pick(RADII),
      font: pick(FONTS),
    });
  };

  return (
    // `dark` on the CARD, which is what shadcn does and is not decoration: the
    // customizer is chrome, and chrome that changes colour with the thing it is
    // configuring stops being a fixed point to judge the change against.
    // `themeCss` writes `.dark { … }`, so the class puts those tokens on this
    // element and its subtree inherits them, whatever the page is set to.
    <Card class={ui(card, "dark")} data-slot="customizer">
      <CardHeader>
        <div class={head}>
          <h2 class={title}>@barqjs/ui</h2>
          <div class={mode}>
            <Label for="dark-mode">Dark</Label>
            <Switch
              id="dark-mode"
              aria-label="Dark mode"
              isSelected={now().dark}
              onChange={(on: boolean) => set({ dark: on })}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div class={body}>
          <Picker
            label="Base Color"
            options={BASES}
            value={now().base}
            onPick={(value: string) => set({ base: value })}
            onPreview={(value: string | null) => preview(value === null ? null : { base: value })}
          />
          <Picker
            label="Theme"
            options={ACCENTS}
            value={now().accent}
            onPick={(value: string) => set({ accent: value })}
            onPreview={(value: string | null) => preview(value === null ? null : { accent: value })}
          />
          <Picker
            label="Chart Color"
            options={CHARTS}
            value={now().chart}
            onPick={(value: string) => set({ chart: value })}
            onPreview={(value: string | null) => preview(value === null ? null : { chart: value })}
          />
          <Separator />
          <Picker
            label="Font"
            options={FONTS}
            value={now().font}
            onPick={(value: string) => set({ font: value })}
            onPreview={(value: string | null) => preview(value === null ? null : { font: value })}
          />
          <Picker
            label="Mono"
            options={MONO}
            value={now().mono}
            onPick={(value: string) => set({ mono: value })}
            onPreview={(value: string | null) => preview(value === null ? null : { mono: value })}
          />
          <Separator />
          <Picker
            label="Radius"
            options={RADII}
            value={now().radius}
            onPick={(value: string) => set({ radius: value })}
            onPreview={(value: string | null) => preview(value === null ? null : { radius: value })}
          />
        </div>
      </CardContent>

      <CardFooter>
        <div class={foot}>
          <Button size="sm" onPress={copy} data-slot="copy-preset">
            {took() ? <Check /> : <Copy />}
            {took() ? "Copied" : "Copy Preset"}
          </Button>
          <Button size="sm" variant="outline" onPress={randomise} data-slot="randomise">
            <Dices />
            Random
          </Button>
          <Button
            size="sm"
            variant="outline"
            onPress={() => props.design().reset()}
            data-slot="reset"
          >
            <RotateCcw />
            Reset
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => showing.set(!showing())}
            data-slot="toggle-code"
          >
            {showing() ? "Hide CSS" : "Show CSS"}
          </Button>

          {showing() ? (
            <div class={code} data-slot="preset-code">
              <div class={line}>@layer barq.theme {"{"}</div>
              <div class={line}>:root {"{"}</div>
              <Declarations tokens={() => themeValues(selectionOf(now())).light} />
              <div class={line}>{"}"}</div>
              <div class={line}>.dark {"{"}</div>
              <Declarations tokens={() => themeValues(selectionOf(now())).dark} />
              <div class={line}>{"}"}</div>
              <div class={line}>{"}"}</div>
            </div>
          ) : null}
        </div>
      </CardFooter>
    </Card>
  );
}
