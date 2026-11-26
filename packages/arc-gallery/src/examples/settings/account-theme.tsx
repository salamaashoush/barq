import { createEffect, createSignal, untrack } from "@barqjs/core";
import { useColorScheme } from "@barqjs/primitives/color-scheme";
import { SettingRow, SettingsSection, ThemeToggle, toast, useThemeAccountSync } from "@barqjs/arc";

type Theme = "light" | "dark" | "system";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function AccountThemeExample() {
  const scheme = useColorScheme();
  const [account, setAccount] = createSignal<Theme | undefined>(undefined);
  const [offline, setOffline] = createSignal(false);
  // The account's choice arrives a moment after the page, as a profile query's
  // would; here it is the gallery's own, so opening the page changes nothing.
  createEffect(
    () => true,
    () => {
      const timer = setTimeout(() => setAccount(untrack(scheme.choice)), 400);
      return () => clearTimeout(timer);
    },
  );
  const sync = useThemeAccountSync({
    saved: account,
    save: async (theme) => {
      await wait(500);
      if (offline()) throw new Error("the profile service is not answering");
      setAccount(theme);
      toast.success(`Theme saved to your account: ${theme}`);
    },
  });
  return (
    <SettingsSection
      heading="Appearance"
      description="Your theme follows you to every device you sign in on."
      list={
        <>
          <SettingRow
            label="Theme"
            description={
              sync.pending()
                ? "Saving to your account…"
                : (sync.error() ?? `On your account: ${account() ?? "loading"}`)
            }
            control={() => <ThemeToggle variant="outline" />}
          />
          <SettingRow
            label="Pretend the profile service is down"
            description="The next theme you pick stays on this device and says why."
            checked={offline()}
            onCheckedChange={(on: boolean) => setOffline(on)}
          />
        </>
      }
    />
  );
}
