import { describe, expect, test } from "bun:test";
import { screen, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { settle } from "../test-arc.ts";
import { oneOf, useSearchParam } from "./search-state.ts";

const WINDOWS = ["24h", "7d", "30d"] as const;

describe("useSearchParam", () => {
  test("the default stays out of the address and an unknown value falls back to it", async () => {
    function Window() {
      const window = useSearchParam("window", { defaultValue: "24h", parse: oneOf(WINDOWS) });
      return (
        <>
          <output>{window.value()}</output>
          <button type="button" onClick={() => window.setValue("7d")}>
            Week
          </button>
          <button type="button" onClick={() => window.setValue("24h")}>
            Day
          </button>
        </>
      );
    }
    const view = await renderRoute({
      routeTree: [{ path: "/check", component: Window }] as never,
      path: "/check?window=year&tab=runs",
    });
    await settle();
    expect(screen.getByRole("status").textContent).toBe("24h");
    await user.click(screen.getByRole("button", { name: "Week" }));
    await waitFor(() => expect(view.state.search().get("window")).toBe("7d"));
    expect(view.state.search().get("tab")).toBe("runs");
    expect(screen.getByRole("status").textContent).toBe("7d");
    await user.click(screen.getByRole("button", { name: "Day" }));
    await waitFor(() => expect(view.state.search().has("window")).toBe(false));
    view.unmount();
  });

  test("debounced, each keystroke shows at once and the address takes the text once typing pauses", async () => {
    function Search() {
      const query = useSearchParam("q", { defaultValue: "", debounce: 40 });
      return (
        <input
          aria-label="Search"
          value={query.value()}
          onInput={(event: Event) =>
            query.setValue((event.currentTarget as HTMLInputElement).value)
          }
        />
      );
    }
    const view = await renderRoute({
      routeTree: [{ path: "/list", component: Search }] as never,
      path: "/list",
    });
    await settle();
    const box = screen.getByRole<HTMLInputElement>("textbox", { name: "Search" });
    await user.type(box, "disk");
    await settle();
    expect(box.value).toBe("disk");
    expect(view.state.search().has("q")).toBe(false);
    await waitFor(() => expect(view.state.search().get("q")).toBe("disk"));
    expect(box.value).toBe("disk");
    view.unmount();
  });

  test("a change from elsewhere replaces what was being typed", async () => {
    function Search() {
      const query = useSearchParam("q", { defaultValue: "", debounce: 5_000 });
      return (
        <input
          aria-label="Search"
          value={query.value()}
          onInput={(event: Event) =>
            query.setValue((event.currentTarget as HTMLInputElement).value)
          }
        />
      );
    }
    const view = await renderRoute({
      routeTree: [{ path: "/list", component: Search }] as never,
      path: "/list?q=old",
    });
    await settle();
    const box = screen.getByRole<HTMLInputElement>("textbox", { name: "Search" });
    await user.type(box, "er");
    await settle();
    expect(box.value).toBe("older");
    void view.navigate("/list?q=saved");
    await waitFor(() => expect(box.value).toBe("saved"));
    view.unmount();
  });
});
