import { variants } from "@barqjs/css";
import { Monitor } from "@barqjs/lucide/icons/monitor";
import { Moon } from "@barqjs/lucide/icons/moon";
import { Sun } from "@barqjs/lucide/icons/sun";
import { type SchemeChoice, useColorScheme } from "@barqjs/primitives/color-scheme";
import { Button, type ButtonSize, type ButtonVariant } from "@barqjs/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { type ArcMessages, useArcMessages } from "./messages.ts";

export const themeToggleStyles = variants({
  slots: { root: arc({}), content: arc({}), item: arc({}) },
});

type Slots = ReturnType<typeof themeToggleStyles>;

type Choice = SchemeChoice<"light" | "dark">;

export interface ThemeToggleLabels {
  /** Names the button. @default "Theme" */
  theme?: string;
  /** @default "Light" */
  light?: string;
  /** @default "Dark" */
  dark?: string;
  /** @default "System" */
  system?: string;
}

export interface ThemeToggleProps extends Customisable<Slots> {
  labels?: ThemeToggleLabels;
  /** @default "ghost" */
  variant?: ButtonVariant;
  /** @default "icon" */
  size?: ButtonSize;
  /** @default "end" */
  align?: "start" | "center" | "end";
}

/**
 * Light, dark, or whatever the device asks for, from a menu on one button.
 *
 * ```tsx
 * <ArcProvider>
 *   <ThemeToggle />
 * </ArcProvider>
 * ```
 *
 * It reads the `colorScheme()` an ancestor set up, which `<ArcProvider>` does.
 * The icon shows the CHOICE rather than the theme it resolves to: a server
 * knows the choice from its cookie, but `system` resolves only once the page
 * has hydrated, and an icon drawn from that would differ between the two.
 */
export function ThemeToggle(props: ThemeToggleProps) {
  const scheme = useColorScheme();
  function choice(): Choice {
    return scheme.choice();
  }
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(themeToggleStyles(), props.classes);
  }
  function text(name: keyof ThemeToggleLabels & keyof ArcMessages): string {
    return props.labels?.[name] ?? messages()[name];
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          variant={props.variant ?? "ghost"}
          size={props.size ?? "icon"}
          class={arc(cls().root, props.class, props.className)}
          aria-label={text("theme")}
          data-slot="theme-toggle"
          data-choice={choice()}
        >
          {choice() === "dark" ? (
            <Moon aria-hidden="true" />
          ) : choice() === "light" ? (
            <Sun aria-hidden="true" />
          ) : (
            <Monitor aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        class={cls().content}
        align={props.align ?? "end"}
        aria-label={text("theme")}
      >
        <DropdownMenuRadioGroup
          value={choice()}
          onValueChange={(value: string) => scheme.set(value as Choice)}
        >
          <DropdownMenuRadioItem class={cls().item} value="light">
            {text("light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem class={cls().item} value="dark">
            {text("dark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem class={cls().item} value="system">
            {text("system")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
