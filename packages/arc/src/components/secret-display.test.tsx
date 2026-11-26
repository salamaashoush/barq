import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import {
  MaskedValue,
  OneTimeSecret,
  RedactedSecret,
  RedactedText,
  handOffSecret,
  redactedPieces,
  takeSecret,
} from "./secret-display.tsx";

afterEach(() => destroyAnnouncer());

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

function shownText(): string | null | undefined {
  return document.querySelector('[data-slot="masked-value-value"]')?.textContent;
}

describe("MaskedValue", () => {
  test("masked but for its end, shown by a toggle and copied", async () => {
    render(() => <MaskedValue label="the token" value="acme_demo_abcdef1234" />);
    await settle();
    expect(shownText()).toBe("•••• 1234Hidden");
    const show = screen.getByRole("button", { name: "Show the token" });
    expect(show.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Copy the token" })).toBeDefined();
    await user.click(show);
    await settle();
    expect(shownText()).toBe("acme_demo_abcdef1234");
    const hide = screen.getByRole("button", { name: "Hide the token" });
    expect(hide.getAttribute("aria-pressed")).toBe("true");
    hide.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(shownText()).toBe("•••• 1234Hidden");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("fetched only when asked for, and a refusal says why", async () => {
    let asked = 0;
    let refuse = true;
    render(() => (
      <MaskedValue
        label="the passport number"
        masked="•••• 4821"
        reveal={() => {
          asked += 1;
          return refuse
            ? Promise.reject(new Error("you may not see it"))
            : Promise.resolve("A1234821");
        }}
      />
    ));
    await settle();
    expect(asked).toBe(0);
    expect(screen.queryByRole("button", { name: /^Copy/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show the passport number" }));
    await waitFor(() =>
      expect(document.querySelector('[data-slot="masked-value-error"]')?.textContent).toBe(
        "You may not see it.",
      ),
    );
    refuse = false;
    await user.click(screen.getByRole("button", { name: "Show the passport number" }));
    await waitFor(() => expect(shownText()).toBe("A1234821"));
    expect(asked).toBe(2);
    expect(screen.getByRole("button", { name: "Copy the passport number" })).toBeDefined();
  });

  test("a reader who may not see it gets no buttons; it hides again after a while", async () => {
    render(() => (
      <>
        <MaskedValue label="the code" value="998877" canReveal={false} />
        <MaskedValue label="the key" value="abcdefghij" hideAfter={20} copyable={false} />
      </>
    ));
    await settle();
    expect(screen.queryByRole("button", { name: "Show the code" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy the key" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show the key" }));
    await settle();
    function key(): string | null | undefined {
      return document.querySelectorAll('[data-slot="masked-value-value"]')[1]?.textContent;
    }
    expect(key()).toBe("abcdefghij");
    await waitFor(() => expect(key()).toBe("•••• ghijHidden"));
  });

  test("left to right inside a right-to-left page", async () => {
    render(() => (
      <Rtl>
        <MaskedValue label="الرمز" value="abc12345678" />
      </Rtl>
    ));
    await settle();
    expect(document.querySelector('[data-slot="masked-value-value"]')?.getAttribute("dir")).toBe(
      "ltr",
    );
  });
});

describe("OneTimeSecret", () => {
  test("a status naming the secret, its copy button and when it stops working", async () => {
    render(() => (
      <OneTimeSecret
        value="ak_live_9f8e7d6c5b4a"
        heading="Key k8s-prod"
        expiresAt="2026-12-31T12:00:00Z"
      />
    ));
    await settle();
    const status = document.querySelector('[data-slot="one-time-secret"]') as HTMLElement;
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toContain("Key k8s-prod");
    expect(status.textContent).toContain("Copy it now. It is not shown again.");
    expect(status.textContent).toContain("ak_live_9f8e7d6c5b4a");
    expect(status.textContent).toContain("It works until");
    expect(screen.getByRole("button", { name: "Copy the secret" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("Done waits for the reader to say it is stored", async () => {
    let done = 0;
    render(() => <OneTimeSecret value="secret" tone="warning" onDone={() => (done += 1)} />);
    await settle();
    const button = screen.getByRole("button", { name: "Done" });
    expect(button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true").toBe(
      true,
    );
    await user.click(screen.getByRole("checkbox", { name: "I have stored it somewhere safe" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(done).toBe(1);
    expect(document.querySelector('[data-slot="one-time-secret"]')?.getAttribute("data-tone")).toBe(
      "warning",
    );
  });

  test("a secret handed to the next page is taken once", () => {
    handOffSecret("tunnel-1", "tk_123");
    expect(takeSecret("tunnel-1")).toBe("tk_123");
    expect(takeSecret("tunnel-1")).toBeUndefined();
  });
});

describe("RedactedSecret", () => {
  test("a lock and the name, read as a secret with its reason", async () => {
    render(() => (
      <p>
        Signed in with <RedactedSecret name="PASSWORD" reason="Removed by the runner" />
      </p>
    ));
    await settle();
    const marker = document.querySelector('[data-slot="redacted-secret"]');
    expect(marker?.textContent).toBe("Secret PASSWORD, Removed by the runner");
    expect(marker?.getAttribute("title")).toBe("Removed by the runner");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("text with its redactions drawn as markers", async () => {
    expect(redactedPieces("a [redacted] b [REDACTED: TOKEN] c")).toEqual([
      { text: "a " },
      { text: "[redacted]", secret: "" },
      { text: " b " },
      { text: "[REDACTED: TOKEN]", secret: "TOKEN" },
      { text: " c" },
    ]);
    render(() => (
      <p data-testid="line">
        <RedactedText
          text="fill <secret>EMAIL</secret> then <secret>PASSWORD</secret>"
          pattern={/<secret>(\w+)<\/secret>/}
          reason={(name) => `The value of ${name ?? "it"}`}
        />
      </p>
    ));
    await settle();
    const markers = document.querySelectorAll('[data-slot="redacted-secret"]');
    expect(markers).toHaveLength(2);
    expect(screen.getByTestId("line").textContent).toBe(
      "fill Secret EMAIL, The value of EMAIL then Secret PASSWORD, The value of PASSWORD",
    );
  });
});

describe("secret display on the server", () => {
  test("is hydrated in place", async () => {
    const result = await hydrates(`
      import { MaskedValue, OneTimeSecret, RedactedText } from "<arc>";
      export function Page() {
        return (
          <div>
            <MaskedValue label="the token" value="acme_demo_abcdef1234" />
            <OneTimeSecret value="ak_live_1" expiresAt="2026-12-31" onDone={() => {}} />
            <p><RedactedText text="a [redacted: TOKEN] b" /></p>
          </div>
        );
      }
    `);
    expect(result.container.textContent).toContain("ak_live_1");
    result.unmount();
  });
});
