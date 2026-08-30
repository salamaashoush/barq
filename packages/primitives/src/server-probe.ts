/**
 * Every primitive, on the server, with no DOM anywhere.
 *
 * Run as a SCRIPT rather than a test, and spawned by `server.test.ts`, because
 * this package's `bunfig.toml` preloads happy-dom into `bun test` — which is
 * correct for the other twenty-two files and fatal here. `@barqjs/core` reads
 * `typeof document` once, at module scope, so a DOM registered before this
 * module is imported makes `isServer` false and every branch below the wrong
 * one. The only way to observe the server path is a process that never had a
 * DOM to begin with.
 *
 * Prints one JSON object. Any throw is the failure.
 */

import { flush, isServer, scope, signal } from "@barqjs/core";

import { cubicBezier, easing, spring, tween } from "./animation.ts";
import {
  devicePixelRatio,
  documentTitle,
  languages,
  online,
  pageVisible,
  permission,
  userIdle,
} from "./browser.ts";
import { bus, emitter, trigger } from "./bus.ts";
import { clipboard, readClipboard, writeClipboard } from "./clipboard.ts";
import { ReactiveMap, ReactiveSet } from "./collections.ts";
import { debounced, every, not, previous, selector, some, throttled, whenever } from "./derived.ts";
import { bounds, elementSize, visible, windowSize } from "./element.ts";
import { eventSignal, on, onMap, once } from "./event.ts";
import { activeElement, clickOutside, focusWithin, focused } from "./focus.ts";
import { history } from "./history.ts";
import { isKeyDown, keysDown, parseCombo, shortcut } from "./keyboard.ts";
import {
  breakpoints,
  coarsePointer,
  mediaQuery,
  prefersDark,
  prefersReducedMotion,
} from "./media.ts";
import { mouseInElement, mousePosition } from "./mouse.ts";
import { intersectionObserver, mutationObserver, resizeObserver } from "./observers.ts";
import { abortOnCleanup, raceTimeout, sleep, until } from "./promise.ts";
import { fps, raf } from "./raf.ts";
import {
  debounce,
  leading,
  leadingAndTrailing,
  scheduleIdle,
  scheduled,
  throttle,
} from "./scheduled.ts";
import { scrollPosition, windowScroll } from "./scroll.ts";
import { clearPersisted, peekPersisted, persisted, persistedSession } from "./storage.ts";
import { elapsed, interval, now, timeout } from "./timer.ts";
import { access, shared, sharedKeyed } from "./utils.ts";

const fired: string[] = [];
const note = (what: string) => (): void => {
  fired.push(what);
};

