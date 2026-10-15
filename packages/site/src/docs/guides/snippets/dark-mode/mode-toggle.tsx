import { createSignal, onSettled, Show } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Moon } from "@barqjs/lucide/icons/moon";
import { Sun } from "@barqjs/lucide/icons/sun";
import { Button } from "@barqjs/ui";

const KEY = "theme";

const surface = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background-color: var(--background);
  color: var(--foreground);
  padding: calc(var(--spacing) * 4);
`;

export default function ModeToggle() {
  const [dark, setDark] = createSignal(false);

  onSettled(() => {
    setDark(localStorage.getItem(KEY) === "dark");
  });

  const toggle = (): void => {
    const next = !dark();
    setDark(next);
    localStorage.setItem(KEY, next ? "dark" : "light");
  };

  return (
    <div class={`${surface} ${dark() ? "dark" : ""}`} data-slot="mode">
      <Button variant="outline" size="icon" aria-label="Toggle theme" onPress={toggle}>
        <Show when={dark()} fallback={<Moon />}>
          <Sun />
        </Show>
      </Button>
      <span>{() => (dark() ? "Dark" : "Light")}</span>
    </div>
  );
}
