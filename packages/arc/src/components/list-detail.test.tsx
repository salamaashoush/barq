import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { Link } from "@barqjs/router";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";
import { icon } from "@barqjs/ui/shared-icon";

import { hydrates, settle, wears } from "../test-arc.ts";
import { ListDetailLayout, listDetailStyles } from "./list-detail.tsx";

function root(): HTMLElement {
  return document.querySelector('[data-slot="list-detail"]') as HTMLElement;
}

describe("ListDetailLayout", () => {
  test("the list and the record are named regions with a handle between", async () => {
    render(() => (
      <ListDetailLayout listLabel="Conversations" open list={<p>Threads</p>}>
        <p>Thread with Salama</p>
      </ListDetailLayout>
    ));
    await settle();
    const list = screen.getByRole("region", { name: "Conversations" });
    const detail = screen.getByRole("region", { name: "Details" });
    expect(list.textContent).toBe("Threads");
    expect(within(detail).getByText("Thread with Salama")).toBeDefined();
    expect(screen.getByRole("separator")).toBeDefined();
    expect(root().hasAttribute("data-open")).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("shows the placeholder while nothing is open, and Back lets go and returns to the list", async () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <ListDetailLayout
        listLabel="Inbox"
        open={open()}
        onBack={() => setOpen(false)}
        list={
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
        }
        placeholder={<p>Pick a conversation</p>}
      >
        <p>The conversation</p>
      </ListDetailLayout>
    ));
    await settle();
    expect(screen.getByText("Pick a conversation")).toBeDefined();
    expect(root().hasAttribute("data-open")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();
    expect(screen.getByText("The conversation")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Back to the list" }));
    await settle();
    expect(screen.getByText("Pick a conversation")).toBeDefined();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Inbox");
  });

  test("bound to a search parameter: a link opens the record and Back takes it out", async () => {
    function Inbox() {
      return (
        <ListDetailLayout
          listLabel="Inbox"
          param="thread"
          list={
            <Link to="/messages" search={{ thread: "t1", box: "sent" }}>
              Thread one
            </Link>
          }
          placeholder={<p>Pick one</p>}
        >
          <p>Thread one, open</p>
        </ListDetailLayout>
      );
    }
    const view = await renderRoute({
      routeTree: [{ path: "/messages", component: Inbox }] as never,
      path: "/messages?box=sent",
    });
    await settle();
    expect(screen.getByText("Pick one")).toBeDefined();
    await user.click(screen.getByRole("link", { name: "Thread one" }));
    await waitFor(() => expect(view.state.search().get("thread")).toBe("t1"));
    await settle();
    expect(screen.getByText("Thread one, open")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Back to the list" }));
    await waitFor(() => expect(view.state.search().has("thread")).toBe(false));
    expect(view.state.search().get("box")).toBe("sent");
    view.unmount();
  });

  test("which pane a narrow screen shows is the stylesheet's, per breakpoint", () => {
    render(() => <ListDetailLayout listLabel="Inbox" breakpoint="md" framed list={<p>List</p>} />);
    const css = collectCss();
    expect(css).toContain("(width < 48rem)");
    expect(listDetailStyles({ breakpoint: "md" }).root).not.toBe(
      listDetailStyles({ breakpoint: "xl" }).root,
    );
    expect(root().className).not.toBe(listDetailStyles({ breakpoint: "md" }).root);
  });

  test("its Back arrow turns with a right-to-left page", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <ListDetailLayout listLabel="الرسائل" open backLabel="رجوع" list={<p>القائمة</p>}>
          <p>المحادثة</p>
        </ListDetailLayout>
      </Rtl>
    ));
    await settle();
    const back = screen.getByRole("button", { name: "رجوع" });
    expect(wears(back.querySelector("svg"), icon.directional)).toBe(true);
    expect(screen.getByRole("region", { name: "الرسائل" })).toBeDefined();
  });

  test("a server's two panes are hydrated in place, open or not", async () => {
    const result = await hydrates(`
      import { ListDetailLayout } from "<arc>";
      export function Page() {
        return (
          <>
            <ListDetailLayout listLabel="Inbox" list={<p>List</p>} placeholder={<p>Pick one</p>} />
            <ListDetailLayout listLabel="Sent" open list={<p>List</p>}><p>Open</p></ListDetailLayout>
          </>
        );
      }
    `);
    expect(result.container.textContent).toContain("Pick one");
    result.unmount();
  });
});