const report = scope((dispose) => {
  // Every schedule takes a call it must not act on.
  const scheduled_ = {
    debounce: debounce(note("debounce"), 1),
    throttle: throttle(note("throttle"), 1),
    idle: scheduleIdle(note("idle"), 1),
    leading: leading(debounce, note("leading"), 1),
    both: leadingAndTrailing(debounce, note("both"), 1),
  };
  for (const call of Object.values(scheduled_)) call();
  const gate = scheduled((fire) => debounce(fire, 1));

  timeout(note("timeout"), 1);
  interval(note("interval"), 1);

  const loop = raf(note("raf"));
  loop.start();
  const rate = fps();

  // Observers, against a target that cannot exist.
  const clears = [
    resizeObserver(null, note("resize")),
    intersectionObserver(null, note("intersection")),
    mutationObserver(null, note("mutation")),
    on(null, "click", note("on")),
    onMap(null, { click: note("onMap") }),
    once(null, "click", note("once")),
    clickOutside(null, note("clickOutside")),
    shortcut("mod+k", note("shortcut")),
  ];
  for (const clear of clears) clear?.();

  const size = windowSize();
  const rect = bounds(null);
  const element = elementSize(null);
  const scroll = windowScroll();
  const elementScroll = scrollPosition(null);
  const pointer = mousePosition();
  const inElement = mouseInElement(null);
  const source = signal(1);
  const points = signal<readonly number[]>([0, 0]);

  const stored = persisted("probe", "initial");
  const sessioned = persistedSession("probe", "initial");
  clearPersisted("probe");

  const seen = signal<string | null>(null);
  whenever(seen, note("whenever"));
  const board = clipboard();
  const edits = history(source);
  const channel = bus<number>();
  const [track, dirty] = trigger();
  const events = emitter();
  events.listen(note("emitter"));
  events.emit();
  track();
  dirty();
  channel.emit(1);

  const map = new ReactiveMap<string, number>([["a", 1]]);
  const set = new ReactiveSet<number>([1]);
  const isSelected = selector(source);
  const settings = breakpoints({ md: "768px" });
  const singleton = shared(() => ({ built: true }));
  const keyed = sharedKeyed((key: string) => key.length);

  documentTitle("a title that no document has");
  const abort = abortOnCleanup();

  flush();

  const result = {
    isServer,
    // Nothing scheduled may have run, and nothing bound may have fired.
    fired,
    scheduledPending: Object.values(scheduled_).some((call) => call.pending()),
    gate: gate(),

    rafRunning: loop.running(),
    fps: rate(),

    windowSize: [size.width(), size.height()],
    bounds: [rect.x(), rect.width()],
    elementSize: [element.width(), element.height()],
    scroll: [scroll.x(), scroll.y()],
    elementScroll: [elementScroll.x(), elementScroll.y()],
    mouse: [pointer.x(), pointer.y(), pointer.isInside()],
    mouseInElement: [inElement.x(), inElement.isInside()],
    visible: visible(null)(),

    mediaQuery: mediaQuery("(min-width: 1px)")(),
    prefersDark: prefersDark()(),
    prefersReducedMotion: prefersReducedMotion()(),
    coarsePointer: coarsePointer()(),
    breakpoint: [settings.matches.md(), settings.current() ?? null],

    online: online()(),
    pageVisible: pageVisible()(),
    userIdle: userIdle({ after: 1 })(),
    permission: permission("geolocation")(),
    devicePixelRatio: devicePixelRatio()(),
    languages: languages()(),

    activeElement: activeElement()(),
    focused: focused(null)(),
    focusWithin: focusWithin(null)(),
    keysDown: keysDown()(),
    isKeyDown: isKeyDown("k")(),
    combo: parseCombo("mod+k").key,

    // Storage has nowhere to go, so a persisted signal is a plain one.
    persisted: stored(),
    persistedSession: sessioned(),
    peeked: peekPersisted("probe", "fallback"),

    clipboardCopied: board.copied(),

    // The DOM-free half must work exactly as it does in a browser.
    map: [map.get("a"), map.size],
    set: [set.has(1), set.size],
    selector: [isSelected(1), isSelected(2)],
    previous: previous(source)() ?? null,
    debounced: debounced(source, 1)(),
    throttled: throttled(source, 1)(),
    every: every(true, () => true)(),
    some: some(false, () => false)(),
    not: not(false)(),
    access: access(() => "read"),
    shared: singleton().built,
    sharedKeyed: keyed("four"),
    bus: channel.last(),
    canUndo: edits.canUndo(),
    eventSignal: eventSignal(null, "click")() ?? null,
    easing: [easing.linear(0.5), cubicBezier(0.4, 0, 0.2, 1)(1)],
    tween: tween(source, { duration: 1 })(),
    spring: spring(points)(),
    now: typeof now(1)() === "number",
    elapsed: elapsed(1)(),
    aborted: abort.aborted,
  };

  dispose();
  return result;
}, true);

const asyncChecks = {
  until: await until(signal("ready")),
  sleep: await sleep(1).then(() => "slept"),
  raceTimeout: await raceTimeout(Promise.resolve("value"), 50),
  writeClipboard: await writeClipboard("x").then(
    () => "resolved",
    (error: Error) => error.message,
  ),
  readClipboard: await readClipboard().then(
    () => "resolved",
    (error: Error) => error.message,
  ),
};

console.log(JSON.stringify({ ...report, ...asyncChecks }));
