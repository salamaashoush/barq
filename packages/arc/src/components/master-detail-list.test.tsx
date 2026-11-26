import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import type { Key } from "@barqjs/aria/collections";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { ListItem } from "./item-list.tsx";
import { MasterDetailList } from "./master-detail-list.tsx";

interface Shot {
  id: string;
  name: string;
  state: string;
}

const SHOTS: Shot[] = [
  { id: "home", name: "Home page", state: "changed" },
  { id: "cart", name: "Cart", state: "new" },
  { id: "login", name: "Sign in", state: "unchanged" },
];

function row(name: string): HTMLElement {
  return screen.getByRole("row", { name: new RegExp(name) });
}

interface ReviewProps {
  onChecked?: (keys: Set<Key>) => void;
}

function Review(props: ReviewProps) {
  const [open, setOpen] = createSignal<Key>("home");
  return (
    <>
      <p data-testid="viewer">{String(open())}</p>
      <MasterDetailList
        aria-label="Screenshots"
        items={SHOTS}
        current={open()}
        onCurrentChange={setOpen}
        checkboxes
        isCheckable={(shot) => shot.state !== "unchanged"}
        onCheckedChange={props.onChecked}
      >
        {(shot) => <ListItem title={shot.name} meta={shot.state} />}
      </MasterDetailList>
    </>
  );
}

function viewer(): string {
  return screen.getByTestId("viewer").textContent ?? "";
}

describe("MasterDetailList", () => {
  test("the arrows open each row they reach, and the open row is the one selected", async () => {
    render(() => <Review />);
    await settle();
    expect(row("Home page").getAttribute("aria-selected")).toBe("true");
    await user.tab();
    expect(document.activeElement).toBe(row("Home page"));
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(viewer()).toBe("cart");
    expect(row("Cart").getAttribute("aria-selected")).toBe("true");
    expect(row("Home page").getAttribute("aria-selected")).toBe("false");
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(viewer()).toBe("login");
    await user.keyboard("{Escape}");
    await settle();
    expect(viewer()).toBe("login");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a press opens a row; a checkbox ticks it for a bulk action and leaves the open row alone", async () => {
    const ticked: string[][] = [];
    render(() => <Review onChecked={(keys) => ticked.push([...keys].map(String))} />);
    await settle();
    await user.click(screen.getByText("Cart"));
    await settle();
    expect(viewer()).toBe("cart");
    await user.click(screen.getByRole("checkbox", { name: "Select Home page" }));
    await settle();
    expect(viewer()).toBe("cart");
    expect(ticked).toEqual([["home"]]);
    expect(screen.getByRole("checkbox", { name: "Select Sign in" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  test("holds its own open row and ticks when not given them", async () => {
    render(() => (
      <MasterDetailList
        aria-label="Shots"
        items={SHOTS}
        defaultCurrent="cart"
        checkboxes
        defaultCheckedKeys={["login"]}
      >
        {(shot) => <ListItem title={shot.name} />}
      </MasterDetailList>
    ));
    await settle();
    expect(row("Cart").getAttribute("aria-selected")).toBe("true");
    const login = screen.getByRole<HTMLInputElement>("checkbox", { name: "Select Sign in" });
    expect(login.checked).toBe(true);
    await user.click(screen.getByText("Sign in"));
    await settle();
    expect(row("Sign in").getAttribute("aria-selected")).toBe("true");
  });

  test("an empty list says so, and no checkboxes are drawn unless asked for", async () => {
    render(() => (
      <>
        <MasterDetailList aria-label="None" items={[] as Shot[]} empty={<p>Nothing to review</p>}>
          {(shot) => <ListItem title={shot.name} />}
        </MasterDetailList>
        <MasterDetailList aria-label="Plain" items={SHOTS}>
          {(shot) => <ListItem title={shot.name} />}
        </MasterDetailList>
      </>
    ));
    await settle();
    expect(screen.getByText("Nothing to review")).toBeDefined();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  test("marks the open row at its start edge in a right-to-left page", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <MasterDetailList aria-label="لقطات" items={SHOTS} defaultCurrent="home">
          {(shot) => <ListItem title={shot.name} />}
        </MasterDetailList>
      </Rtl>
    ));
    await settle();
    await user.tab();
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(row("Cart").getAttribute("aria-selected")).toBe("true");
  });

  test("a server's list is hydrated in place", async () => {
    const result = await hydrates(`
      import { MasterDetailList, ListItem } from "<arc>";
      const shots = [{ id: "a", name: "Home" }, { id: "b", name: "Cart" }];
      export function Page() {
        return (
          <MasterDetailList aria-label="Shots" items={shots} defaultCurrent="a" checkboxes>
            {(shot) => <ListItem title={shot.name} />}
          </MasterDetailList>
        );
      }
    `);
    expect(result.container.querySelectorAll('[role="row"]').length).toBe(2);
    result.unmount();
  });
});
