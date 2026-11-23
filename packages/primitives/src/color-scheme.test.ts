import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runInThisContext } from "node:vm";
import { createRoot, flush } from "@barqjs/core";
import { hydrate } from "@barqjs/web";
import {
  type ColorScheme,
  colorScheme,
  colorSchemeScript,
  useColorScheme,
} from "./color-scheme.ts";

const DARK = "(prefers-color-scheme: dark)";

interface FakeList {
  media: string;
  matches: boolean;
  listeners: Set<(event: { matches: boolean }) => void>;
  addEventListener: (type: string, handler: (event: { matches: boolean }) => void) => void;
  removeEventListener: (type: string, handler: (event: { matches: boolean }) => void) => void;
}

const realMatchMedia = window.matchMedia;
let systemDark: FakeList;
const disposers: (() => void)[] = [];

function setSystem(dark: boolean): void {
  systemDark.matches = dark;
  for (const handler of systemDark.listeners) handler({ matches: dark });
}

function clearCookie(): void {
  document.cookie = "theme=; Path=/; Max-Age=0";
  document.cookie = "mode=; Path=/; Max-Age=0";
}

function mount<T>(fn: () => T): T {
  return createRoot((dispose) => {
    disposers.push(dispose);
    return fn();
  });
}

const html = (): HTMLElement => document.documentElement;

beforeEach(() => {
  // Cookies need an origin, and the shared setup leaves the page at about:blank.
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(
    "http://localhost:3000/",
  );
  const listeners = new Set<(event: { matches: boolean }) => void>();
  systemDark = {
    media: DARK,
    matches: false,
    listeners,
    addEventListener: (_type, handler) => listeners.add(handler),
    removeEventListener: (_type, handler) => listeners.delete(handler),
  };
  window.matchMedia = ((query: string) =>
    query === DARK ? systemDark : realMatchMedia(query)) as typeof window.matchMedia;
  clearCookie();
  html().className = "";
  html().removeAttribute("data-mode");
  html().style.colorScheme = "";
  delete (window as { __BARQ_SCHEME__?: unknown }).__BARQ_SCHEME__;
});

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  window.matchMedia = realMatchMedia;
  clearCookie();
});

