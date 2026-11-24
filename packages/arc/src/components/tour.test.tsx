import { describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { Coachmark, Spotlight, Tour, type TourStep, useTourProgress } from "./tour.tsx";

function Page(props: ParentProps) {
  return (
    <main>
      <button type="button" id="new">
        New invoice
      </button>
      <input id="filters" aria-label="Filter" />
      {props.children}
    </main>
  );
}

const STEPS: TourStep[] = [
  { target: "#new", title: "Create", body: "Start here." },
  { target: "#missing", title: "Gone", body: "Not on this page." },
  { target: "#filters", title: "Filter", body: "Narrow the list." },
];

function coachmark(): HTMLElement | null {
  return document.querySelector('[data-slot="coachmark"]');
}

/** A storage of the test's own, so tours do not remember each other. */
function memory(): Storage {
  const held = new Map<string, string>();
  return {
    get length() {
      return held.size;
    },
    clear: () => held.clear(),
    getItem: (key) => held.get(key) ?? null,
    key: (index) => [...held.keys()][index] ?? null,
    removeItem: (key) => void held.delete(key),
    setItem: (key, value) => void held.set(key, value),
  };
}

describe("Coachmark and Spotlight", () => {
  test("a dialog beside its target, named by its title, holding focus", async () => {
    render(() => (
      <Page>
        <Coachmark
          target="#new"
          title="Create"
          onNext={() => {}}
          onDismiss={() => {}}
          step={1}
          total={3}
        >
          Start here.
        </Coachmark>
        <Spotlight target="#new" />
      </Page>
    ));
    await settle();
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Create" });
    expect(dialog.textContent).toContain("1 of 3");
    expect(dialog.contains(document.activeElement)).toBe(true);
    const spotlight = document.querySelector('[data-slot="spotlight"]') as HTMLElement;
    expect(spotlight.getAttribute("aria-hidden")).toBe("true");
    expect(await ariaViolations(document.body)).toEqual([]);
  });
});

describe("Tour", () => {
  test("steps through its targets with Next and Back, passing one not on the page", async () => {
    const steps: number[] = [];
    let finished = 0;
    render(() => (
      <Page>
        <Tour
          steps={STEPS}
          defaultOpen
          onStepChange={(at) => steps.push(at)}
          onFinish={() => finished++}
        />
      </Page>
    ));
    await settle();
    await settle();
    expect(screen.getByRole("dialog", { name: "Create" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    await settle();
    expect(screen.getByRole("dialog", { name: "Filter" }).textContent).toContain("3 of 3");
    expect(steps).toEqual([2]);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await settle();
    await settle();
    expect(screen.getByRole("dialog", { name: "Create" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    await settle();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await settle();
    expect(finished).toBe(1);
    expect(coachmark()).toBeNull();
  });

  test("from the keyboard: Enter goes on, Escape skips the rest", async () => {
    const skipped: number[] = [];
    render(() => (
      <Page>
        <Tour steps={STEPS} defaultOpen onSkip={(at) => skipped.push(at)} />
      </Page>
    ));
    await settle();
    await settle();
    expect(document.activeElement?.textContent).toBe("Next");
    await user.keyboard("{Enter}");
    await settle();
    await settle();
    expect(screen.getByRole("dialog", { name: "Filter" })).toBeDefined();
    await user.keyboard("{Escape}");
    await settle();
    expect(skipped).toEqual([2]);
    expect(coachmark()).toBeNull();
  });

  test("a tap on Skip ends it, and its words are the locale's digits in Arabic", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    const [open, setOpen] = createSignal(true);
    render(() => (
      <Rtl>
        <Page>
          <Tour steps={STEPS} open={open()} onOpenChange={setOpen} />
        </Page>
      </Rtl>
    ));
    await settle();
    await settle();
    expect(coachmark()?.textContent).toContain("١");
    user.tap(screen.getByRole("button", { name: "Skip tour" }));
    await settle();
    expect(open()).toBe(false);
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <Page>
        <Tour
          steps={STEPS}
          defaultOpen
          classes={{
            root: "r",
            title: "t",
            body: "b",
            footer: "f",
            progress: "p",
            next: "n",
            skip: "s",
          }}
        />
      </Page>
    ));
    await settle();
    await settle();
    function by(slot: string): Element | null {
      return document.querySelector(`[data-slot="${slot}"]`);
    }
    for (const [slot, name] of [
      ["coachmark", "r"],
      ["coachmark-title", "t"],
      ["coachmark-body", "b"],
      ["coachmark-footer", "f"],
      ["coachmark-progress", "p"],
      ["coachmark-next", "n"],
      ["coachmark-skip", "s"],
    ] as const) {
      expect(by(slot)?.classList.contains(name)).toBe(true);
    }
  });

  test("hydrates the page it guides, drawing nothing of its own on the server", async () => {
    const result = await hydrates(`
      import { Tour } from "<arc>";
      export function Page() {
        return (
          <main>
            <button type="button" id="new">New</button>
            <Tour steps={[{ target: "#new", title: "Create" }]} />
          </main>
        );
      }
    `);
    expect(result.container.querySelector('[data-slot="coachmark"]')).toBeNull();
    result.unmount();
  });
});

describe("useTourProgress", () => {
  test("remembers where a tour was left and that it was seen, and forgets on reset", () => {
    const storage = memory();
    let first!: ReturnType<typeof useTourProgress>;
    render(() => {
      first = useTourProgress("intro", storage);
      return null;
    });
    expect(first.seen()).toBe(false);
    first.setStep(2);
    let second!: ReturnType<typeof useTourProgress>;
    render(() => {
      second = useTourProgress("intro", storage);
      return null;
    });
    expect(second.step()).toBe(2);
    expect(second.status()).toBe("started");
    second.dismiss();
    expect(JSON.parse(storage.getItem("arc-tour:intro") ?? "{}")).toEqual({
      status: "dismissed",
      step: 2,
    });
    second.reset();
    expect(storage.getItem("arc-tour:intro")).toBeNull();
  });
});
