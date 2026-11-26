import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { type Autosave, SaveStatus, useAutosave } from "./autosave.tsx";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function deferred(): Deferred {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  return { promise, resolve: () => resolve(), reject };
}

interface Harness {
  set: (value: string) => void;
  autosave: Autosave<string>;
}

interface DraftProps {
  save: (value: string) => unknown;
  blockedBy?: (value: string) => string | undefined;
  onReady: (harness: Harness) => void;
}

function Draft(props: DraftProps) {
  const [value, setValue] = createSignal("Intro");
  const autosave = useAutosave({
    value,
    save: (next) => props.save(next),
    delay: 20,
    blockedBy: props.blockedBy,
  });
  props.onReady({ set: setValue, autosave });
  return (
    <>
      <input
        aria-label="Title"
        value={value()}
        onInput={(event: Event) => setValue((event.currentTarget as HTMLInputElement).value)}
      />
      <SaveStatus autosave={autosave} />
    </>
  );
}

function harnessed(props: Omit<DraftProps, "onReady">): Harness {
  let harness: Harness | undefined;
  render(() => <Draft {...props} onReady={(ready: Harness) => (harness = ready)} />);
  return harness as Harness;
}

function status(): HTMLElement {
  return screen.getByRole("status");
}

describe("useAutosave", () => {
  test("saves once typing pauses, and says so", async () => {
    const saved: string[] = [];
    const draft = harnessed({ save: (value) => void saved.push(value) });
    await settle();
    expect(draft.autosave.state()).toBe("idle");
    await user.type(screen.getByRole("textbox", { name: "Title" }), " to sets");
    await settle();
    expect(draft.autosave.state()).toBe("pending");
    expect(status().textContent).toContain("Saving…");
    expect(saved).toEqual([]);
    await waitFor(() => expect(saved).toEqual(["Intro to sets"]));
    await settle();
    expect(draft.autosave.state()).toBe("saved");
    expect(draft.autosave.dirty()).toBe(false);
    expect(status().textContent).toContain("Saved");
  });

  test("one save at a time: a change made during a save is saved after it lands", async () => {
    const calls: string[] = [];
    const first = deferred();
    const draft = harnessed({
      save: (value) => {
        calls.push(value);
        return calls.length === 1 ? first.promise : undefined;
      },
    });
    await settle();
    draft.set("One");
    await settle();
    await waitFor(() => expect(calls).toEqual(["One"]));
    draft.set("Two");
    await settle();
    await wait(60);
    expect(calls).toEqual(["One"]);
    first.resolve();
    await waitFor(() => expect(calls).toEqual(["One", "Two"]));
    await settle();
    expect(draft.autosave.state()).toBe("saved");
  });

  test("changing back before the pause ends saves nothing", async () => {
    const saved: string[] = [];
    const draft = harnessed({ save: (value) => void saved.push(value) });
    await settle();
    draft.set("Intro!");
    await settle();
    draft.set("Intro");
    await settle();
    await wait(60);
    expect(saved).toEqual([]);
    expect(draft.autosave.state()).toBe("idle");
  });

  test("Mod+S saves at once, from inside a field", async () => {
    const saved: string[] = [];
    const draft = harnessed({ save: (value) => void saved.push(value) });
    await settle();
    const input = screen.getByRole("textbox", { name: "Title" });
    await user.type(input, "!");
    await settle();
    const mac = /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
    const press = new KeyboardEvent("keydown", {
      key: "s",
      metaKey: mac,
      ctrlKey: !mac,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    await settle();
    expect(saved).toEqual(["Intro!"]);
    expect(draft.autosave.state()).not.toBe("error");
  });

  test("a failed save says why, keeps the draft and retries", async () => {
    let fail = true;
    const saved: string[] = [];
    const draft = harnessed({
      save: (value) => {
        if (fail) return Promise.reject(new Error("the server is not answering"));
        saved.push(value);
        return undefined;
      },
    });
    await settle();
    draft.set("Intro to sets");
    await waitFor(() => expect(draft.autosave.state()).toBe("error"));
    await settle();
    expect(draft.autosave.reason()).toBe("The server is not answering.");
    expect(status().textContent).toContain("Not saved");
    expect(status().textContent).toContain("The server is not answering.");
    expect(draft.autosave.dirty()).toBe(true);
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(saved).toEqual(["Intro to sets"]));
    await settle();
    expect(draft.autosave.state()).toBe("saved");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  test("a draft that cannot be stored is held with the reason, and saved once it can", async () => {
    const saved: string[] = [];
    const draft = harnessed({
      save: (value) => void saved.push(value),
      blockedBy: (value) => (value.trim() === "" ? "A title is needed" : undefined),
    });
    await settle();
    draft.set("");
    await settle();
    expect(draft.autosave.state()).toBe("blocked");
    expect(status().textContent).toContain("A title is needed");
    await wait(60);
    expect(saved).toEqual([]);
    draft.set("Sets");
    await waitFor(() => expect(saved).toEqual(["Sets"]));
  });

  test("offline it holds the draft, and saves it when the connection is back", async () => {
    const saved: string[] = [];
    const draft = harnessed({ save: (value) => void saved.push(value) });
    await settle();
    window.dispatchEvent(new Event("offline"));
    await settle();
    draft.set("Written on a train");
    await waitFor(() => expect(draft.autosave.state()).toBe("offline"));
    await settle();
    expect(status().textContent).toContain("Offline");
    expect(saved).toEqual([]);
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(saved).toEqual(["Written on a train"]));
  });

  test("markSaved takes a value the server already holds as saved", async () => {
    const saved: string[] = [];
    const draft = harnessed({ save: (value) => void saved.push(value) });
    await settle();
    draft.set("Loaded again");
    await settle();
    draft.autosave.markSaved("Loaded again");
    await settle();
    await wait(60);
    expect(saved).toEqual([]);
    expect(draft.autosave.dirty()).toBe(false);
  });

  test("unmounting saves what is waiting", async () => {
    const saved: string[] = [];
    let harness: Harness | undefined;
    const view = render(() => (
      <Draft save={(value) => void saved.push(value)} onReady={(ready) => (harness = ready)} />
    ));
    await settle();
    harness?.set("Last words");
    await settle();
    view.unmount();
    await waitFor(() => expect(saved).toEqual(["Last words"]));
  });
});

describe("SaveStatus", () => {
  test("a polite status for each state, a Retry only on a failure, and nothing while idle", async () => {
    const [state, setState] = createSignal<
      "idle" | "saving" | "saved" | "error" | "offline" | "blocked"
    >("idle");
    const retried: number[] = [];
    render(() => (
      <SaveStatus
        state={state()}
        reason="The server is not answering."
        onRetry={() => retried.push(1)}
      />
    ));
    const root = document.querySelector('[data-slot="save-status"]') as HTMLElement;
    expect(status().textContent).toBe("");
    setState("saving");
    await settle();
    expect(root.getAttribute("data-state")).toBe("saving");
    expect(status().textContent).toBe("Saving…");
    expect(status().querySelector('[data-slot="spinner"], svg')).not.toBeNull();
    setState("saved");
    await settle();
    expect(status().textContent).toBe("Saved");
    expect(screen.queryByRole("button")).toBeNull();
    setState("offline");
    await settle();
    expect(status().textContent).toContain("Offline");
    setState("blocked");
    await settle();
    expect(status().textContent).toContain("Not saved yet");
    expect(status().textContent).toContain("The server is not answering.");
    setState("error");
    await settle();
    expect(status().textContent).toContain("Not saved");
    const retry = screen.getByRole("button", { name: "Retry" });
    retry.focus();
    await user.keyboard("{Enter}");
    user.tap(retry);
    expect(retried).toEqual([1, 1]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("compact keeps the words for a screen reader once, and takes a class per part", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <SaveStatus state="saved" compact class="mine" classes={{ status: "line" }} />
      </Rtl>
    ));
    const root = document.querySelector('[data-slot="save-status"]') as HTMLElement;
    expect(root.classList.contains("mine")).toBe(true);
    expect(status().classList.contains("line")).toBe(true);
    const hidden = status().querySelector('[aria-hidden="true"]:not(svg)');
    expect(hidden?.textContent).toBe("Saved");
    expect(screen.getByRole("status", { name: "" }).textContent).toContain("Saved");
  });

  test("a server's status is hydrated in place", async () => {
    const result = await hydrates(`
      import { SaveStatus } from "<arc>";
      export function Page() {
        return <SaveStatus state="error" reason="Offline" onRetry={() => {}} />;
      }
    `);
    expect(result.container.textContent).toContain("Not saved");
    result.unmount();
  });
});
