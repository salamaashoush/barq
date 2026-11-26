import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { type ParentProps, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { decodeUrlState } from "@barqjs/primitives/url-state";
import { Button } from "@barqjs/ui/button";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { ShareDialog } from "./share-dialog.tsx";

const WORKSPACE = {
  files: { "main.toy": "let total = 0\nfor n in 1..10 { total += n }\nprint total\n".repeat(10) },
  open: ["main.toy"],
};

interface HappyWindow {
  happyDOM: HappyDom;
}

interface HappyDom {
  setURL(url: string): void;
}

function setURL(url: string): void {
  (window as unknown as HappyWindow).happyDOM.setURL(url);
}

beforeAll(() => setURL("http://localhost/"));
afterAll(() => setURL("about:blank"));
afterEach(() => {
  history.replaceState(null, "", "/");
});

function linkField(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox", { name: "Link" });
}

async function stateOf(link: string, key = "state"): Promise<unknown> {
  const hash = new URL(link).hash.slice(1);
  return decodeUrlState(new URLSearchParams(hash).get(key) ?? "");
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("ShareDialog", () => {
  test("opens on its trigger, makes the link, writes it into the address, and copies it", async () => {
    const links: string[] = [];
    let copied = "";
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          copied = text;
        },
      },
      configurable: true,
    });
    history.replaceState(null, "", "/play#theme=dark");
    render(() => (
      <ShareDialog
        state={WORKSPACE}
        trigger={<Button>Share</Button>}
        onLink={(link) => links.push(link)}
      />
    ));
    await settle();
    await user.click(screen.getByRole("button", { name: "Share" }));
    flush();
    const dialog = screen.getByRole("dialog", { name: "Share" });
    expect(within(dialog).getByText("Anyone with the link opens this as it is now.")).toBeDefined();
    await waitFor(() => expect(links).toHaveLength(1));
    flush();
    const link = linkField().value;
    expect(link).toBe(links[0] as string);
    expect(location.href).toBe(link);
    expect(new URLSearchParams(location.hash.slice(1)).get("theme")).toBe("dark");
    expect(await stateOf(link)).toEqual(WORKSPACE);
    expect(linkField().readOnly).toBe(true);
    const size = document.querySelector('[data-slot="share-dialog-size"]')?.textContent ?? "";
    expect(size).toMatch(
      new RegExp(`^${String(link.length)} characters: .+ of state, compressed to .+$`),
    );
    expect(screen.queryByRole("alert")).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Copy link" }));
    await settle();
    expect(copied).toBe(link);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a link to another page, under its own key, leaves this page's address alone", async () => {
    const links: string[] = [];
    render(() => (
      <ShareDialog
        state={[1, 2, 3]}
        stateKey="s"
        base="https://play.example.com/p"
        defaultOpen
        onLink={(link) => links.push(link)}
      />
    ));
    await waitFor(() => expect(links).toHaveLength(1));
    expect(location.hash).toBe("");
    expect(links[0]?.startsWith("https://play.example.com/p#s=")).toBe(true);
    expect(await stateOf(links[0] as string, "s")).toEqual([1, 2, 3]);
  });

  test("controlled, without touching the address, and warning about a long link", async () => {
    const links: string[] = [];
    const opens: boolean[] = [];
    render(() => (
      <ShareDialog
        state={WORKSPACE}
        open
        onOpenChange={(open) => opens.push(open)}
        updateAddress={false}
        maxLength={50}
        onLink={(link) => links.push(link)}
      />
    ));
    expect(screen.getByText("Making the link...")).toBeDefined();
    await waitFor(() => expect(links).toHaveLength(1));
    flush();
    expect(location.hash).toBe("");
    expect(
      screen.getByText("A link this long may be cut short by some chats and mail apps."),
    ).toBeDefined();
    await user.keyboard("{Escape}");
    flush();
    expect(opens).toEqual([false]);
  });

  test("a state with no JSON form says it could not be shared", async () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    render(() => <ShareDialog state={cycle} defaultOpen />);
    await waitFor(() => expect(screen.getByText("This could not be put in a link.")).toBeDefined());
  });

  test("right to left, the link itself still left to right", async () => {
    const links: string[] = [];
    render(() => (
      <Arabic>
        <ShareDialog
          state={{ a: "ب" }}
          defaultOpen
          heading="مشاركة"
          onLink={(link) => links.push(link)}
        />
      </Arabic>
    ));
    await waitFor(() => expect(links).toHaveLength(1));
    flush();
    expect(screen.getByRole("dialog", { name: "مشاركة" })).toBeDefined();
    expect(linkField().getAttribute("dir")).toBe("ltr");
  });
});

describe("a share dialog hydrates", () => {
  test("closed, as the server wrote it", async () => {
    const result = await hydrates(`
      import { ShareDialog } from "<arc>";
      import { Button } from "@barqjs/ui/button";
      export function Page() {
        return <ShareDialog state={{ a: 1 }} trigger={<Button>Share</Button>} />;
      }
    `);
    expect(result.container.textContent).toContain("Share");
    result.unmount();
  });
});
