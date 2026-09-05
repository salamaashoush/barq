/**
 * shadcn's `/create` customizer, ported from
 * `apps/v4/app/(app)/(create)/components/customizer.tsx`.
 *
 * A `<Card size="sm">` carrying `dark`, docked on the right of the designer: a
 * header holding the main menu, a `<FieldGroup>` of pickers with a
 * `<FieldSeparator>` between each run, and two footers — the row of actions,
 * then Get Code on its own.
 *
 * The card is `dark` and its theme is the page's fixed one rather than the
 * previewed one, which is what upstream's `<iframe>` buys them for free: the
 * configurator is chrome, and chrome that changes with the thing it configures
 * stops being a fixed point to judge the change against. See `params.ts`.
 *
 * FOUR OF SHADCN'S CONTROLS ARE NOT HERE, and each for a stated reason.
 * `Icon Library` is lucide only in this package, by decision. `Menu Color` and
 * `Menu Accent` drive `.cn-menu-target` and `.cn-menu-translucent`, which
 * belong to upstream's newer registry — this package targets the classic one,
 * and `tools/styles.ts` records both as deliberate divergences. `Base` picks
 * between shadcn's three component bases, and there is one here.
 */

import { signal, type Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  FieldGroup,
  FieldSeparator,
} from "@barqjs/ui";

import { ActionMenu } from "./action-menu.tsx";
import { FontGlyph, RadiusGlyph, StyleGlyph } from "./glyphs.tsx";
import { footerButton, growingFooterButton, narrowFooterButton, truncated } from "./layout.ts";
import { MainMenu } from "./main-menu.tsx";
import { OpenPreset } from "./open-preset.tsx";
import { ProjectForm } from "./project-form.tsx";
import { ResetDialog } from "./reset-dialog.tsx";
import {
  BASE_COLORS,
  CHART_COLORS,
  FONTS,
  HEADING_FONTS,
  MONO,
  optionOf,
  RADII,
  STYLES,
  THEMES,
  type Option,
} from "./options.ts";
import { Picker } from "./picker.tsx";
import { commandFor, type Design, type Params } from "./params.ts";

const ui = layer("barq.ui");

const card = ui({
  isolation: "isolate",
  zIndex: "10",
  maxHeight: "100%",
  minHeight: "0px",
  width: "100%",
  alignSelf: "flex-start",
  borderRadius: "var(--radius-2xl)",
  backgroundColor: "var(--card)",
  "@supports (color: color-mix(in lab, red, red))": {
    backgroundColor: "color-mix(in oklab, var(--card) 90%, transparent)",
  },
  "--ui-backdrop-blur": "blur(var(--blur-xl))",
  backdropFilter: "var(--ui-backdrop-blur,)",
  "@media (width >= 48rem)": {
    width: "var(--customizer-width)",
  },
});

const head = ui({
  display: "none",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "calc(var(--spacing) * 2)",
  "@media (width >= 48rem)": {
    display: "flex",
  },
});

const body = ui({
  msOverflowStyle: "none",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
  minHeight: "0px",
  flex: "1",
  overflowX: "auto",
  overflowY: "hidden",
  "@media (width >= 48rem)": {
    overflowY: "auto",
  },
});

const fields = ui({
  flexDirection: "row",
  gap: "calc(var(--spacing) * 2.5)",
  paddingBlock: "1px",
  // `**:data-[slot=field-separator]:-mx-4` upstream: the rule runs the full
  // width of the card rather than stopping at the content's padding.
  '& [data-slot="field-separator"]': {
    marginInline: "calc(var(--spacing) * -4)",
    width: "auto",
  },
  "@media (width >= 48rem)": {
    flexDirection: "column",
    gap: "calc(var(--spacing) * 3.25)",
  },
});

/** A separator only the column layout draws: the mobile row scrolls instead. */
const columnOnly = ui({
  display: "none",
  "@media (width >= 48rem)": { display: "block" },
});

const foot = ui({
  display: "flex",
  minWidth: "0px",
  gap: "calc(var(--spacing) * 2)",
  "@media (width >= 48rem)": {
    flexDirection: "column",
    borderBottomRightRadius: "0",
    borderBottomLeftRadius: "0",
    "& button, & a": { width: "100%" },
  },
});

const footCode = ui({
  marginTop: "calc(var(--spacing) * -3)",
  display: "none",
  minWidth: "0px",
  gap: "calc(var(--spacing) * 2)",
  "@media (width >= 48rem)": {
    display: "flex",
    flexDirection: "column",
    "& button, & a": { width: "100%" },
  },
});

/** The lists whose second group is separated by a rule are named by their group. */
function pick(options: readonly Option[]): string {
  const at = Math.floor(Math.random() * options.length);
  return options[at]?.value ?? options[0]?.value ?? "";
}

/**
 * The radius a style has already decided.
 *
 * `lyra` squares every corner and `sera` keeps them fine, so upstream disables
 * the control rather than offering a choice the style overrules — a picker that
 * appears to do nothing reads as a bug in the picker.
 */
function radiusIsFixed(style: string): boolean {
  return style === "lyra" || style === "sera";
}

