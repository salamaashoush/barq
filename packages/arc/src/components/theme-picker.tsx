import { type Child, Show, createMemo } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Monitor } from "@barqjs/lucide/icons/monitor";
import { Moon } from "@barqjs/lucide/icons/moon";
import { Sun } from "@barqjs/lucide/icons/sun";
import { type SchemeChoice, useColorScheme } from "@barqjs/primitives/color-scheme";
import type { ThemeTokens } from "@barqjs/ui/theme";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { type ArcThemeSelection, arcThemeValues } from "../theme/index.ts";
import { bg, gap, layout, place, rounded, space, surface } from "../style/index.ts";
import { type ChoiceOption, RadioCards } from "./choice-cards.tsx";
import { type ArcMessages, useArcMessages } from "./messages.ts";
import { SegmentedControl } from "./segmented-control.tsx";
import type { ThemeToggleLabels } from "./theme-toggle.tsx";

export type ThemeChoice = SchemeChoice<"light" | "dark">;

const bar = arc(rounded.full, { display: "block", height: space.x1_5 });

export const themePickerStyles = variants({
  slots: {
    root: arc({}),
    preview: arc(layout.row, place.fill, { alignItems: "stretch" }),
    half: arc(layout.row, layout.grow, bg.page, gap[1.5], { padding: space.x2, minWidth: "0px" }),
    rail: arc(bg.muted, rounded.sm, { display: "block", width: "22%" }),
    card: arc(surface.card, layout.column, layout.grow, gap[1.5], { padding: space.x2 }),
    line: arc(bar, bg.muted),
    short: arc(bar, bg.muted, { width: "70%" }),
    accent: arc(bar, bg.primary, { width: "40%" }),
  },
});

type Slots = ReturnType<typeof themePickerStyles>;

/** A theme's colours under the token names the preview draws with. */
function scoped(tokens: ThemeTokens): Record<string, string> {
  const names = ["background", "card", "card-foreground", "border", "muted", "primary"];
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = tokens[name];
    if (value !== undefined) out[`--${name}`] = value;
  }
  return out;
}

interface HalfProps {
  tokens: ThemeTokens;
  cls: Slots;
}

/** A page drawn small in one theme: a rail, a card with two lines of text and a button. */
function Half(props: HalfProps) {
  return (
    <span class={props.cls.half} style={scoped(props.tokens)} data-slot="theme-preview-half">
      <span class={props.cls.rail} />
      <span class={props.cls.card}>
        <span class={props.cls.line} />
        <span class={props.cls.short} />
        <span class={props.cls.accent} />
      </span>
    </span>
  );
}

export interface ThemePreviewProps extends Customisable<Slots> {
  choice: ThemeChoice;
  /** The theme the preview is drawn in. @default arc's neutral theme */
  theme?: ArcThemeSelection;
}

/** A theme drawn small: light, dark, or both halves for the device's choice. */
export function ThemePreview(props: ThemePreviewProps) {
  function cls(): Slots {
    return parts(themePickerStyles(), props.classes);
  }
  function values() {
    return arcThemeValues(props.theme ?? { base: "neutral" });
  }
  return (
    <span class={arc(cls().preview, props.class, props.className)} data-slot="theme-preview">
      <Show when={props.choice !== "dark"}>
        <Half tokens={values().light} cls={cls()} />
      </Show>
      <Show when={props.choice !== "light"}>
        <Half tokens={values().dark} cls={cls()} />
      </Show>
    </span>
  );
}

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

const CHOICES: readonly ThemeChoice[] = ["light", "dark", "system"];

export interface ThemePickerProps extends Customisable<Slots> {
  /** @default the provider's `theme`, "Theme" */
  label?: Child;
  description?: Child;
  labels?: ThemeToggleLabels;
  /**
   * `cards` draws each theme small, for a settings page; `segmented` is three
   * buttons in a row, for a header or a footer. @default "cards"
   */
  variant?: "cards" | "segmented";
  /** The theme the previews are drawn in. @default arc's neutral theme */
  theme?: ArcThemeSelection;
  /** Told of a choice once it is made, to keep it on the reader's account too. */
  onChange?: (choice: ThemeChoice) => void;
  isDisabled?: boolean;
}

/**
 * Light, dark, or what the device asks for, chosen where every option shows:
 * cards with each theme drawn small, or a row of three buttons.
 *
 * ```tsx
 * <ThemePicker onChange={(choice) => saveProfile({ theme: choice })} />
 * ```
 *
 * It reads and sets the `colorScheme()` `<ArcProvider>` set up, as
 * `ThemeToggle` does, and marks the CHOICE, which the server already knows
 * from its cookie, so the page it sends is right before it hydrates.
 */
export function ThemePicker(props: ThemePickerProps) {
  const scheme = useColorScheme();
  const messages = useArcMessages();
  function text(name: keyof ThemeToggleLabels & keyof ArcMessages): string {
    return props.labels?.[name] ?? messages()[name];
  }
  function choose(next: string): void {
    const choice = next as ThemeChoice;
    scheme.set(choice);
    props.onChange?.(choice);
  }
  const cards = createMemo((): ChoiceOption[] =>
    CHOICES.map((choice) => ({
      value: choice,
      label: text(choice),
      media: <ThemePreview choice={choice} theme={props.theme} classes={props.classes} />,
    })),
  );
  return (
    <Show
      when={props.variant === "segmented"}
      fallback={
        <RadioCards
          label={props.label ?? text("theme")}
          description={props.description}
          options={cards()}
          minCardWidth="9rem"
          mediaRatio="8 / 5"
          isDisabled={props.isDisabled}
          value={scheme.choice()}
          onChange={(value: string | null) => {
            if (value !== null) choose(value);
          }}
          class={arc(props.class, props.className)}
          classes={{ root: props.classes?.root }}
        />
      }
    >
      <SegmentedControl
        aria-label={typeof props.label === "string" ? props.label : text("theme")}
        size="sm"
        isDisabled={props.isDisabled}
        items={CHOICES.map((choice) => ({
          value: choice,
          label: text(choice),
          icon: ICONS[choice],
        }))}
        value={scheme.choice()}
        onChange={choose}
        class={arc(props.classes?.root, props.class, props.className)}
      />
    </Show>
  );
}
