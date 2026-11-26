import { type Accessor, createEffect, createSignal, runWithOwner, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Monitor } from "@barqjs/lucide/icons/monitor";
import { Moon } from "@barqjs/lucide/icons/moon";
import { Sun } from "@barqjs/lucide/icons/sun";
import { type SchemeChoice, useColorScheme } from "@barqjs/primitives/color-scheme";
import { Button, type ButtonSize, type ButtonVariant } from "@barqjs/ui/button";
import { toast } from "@barqjs/ui/sonner";
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
import { serverMessage } from "./server-message.ts";

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

// --- the account's theme ---------------------------------------------------------------

export interface ThemeAccountSyncOptions {
  /** The choice the account holds, as the server last said; `undefined` until it has loaded. */
  saved: () => Choice | undefined;
  /** Stores a choice made on this device on the account. A rejection is its failure. */
  save: (choice: Choice) => unknown;
}

export interface ThemeAccountSync {
  /** While a choice is being saved. */
  pending: Accessor<boolean>;
  /** Why the last save failed, until one succeeds. */
  error: Accessor<string | undefined>;
}

/**
 * Keeps the theme on the reader's account as well as in this browser, so a
 * choice made on one device follows them to the next.
 *
 * ```tsx
 * useThemeAccountSync({
 *   saved: () => me()?.preferences.theme,
 *   save: (theme) => api.updateMe({ theme }),
 * });
 * <ThemeToggle />
 * ```
 *
 * The browser's cookie still paints the first frame, so nothing flashes;
 * once the account's choice has loaded it wins, and it follows the account
 * whenever that changes. A choice made here, from `ThemeToggle` or any
 * picker on the same `colorScheme()`, is saved to the account; a save that
 * fails keeps the choice on this device and says so in a toast.
 */
export function useThemeAccountSync(options: ThemeAccountSyncOptions): ThemeAccountSync {
  const scheme = useColorScheme();
  const messages = useArcMessages();
  const [pending, setPending] = createSignal(false, { ownedWrite: true });
  const [error, setError] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  let known = untrack(options.saved);
  let turn = 0;

  async function store(choice: Choice): Promise<void> {
    const mine = ++turn;
    setPending(true);
    try {
      await options.save(choice);
      if (mine !== turn) return;
      known = choice;
      setError(undefined);
    } catch (failure) {
      if (mine !== turn) return;
      const reason = serverMessage(failure, messages().actionFailed);
      setError(reason);
      toast.error(messages().themeNotSaved, { description: reason });
    } finally {
      if (mine === turn) setPending(false);
    }
  }

  createEffect(options.saved, (saved) => {
    if (saved === undefined) return;
    known = saved;
    if (untrack(scheme.choice) !== saved) runWithOwner(null, () => scheme.set(saved));
  });
  createEffect(
    () => scheme.choice(),
    (choice) => {
      if (choice !== known) void store(choice);
    },
    { defer: true },
  );
  return { pending, error };
}