describe("colorScheme in the browser", () => {
  test("takes the choice from the cookie and writes the theme on <html>", () => {
    document.cookie = "theme=dark; Path=/";
    const scheme = mount(() => colorScheme());
    flush();

    expect(scheme.choice()).toBe("dark");
    expect(scheme.resolved()).toBe("dark");
    expect(html().classList.contains("dark")).toBe(true);
    expect(html().style.colorScheme).toBe("dark");
  });

  test("resolves system from prefers-color-scheme and follows it", () => {
    systemDark.matches = true;
    const scheme = mount(() => colorScheme());
    flush();
    expect(scheme.choice()).toBe("system");
    expect(scheme.resolved()).toBe("dark");
    expect(html().classList.contains("dark")).toBe(true);

    setSystem(false);
    flush();
    expect(scheme.resolved()).toBe("light");
    expect(html().classList.contains("dark")).toBe(false);
    expect(html().classList.contains("light")).toBe(true);
  });

  test("set() keeps the choice in the cookie and swaps the class", () => {
    const scheme = mount(() => colorScheme());
    flush();
    scheme.set("dark");
    flush();
    expect(document.cookie).toContain("theme=dark");
    expect(html().classList.contains("dark")).toBe(true);

    scheme.set("light");
    flush();
    expect(document.cookie).toContain("theme=light");
    expect([...html().classList]).toEqual(["light"]);
  });

  test("falls back to the default for a value it does not know", () => {
    document.cookie = "theme=sepia; Path=/";
    const scheme = mount(() => colorScheme({ defaultChoice: "light" }));
    flush();
    expect(scheme.choice()).toBe("light");
    scheme.set("sepia" as "light");
    flush();
    expect(scheme.choice()).toBe("light");
  });

  test("writes a data attribute, with a value of its own per theme", () => {
    document.cookie = "mode=night; Path=/";
    const scheme = mount(() =>
      colorScheme({
        key: "mode",
        themes: ["day", "night"],
        system: false,
        attribute: "data-mode",
        values: { night: "midnight" },
      }),
    );
    flush();
    expect(scheme.resolved()).toBe("night");
    expect(html().getAttribute("data-mode")).toBe("midnight");
    expect(html().style.colorScheme).toBe("");
  });

  test("refuses system for themes that have no light and dark", () => {
    expect(() => colorScheme({ themes: ["day", "night"] })).toThrow(/system/);
  });

  test("is provided to what renders below it", () => {
    let read: ColorScheme | undefined;
    const scheme = mount(() => {
      const made = colorScheme();
      read = useColorScheme();
      return made;
    });
    expect(read).toBe(scheme);
    expect(() => mount(() => useColorScheme())).toThrow(/no colorScheme\(\)/);
  });

  test("follows a choice another tab made, once this one is shown", () => {
    const scheme = mount(() => colorScheme());
    flush();
    document.cookie = "theme=dark; Path=/";
    document.dispatchEvent(new Event("visibilitychange"));
    flush();
    expect(scheme.choice()).toBe("dark");
    expect(html().classList.contains("dark")).toBe(true);
  });

  test("builds what the server built while the page hydrates, then takes the cookie's", async () => {
    (window as { __BARQ_SCHEME__?: Record<string, string> }).__BARQ_SCHEME__ = {
      theme: "light",
    };
    document.cookie = "theme=dark; Path=/";
    const container = document.createElement("div");
    container.textContent = "light";
    let scheme!: ColorScheme;
    const seen: (string | undefined)[] = [];
    disposers.push(
      hydrate(() => {
        scheme = colorScheme();
        seen.push(scheme.resolved());
        return scheme.resolved() ?? "unknown";
      }, container),
    );
    expect(seen).toEqual(["light"]);
    expect(hydrate.report.mismatches).toEqual([]);

    await Promise.resolve();
    flush();
    expect(scheme.resolved()).toBe("dark");
    expect(html().classList.contains("dark")).toBe(true);
  });

  test("leaves system unknown while hydrating, so the markup matches a server that could not know", async () => {
    systemDark.matches = true;
    (window as { __BARQ_SCHEME__?: Record<string, string> }).__BARQ_SCHEME__ = {
      theme: "system",
    };
    const container = document.createElement("div");
    container.textContent = "unknown";
    let scheme!: ColorScheme;
    disposers.push(
      hydrate(() => {
        scheme = colorScheme();
        return scheme.resolved() ?? "unknown";
      }, container),
    );
    expect(scheme.resolved()).toBeUndefined();
    expect(hydrate.report.mismatches).toEqual([]);

    await Promise.resolve();
    flush();
    expect(scheme.resolved()).toBe("dark");
  });
});

describe("colorSchemeScript", () => {
  const run = (source: string): void => {
    runInThisContext(source);
  };

  test("puts the cookie's theme on <html> and records what the server chose", () => {
    document.cookie = "theme=dark; Path=/";
    run(colorSchemeScript(undefined, "light"));
    expect([...html().classList]).toEqual(["dark"]);
    expect(html().style.colorScheme).toBe("dark");
    expect((window as { __BARQ_SCHEME__?: unknown }).__BARQ_SCHEME__).toEqual({ theme: "light" });
  });

  test("resolves system with no cookie at all", () => {
    systemDark.matches = true;
    run(colorSchemeScript());
    expect([...html().classList]).toEqual(["dark"]);
  });

  test("cannot be closed early by what it embeds", () => {
    expect(colorSchemeScript({ key: "</script><b>" })).not.toContain("</script>");
  });
});

describe("colorScheme on the server", () => {
  interface Page {
    html: string;
    resolved: string | null;
    choice: string;
  }

  /** In a process with no DOM, where `isServer` is true; see `server.test.ts`. */
  async function served(): Promise<Record<"dark" | "none", Page>> {
    const probe = new URL("./color-scheme-probe.ts", import.meta.url).pathname;
    const child = Bun.spawn(["bun", "run", probe], { stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(`color-scheme probe exited ${code}: ${err}`);
    return JSON.parse(out) as Record<"dark" | "none", Page>;
  }

  test("renders with the request's cookie and heads the page with the script, under the nonce", async () => {
    const { dark, none } = await served();

    expect(dark.choice).toBe("dark");
    expect(dark.resolved).toBe("dark");
    expect(dark.html).toContain(
      '<head><script id="barq-color-scheme-theme" nonce="n0nce" data-bh="script#barq-color-scheme-theme">',
    );
    expect(dark.html).toContain('"s":"dark"');
    expect(dark.html).toContain("<body>dark</body>");

    expect(none.choice).toBe("system");
    expect(none.resolved).toBeNull();
    expect(none.html).toContain('"s":"system"');
    expect(none.html).toContain("<body>unknown</body>");
  });
});
