import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { flush, type ParentProps } from "@barqjs/core";
import { type ColorScheme, colorScheme } from "@barqjs/primitives/color-scheme";
import { ariaViolations, render, renderAndHydrate, screen, tick, user } from "@barqjs/testing";

import { halves } from "../ssr-harness.ts";
import { ThemeToggle } from "./theme-toggle.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

interface HappyWindow {
  happyDOM: HappyPage;
}

interface HappyPage {
  setURL(url: string): void;
}

// The choice is kept in a cookie, which happy-dom stores only for a document
// with an origin.
const page = (window as unknown as HappyWindow).happyDOM;
beforeAll(() => page.setURL("http://localhost/"));
afterAll(() => page.setURL("about:blank"));
beforeEach(() => {
  document.cookie = "theme=; max-age=0; path=/";
  document.documentElement.className = "";
});

let scheme: ColorScheme | undefined;

function Scheme(props: ParentProps) {
  scheme = colorScheme();
  return <>{props.children}</>;
}

function toggle(): HTMLElement {
  return screen.getByRole("button", { name: "Theme" });
}

describe("ThemeToggle", () => {
  test("shows the choice on its button, and a menu of the three", async () => {
    render(() => (
      <Scheme>
        <ThemeToggle />
      </Scheme>
    ));
    expect(toggle().getAttribute("data-choice")).toBe("system");
    expect(toggle().getAttribute("aria-haspopup")).toBe("true");

    await user.click(toggle());
    await settle();
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual(["Light", "Dark", "System"]);
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "true",
    ]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("choosing one sets the scheme, keeps it in the cookie and puts it on the page", async () => {
    render(() => (
      <Scheme>
        <ThemeToggle />
      </Scheme>
    ));
    await user.click(toggle());
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
    await settle();
    expect(scheme?.choice()).toBe("dark");
    expect(document.cookie).toContain("theme=dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(toggle().getAttribute("data-choice")).toBe("dark");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("works from the keyboard", async () => {
    render(() => (
      <Scheme>
        <ThemeToggle labels={{ theme: "Appearance", light: "Day" }} />
      </Scheme>
    ));
    const button = screen.getByRole("button", { name: "Appearance" });
    button.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(screen.getByRole("menu")).toBeDefined();
    expect(document.activeElement?.textContent).toBe("Day");
    await user.keyboard("{Enter}");
    await settle();
    expect(scheme?.choice()).toBe("light");
    expect(button.getAttribute("data-choice")).toBe("light");
  });

  test("hydrates what the server wrote without a mismatch, while `system` is unresolved", async () => {
    const { server, client } = await halves(`
      import { colorScheme } from "@barqjs/primitives/color-scheme";
      import { ThemeToggle } from "<arc>";
      export function Page() {
        colorScheme();
        return <ThemeToggle />;
      }
    `);
    const result = renderAndHydrate({ server, client });
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);

    // The walk patches a differing attribute or icon in silence, so what the
    // server wrote is compared with what the client ended on.
    const written = document.createElement("div");
    written.innerHTML = result.html;
    const served = written.querySelector('[data-slot="theme-toggle"]');
    const hydrated = result.container.querySelector('[data-slot="theme-toggle"]');
    expect(served?.getAttribute("data-choice")).toBe("system");
    expect(hydrated?.getAttribute("data-choice")).toBe("system");
    expect(hydrated?.querySelector("svg")?.innerHTML).toBe(
      served?.querySelector("svg")?.innerHTML ?? "",
    );
    result.unmount();
  });
});
