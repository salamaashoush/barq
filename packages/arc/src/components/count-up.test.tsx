import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { CountUp } from "./count-up.tsx";

interface HappyDevice {
  prefersReducedMotion: string;
}

interface HappyWindow {
  happyDOM: HappySettings;
}

interface HappySettings {
  settings: HappyDeviceSettings;
}

interface HappyDeviceSettings {
  device: HappyDevice;
}

interface Sighting {
  isIntersecting: boolean;
  target: Element;
}

type Seen = (entries: Sighting[]) => void;

interface Watch {
  callback: Seen;
  targets: Element[];
}

const watched: Watch[] = [];
const realObserver = globalThis.IntersectionObserver;
const realFrame = globalThis.requestAnimationFrame;
let frames: FrameRequestCallback[] = [];

class FakeObserver {
  readonly entry: Watch;
  constructor(callback: Seen) {
    this.entry = { callback, targets: [] };
    watched.push(this.entry);
  }
  observe(target: Element): void {
    this.entry.targets.push(target);
  }
  unobserve(): void {}
  disconnect(): void {}
}

function scrollIntoView(): void {
  for (const one of watched) {
    one.callback(one.targets.map((target) => ({ isIntersecting: true, target })));
  }
}

function frame(at: number): void {
  const due = frames;
  frames = [];
  for (const callback of due) callback(at);
}

function shown(): string | null | undefined {
  return document.querySelector('[data-slot="count-up-shown"]')?.textContent;
}

describe("CountUp", () => {
  beforeEach(() => {
    watched.length = 0;
    frames = [];
    globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    };
  });
  afterEach(() => {
    globalThis.IntersectionObserver = realObserver;
    globalThis.requestAnimationFrame = realFrame;
  });

  test("shows the final figure until it comes into view, then counts up to it", async () => {
    render(() => <CountUp value={12480} />);
    expect(shown()).toBe("12,480");
    const root = document.querySelector('[data-slot="count-up"]') as HTMLElement;
    expect(root.querySelector('[data-slot="count-up-shown"]')?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(root.textContent).toContain("12,480");
    scrollIntoView();
    await settle();
    expect(shown()).toBe("0");
    frame(performance.now() + 600);
    await settle();
    const midway = Number(shown()?.replaceAll(",", ""));
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(12480);
    expect(Number.isInteger(midway)).toBe(true);
    frame(performance.now() + 5000);
    await settle();
    expect(shown()).toBe("12,480");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a screen reader reads the final figure once, whatever the count shows", async () => {
    render(() => <CountUp value={40} />);
    scrollIntoView();
    await settle();
    const read = [...document.querySelectorAll('[data-slot="count-up"] > span')].filter(
      (span) => span.getAttribute("aria-hidden") !== "true",
    );
    expect(read.map((span) => span.textContent)).toEqual(["40"]);
  });

  test("a new value counts from where it stands, and the count plays only once into view", async () => {
    const [value, setValue] = createSignal(100);
    render(() => <CountUp value={value()} from={50} duration={100} />);
    setValue(120);
    await settle();
    expect(shown()).toBe("120");
    scrollIntoView();
    await settle();
    expect(shown()).toBe("50");
    frame(performance.now() + 1000);
    await settle();
    expect(shown()).toBe("120");
    setValue(200);
    await settle();
    expect(shown()).toBe("120");
    frame(performance.now() + 1000);
    await settle();
    expect(shown()).toBe("200");
    scrollIntoView();
    await settle();
    expect(shown()).toBe("200");
  });

  test("under reduced motion, shows the figure as it is and never counts", async () => {
    const device = (window as unknown as HappyWindow).happyDOM.settings.device;
    device.prefersReducedMotion = "reduce";
    try {
      render(() => <CountUp value={300} />);
      scrollIntoView();
      await settle();
      expect(shown()).toBe("300");
      expect(frames).toHaveLength(0);
    } finally {
      device.prefersReducedMotion = "no-preference";
    }
  });

  test("writes the figure in the locale and its unit", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <CountUp value={0.5} formatOptions={{ style: "percent" }} />
      </Arabic>
    ));
    expect(shown()).toBe("٥٠٪؜");
  });

  test("hydrates the final figure the server wrote", async () => {
    const result = await hydrates(`
      import { CountUp } from "<arc>";
      export function Page() {
        return <CountUp value={980} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="count-up-shown"]')?.textContent).toBe("980");
    result.unmount();
  });
});
