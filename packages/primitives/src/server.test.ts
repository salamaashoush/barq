/**
 * The server half, in a process that never had a DOM.
 *
 * The README promises that nothing here needs a DOM to import and that the
 * browser primitives read a neutral value and subscribe to nothing. Under
 * `bun test` that promise cannot be checked at all: `bunfig.toml` preloads
 * happy-dom, `@barqjs/core` reads `typeof document` once at module scope, and
 * `isServer` is therefore false in every other file in this suite. So the
 * server path is measured the only way it can be — by spawning a process
 * without one, running `server-probe.ts` there, and reading back what it saw.
 */

import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

const probe = fileURLToPath(new URL("./server-probe.ts", import.meta.url));

interface Probe {
  isServer: boolean;
  fired: string[];
  scheduledPending: boolean;
  gate: boolean;
  rafRunning: boolean;
  fps: number;
  windowSize: [number, number];
  bounds: [number, number];
  elementSize: [number, number];
  scroll: [number, number];
  elementScroll: [number, number];
  mouse: [number, number, boolean];
  mouseInElement: [number, boolean];
  visible: boolean;
  mediaQuery: boolean;
  prefersDark: boolean;
  prefersReducedMotion: boolean;
  coarsePointer: boolean;
  breakpoint: [boolean, string | null];
  online: boolean;
  pageVisible: boolean;
  userIdle: boolean;
  permission: string;
  devicePixelRatio: number;
  languages: string[];
  activeElement: unknown;
  focused: boolean;
  focusWithin: boolean;
  keysDown: string[];
  isKeyDown: boolean;
  combo: string;
  persisted: string;
  persistedSession: string;
  peeked: string;
  clipboardCopied: boolean;
  map: [number, number];
  set: [boolean, number];
  selector: [boolean, boolean];
  previous: number | null;
  debounced: number;
  throttled: number;
  every: boolean;
  some: boolean;
  not: boolean;
  access: string;
  shared: boolean;
  sharedKeyed: number;
  bus: number;
  canUndo: boolean;
  eventSignal: unknown;
  easing: [number, number];
  tween: number;
  spring: number[];
  now: boolean;
  elapsed: number;
  aborted: boolean;
  until: string;
  sleep: string;
  raceTimeout: string;
  writeClipboard: string;
  readClipboard: string;
}

const run = async (): Promise<Probe> => {
  const child = Bun.spawn(["bun", "run", probe], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`the probe exited ${code}\n${err}\n${out}`);
  return JSON.parse(out) as Probe;
};

const probed = await run();

describe("with no DOM in the process", () => {
  test("every module imports, and the runtime agrees it is the server", () => {
    expect(probed.isServer).toBe(true);
  });

  test("nothing schedules, and nothing is left pending", () => {
    // `emitter` is not a schedule: it delivers synchronously, on the server
    // exactly as in a browser. The two leading-edge schedules run their first
    // call for the same reason — the leading edge is a moment a string render
    // has, and it is the only one it has.
    expect(probed.fired.toSorted()).toEqual(["both", "emitter", "leading"]);
    expect(probed.scheduledPending).toBe(false);
    expect(probed.gate).toBe(false);
  });

  test("no animation frame is ever requested", () => {
    expect(probed.rafRunning).toBe(false);
    expect(probed.fps).toBe(0);
  });

  test("the viewport and every measurement read zero", () => {
    expect(probed.windowSize).toEqual([0, 0]);
    expect(probed.bounds).toEqual([0, 0]);
    expect(probed.elementSize).toEqual([0, 0]);
    expect(probed.scroll).toEqual([0, 0]);
    expect(probed.elementScroll).toEqual([0, 0]);
    expect(probed.mouse).toEqual([0, 0, false]);
    expect(probed.mouseInElement).toEqual([0, false]);
    expect(probed.visible).toBe(false);
  });

  test("no media query matches, so a first paint is the unmatched one", () => {
    expect(probed.mediaQuery).toBe(false);
    expect(probed.prefersDark).toBe(false);
    expect(probed.prefersReducedMotion).toBe(false);
    expect(probed.coarsePointer).toBe(false);
    expect(probed.breakpoint).toEqual([false, null]);
  });

  test("device state reads the optimistic neutral", () => {
    // `true` for both: a server render should not emit an offline banner or a
    // "this tab is in the background" state that the client immediately undoes.
    expect(probed.online).toBe(true);
    expect(probed.pageVisible).toBe(true);
    expect(probed.userIdle).toBe(false);
    expect(probed.permission).toBe("unknown");
    expect(probed.devicePixelRatio).toBe(1);
    expect(probed.languages).toEqual([]);
  });

  test("nothing has focus and no key is down", () => {
    expect(probed.activeElement).toBe(null);
    expect(probed.focused).toBe(false);
    expect(probed.focusWithin).toBe(false);
    expect(probed.keysDown).toEqual([]);
    expect(probed.isKeyDown).toBe(false);
    // Combo parsing is arithmetic on a string and works anywhere.
    expect(probed.combo).toBe("k");
  });

  test("a persisted signal is a plain signal where there is no storage", () => {
    expect(probed.persisted).toBe("initial");
    expect(probed.persistedSession).toBe("initial");
    expect(probed.peeked).toBe("fallback");
  });

  test("the clipboard refuses rather than pretending", () => {
    expect(probed.clipboardCopied).toBe(false);
    expect(probed.writeClipboard).toContain("unavailable");
    expect(probed.readClipboard).toContain("unavailable");
  });

  test("the DOM-free half behaves exactly as it does in a browser", () => {
    expect(probed.map).toEqual([1, 1]);
    expect(probed.set).toEqual([true, 1]);
    expect(probed.selector).toEqual([true, false]);
    expect(probed.previous).toBe(null);
    expect(probed.debounced).toBe(1);
    expect(probed.throttled).toBe(1);
    expect(probed.every).toBe(true);
    expect(probed.some).toBe(false);
    expect(probed.not).toBe(true);
    expect(probed.access).toBe("read");
    expect(probed.shared).toBe(true);
    expect(probed.sharedKeyed).toBe(4);
    expect(probed.bus).toBe(1);
    expect(probed.canUndo).toBe(false);
    expect(probed.eventSignal).toBe(null);
    expect(probed.easing).toEqual([0.5, 1]);
  });

  test("motion settles on the source value instead of animating to it", () => {
    expect(probed.tween).toBe(1);
    expect(probed.spring).toEqual([0, 0]);
  });

  test("the clock reads the render's own moment and does not move", () => {
    expect(probed.now).toBe(true);
    expect(probed.elapsed).toBe(0);
  });

  test("the async helpers work, because waiting is not a DOM concern", () => {
    expect(probed.until).toBe("ready");
    expect(probed.sleep).toBe("slept");
    expect(probed.raceTimeout).toBe("value");
    expect(probed.aborted).toBe(false);
  });
});
