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

export interface ThemeToggleProps {
  labels?: ThemeToggleLabels;
  /** @default "ghost" */
  variant?: ButtonVariant;
  /** @default "icon" */
  size?: ButtonSize;
  /** @default "end" */
  align?: "start" | "center" | "end";
  class?: string;
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
  const choice = (): Choice => scheme.choice();
  const text = (name: keyof ThemeToggleLabels, fallback: string): string =>
    props.labels?.[name] ?? fallback;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          variant={props.variant ?? "ghost"}
          size={props.size ?? "icon"}
          class={props.class}
          aria-label={text("theme", "Theme")}
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
      <DropdownMenuContent align={props.align ?? "end"} aria-label={text("theme", "Theme")}>
        <DropdownMenuRadioGroup
          value={choice()}
          onValueChange={(value: string) => scheme.set(value as Choice)}
        >
          <DropdownMenuRadioItem value="light">{text("light", "Light")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{text("dark", "Dark")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">{text("system", "System")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
