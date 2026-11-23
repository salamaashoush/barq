import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { useDirection } from "@barqjs/aria/i18n";
import { useColorScheme } from "@barqjs/primitives/color-scheme";
import { render, screen, tick, user } from "@barqjs/testing";

import { confirm } from "./confirm.tsx";
import { ArcProvider } from "./provider.tsx";

describe("ArcProvider", () => {
  test("installs the theme and provides the scheme and the locale's direction", () => {
    let direction = "";
    let scheme: ReturnType<typeof useColorScheme> | undefined;
    function Probe() {
      direction = useDirection()();
      scheme = useColorScheme();
      return <span>probe</span>;
    }
    render(() => (
      <ArcProvider
        theme={{ base: "neutral", tokens: { light: { brand: "oklch(0.6 0.1 40)" } } }}
        locale="ar-EG"
      >
        <Probe />
      </ArcProvider>
    ));
    expect(collectCss()).toContain("--brand: oklch(0.6 0.1 40);");
    expect(collectCss()).toContain("--success-subtle:");
    expect(direction).toBe("rtl");
    expect(scheme?.choice()).toBe("system");
  });

  test("renders the host confirm() draws in", async () => {
    render(() => (
      <ArcProvider toaster={false}>
        <span>app</span>
      </ArcProvider>
    ));
    const answer = confirm({ title: "Sure?" });
    flush();
    await tick();
    flush();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await answer).toBe(true);
  });
});
