import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { useDirection } from "@barqjs/aria/i18n";
import { router } from "@barqjs/aria/interactions";
import { useColorScheme } from "@barqjs/primitives/color-scheme";
import { render, screen, tick, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";
import { Outlet } from "@barqjs/router";

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

  test("installs the theme again when its props change", () => {
    const [brand, setBrand] = createSignal("oklch(0.6 0.1 40)");
    const [density, setDensity] = createSignal<"compact" | "spacious">("compact");
    render(() => (
      <ArcProvider
        theme={{ base: "neutral", tokens: { light: { brand: brand() } } }}
        density={density()}
        contrast="high"
        colorScheme={false}
        toaster={false}
      >
        <span>app</span>
      </ArcProvider>
    ));
    expect(collectCss()).toContain("--brand: oklch(0.6 0.1 40);");
    setBrand("oklch(0.5 0.2 250)");
    setDensity("spacious");
    flush();
    const css = collectCss();
    expect(css).toContain("--brand: oklch(0.5 0.2 250);");
    expect(css).not.toContain("--brand: oklch(0.6 0.1 40);");
    expect(css).toMatch(/:root \{[^}]*--spacing: 0\.3rem;/);
  });

  test("hands aria's links the app's router, so an href does not reload the page", async () => {
    let links: ReturnType<typeof router> | undefined;
    function Probe() {
      links = router();
      return <p>probe</p>;
    }
    const tree = [
      {
        path: "/",
        component: () => (
          <ArcProvider colorScheme={false} toaster={false}>
            <Outlet />
          </ArcProvider>
        ),
        children: [
          { path: "", component: Probe },
          { path: "billing", component: () => <h1>Billing</h1> },
        ],
      },
    ];
    const view = await renderRoute({ routeTree: tree, path: "/" });
    expect(links?.isNative).toBe(false);
    links?.open(document.createElement("a"), {}, "/billing");
    await waitFor(() => expect(view.state.location().pathname).toBe("/billing"));
    expect(screen.getByRole("heading", { name: "Billing" })).toBeDefined();
    view.unmount();
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