export function Customizer(props: Incoming<{ design: Design }>) {
  const searching = signal(false);
  const resetting = signal(false);
  const now = (): Params => props.design().params();
  const set = (next: Partial<Params>): void => props.design().set(next);
  const preview = (next: Partial<Params>): void => props.design().preview(next);
  const clear = (): void => props.design().clearPreview();

  const shuffle = (): void => {
    set({
      style: pick(STYLES),
      baseColor: pick(BASE_COLORS),
      theme: pick(THEMES),
      chartColor: pick(CHART_COLORS),
      radius: pick(RADII),
      font: pick(FONTS),
      fontHeading: pick(HEADING_FONTS),
    });
  };

  const toggleDark = (): void => set({ dark: !now().dark });

  /**
   * What the heading glyph is set in.
   *
   * `inherit` means the body font, so the glyph has to resolve it rather than
   * showing the browser's default: the point of the control is seeing the shape
   * the headings will actually have.
   */
  const headingStack = (): string | undefined =>
    now().fontHeading === "inherit"
      ? optionOf(FONTS, now().font)?.css
      : optionOf(HEADING_FONTS, now().fontHeading)?.css;

  return (
    <Card size="sm" class={ui(card, "dark")} data-slot="customizer">
      <CardHeader bordered class={head}>
        <MainMenu
          design={props.design()}
          onShuffle={shuffle}
          onToggleDark={toggleDark}
          onSearch={() => searching.set(true)}
          onReset={() => resetting.set(true)}
        />
      </CardHeader>

      <CardContent class={body}>
        <FieldGroup class={fields}>
          <Picker
            label="Style"
            options={STYLES}
            value={now().style}
            glyph={<StyleGlyph name={now().style} />}
            onPick={(value: string) => set({ style: value })}
            onPreview={(value: string) => preview({ style: value })}
            clearPreview={clear}
          />

          <FieldSeparator class={columnOnly} />

          <Picker
            label="Base Color"
            options={BASE_COLORS}
            value={now().baseColor}
            onPick={(value: string) => set({ baseColor: value })}
            onPreview={(value: string) => preview({ baseColor: value })}
            clearPreview={clear}
          />
          <Picker
            label="Theme"
            options={THEMES}
            value={now().theme}
            onPick={(value: string) => set({ theme: value })}
            onPreview={(value: string) => preview({ theme: value })}
            clearPreview={clear}
          />
          <Picker
            label="Chart Color"
            options={CHART_COLORS}
            value={now().chartColor}
            onPick={(value: string) => set({ chartColor: value })}
            onPreview={(value: string) => preview({ chartColor: value })}
            clearPreview={clear}
          />

          <FieldSeparator class={columnOnly} />

          <Picker
            label="Heading"
            options={HEADING_FONTS}
            value={now().fontHeading}
            glyph={<FontGlyph stack={headingStack()} />}
            onPick={(value: string) => set({ fontHeading: value })}
            onPreview={(value: string) => preview({ fontHeading: value })}
            clearPreview={clear}
          />
          <Picker
            label="Font"
            options={FONTS}
            value={now().font}
            glyph={<FontGlyph stack={optionOf(FONTS, now().font)?.css} />}
            onPick={(value: string) => set({ font: value })}
            onPreview={(value: string) => preview({ font: value })}
            clearPreview={clear}
          />
          <Picker
            label="Mono"
            options={MONO}
            value={now().mono}
            glyph={<FontGlyph stack={optionOf(MONO, now().mono)?.css} />}
            onPick={(value: string) => set({ mono: value })}
            onPreview={(value: string) => preview({ mono: value })}
            clearPreview={clear}
          />

          <FieldSeparator class={columnOnly} />

          <Picker
            label="Radius"
            options={RADII}
            value={radiusIsFixed(now().style) ? "0" : now().radius}
            disabled={radiusIsFixed(now().style)}
            glyph={<RadiusGlyph />}
            onPick={(value: string) => set({ radius: value })}
            onPreview={(value: string) => preview({ radius: value })}
            clearPreview={clear}
          />
        </FieldGroup>
      </CardContent>

      {/* Four controls, which is upstream's footer exactly. Search and Reset
          are NOT buttons here: both are in the menu, and both render only their
          dialog — a footer of six is a different page. */}
      <CardFooter class={foot}>
        <CopyPreset design={props.design()} />
        <OpenPreset design={props.design()} class={growingFooterButton} />
        <Button
          variant="outline"
          class={ui(footerButton, narrowFooterButton)}
          onPress={shuffle}
          data-slot="shuffle"
        >
          <span class={truncated}>Shuffle</span>
        </Button>
        <ActionMenu
          design={props.design()}
          isOpen={searching()}
          onOpenChange={(next: boolean) => searching.set(next)}
        />
        <ResetDialog
          design={props.design()}
          isOpen={resetting()}
          onOpenChange={(next: boolean) => resetting.set(next)}
        />
      </CardFooter>

      <CardFooter class={footCode}>
        <ProjectForm design={props.design()} />
      </CardFooter>
    </Card>
  );
}

/**
 * The command that reproduces what is on the screen, on the clipboard.
 *
 * shadcn copies a preset CODE, which is a nine-character hash their server can
 * decode. There is no server here, so the honest equivalent is the command
 * itself: it is longer, and it is the thing you were going to run anyway.
 */
function CopyPreset(props: Incoming<{ design: Design }>) {
  const took = signal(false);

  const copy = (): void => {
    void navigator.clipboard.writeText(commandFor(props.design().params()));
    took.set(true);
    setTimeout(() => took.set(false), 2000);
  };

  return (
    <Button
      variant="outline"
      class={ui(footerButton, growingFooterButton)}
      onPress={copy}
      data-slot="copy-preset"
      title={commandFor(props.design().params())}
    >
      <span class={truncated}>{took() ? "Copied" : commandFor(props.design().params())}</span>
    </Button>
  );
}
