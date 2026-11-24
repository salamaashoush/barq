import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user, within } from "@barqjs/testing";
import { Button } from "./button.tsx";
import { PortalProvider } from "./dialog.tsx";
import { TOP_LAYER_ATTRIBUTE } from "./dom.ts";
import { toastQueue, type ToastQueue } from "./toast.ts";
import {
  ToastBody,
  ToastCloseButton,
  ToastDescription,
  ToastList,
  ToastRegion,
  ToastRoot,
  ToastTitle,
} from "./toast-components.tsx";

function after(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 20));
}

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

interface ExampleProps {
  queue: ToastQueue;
  label?: string;
}

function Example(props: ExampleProps) {
  return (
    <>
      <ToastRegion queue={props.queue} aria-label={props.label} data-testid="region">
        {(toast) => (
          <ToastRoot toast={toast}>
            <ToastBody data-testid="body">
              <ToastTitle>{String(toast.title)}</ToastTitle>
              <ToastDescription>{String(toast.description)}</ToastDescription>
            </ToastBody>
            <ToastCloseButton>×</ToastCloseButton>
          </ToastRoot>
        )}
      </ToastRegion>
      <Button
        onPress={() => props.queue.add({ title: "Saved", description: "By salama", duration: 40 })}
      >
        Save
      </Button>
    </>
  );
}

function save(): HTMLElement {
  return screen.getByRole("button", { name: "Save" });
}

describe("ToastRegion", () => {
  test("nothing is rendered until there is a toast", () => {
    render(() => <Example queue={toastQueue()} />);

    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a toast is a labelled, described non-modal alert dialog in a named region", async () => {
    const queue = toastQueue();
    render(() => <Example queue={queue} />);

    user.click(save());
    await settle();

    const region = screen.getByRole("region");
    expect(region.getAttribute("aria-label")).toBe("1 notification.");
    expect(region.getAttribute("tabindex")).toBe("-1");
    expect(region.hasAttribute(TOP_LAYER_ATTRIBUTE)).toBe(true);

    const toast = screen.getByRole("alertdialog");
    expect(toast.getAttribute("aria-modal")).toBe("false");
    expect(toast.getAttribute("tabindex")).toBe("0");
    const title = document.getElementById(toast.getAttribute("aria-labelledby") ?? "");
    expect(title?.textContent).toBe("Saved");
    const description = document.getElementById(toast.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toBe("By salama");

    const alert = within(toast).getByRole("alert");
    expect(alert.getAttribute("aria-atomic")).toBe("true");
    expect(alert.hasAttribute("aria-hidden")).toBe(false);

    const close = within(toast).getByRole("button");
    expect(close.getAttribute("aria-label")).toBe("Close");
  });

  test("the region counts what it holds, and a label replaces the count", async () => {
    const queue = toastQueue();
    render(() => <Example queue={queue} />);
    queue.add({ title: "One", duration: Infinity });
    queue.add({ title: "Two", duration: Infinity });
    await settle();
    expect(screen.getByRole("region").getAttribute("aria-label")).toBe("2 notifications.");
    queue.clear();
    await settle();
    expect(screen.queryByRole("region")).toBeNull();

    const other = toastQueue();
    render(() => <Example queue={other} label="Toasts" />);
    other.add({ title: "Three", duration: Infinity });
    await settle();
    expect(screen.getByRole("region").getAttribute("aria-label")).toBe("Toasts");
  });

  test("a toast without a description points at none", async () => {
    const queue = toastQueue();
    render(() => (
      <ToastRegion queue={queue}>
        {(toast) => (
          <ToastRoot toast={toast}>
            <ToastTitle>{String(toast.title)}</ToastTitle>
          </ToastRoot>
        )}
      </ToastRegion>
    ));
    queue.add({ title: "Copied", duration: Infinity });
    await settle();

    expect(screen.getByRole("alertdialog").hasAttribute("aria-describedby")).toBe(false);
  });

  test("the close button dismisses its toast", async () => {
    const queue = toastQueue();
    render(() => <Example queue={queue} />);
    user.click(save());
    await settle();

    user.click(within(screen.getByRole("alertdialog")).getByRole("button"));
    await settle();

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("region")).toBeNull();
  });

  test("its timer removes it", async () => {
    const queue = toastQueue();
    render(() => <Example queue={queue} />);
    user.click(save());
    await settle();
    expect(screen.getByRole("alertdialog")).not.toBeNull();

    await after(40);
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("hovering the region stops the clocks, and leaving starts them", async () => {
    const queue = toastQueue();
    render(() => <Example queue={queue} />);
    user.click(save());
    await settle();

    user.hover(screen.getByRole("region"));
    flush();
    expect(screen.getByRole("region").hasAttribute("data-hovered")).toBe(true);
    await after(60);
    await settle();
    expect(screen.getByRole("alertdialog")).not.toBeNull();

    user.unhover(screen.getByRole("region"));
    await after(40);
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("focus in the region stops the clocks", async () => {
    const queue = toastQueue();
    render(() => <Example queue={queue} />);
    user.click(save());
    await settle();

    user.focus(screen.getByRole("alertdialog"));
    await after(60);
    await settle();
    expect(screen.getByRole("alertdialog")).not.toBeNull();
    expect(screen.getByRole("alertdialog").hasAttribute("data-focused")).toBe(true);

    user.blur(screen.getByRole("alertdialog"));
    await after(40);
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("closing the last toast gives focus back to where it came from", async () => {
    const queue = toastQueue();
    render(() => <Example queue={queue} />);
    user.click(save());
    await settle();

    user.click(within(screen.getByRole("alertdialog")).getByRole("button"));
    await settle();

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(save());
  });

  test("with the mouse, closing one of several gives focus back too", async () => {
    const queue = toastQueue();
    render(() => <Example queue={queue} />);
    user.click(save());
    user.click(save());
    await settle();

    user.click(within(screen.getAllByRole("alertdialog")[0] as HTMLElement).getByRole("button"));
    await settle();
    expect(document.activeElement).toBe(save());
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  });

  test("from the keyboard, closing one moves focus to the one remaining", async () => {
    const queue = toastQueue();
    render(() => <Example queue={queue} />);
    queue.add({ title: "First", duration: Infinity });
    queue.add({ title: "Second", duration: Infinity });
    await settle();
    user.focus(save());

    const [first] = screen.getAllByRole("alertdialog");
    user.focus(within(first as HTMLElement).getByRole("button"));
    user.key("Enter");
    await settle();

    const remaining = screen.getByRole("alertdialog");
    expect(document.activeElement).toBe(remaining);
    expect(remaining.hasAttribute("data-focused")).toBe(true);

    user.focus(within(remaining).getByRole("button"));
    user.key("Enter");
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(save());
  });

  test("an update in place reaches the markup without rebuilding it", async () => {
    const queue = toastQueue();
    render(() => <Example queue={queue} />);
    const id = queue.add({ title: "Saving", duration: Infinity });
    await settle();
    const toast = screen.getByRole("alertdialog");

    queue.update(id, { title: "Saved" });
    await settle();

    expect(screen.getByRole("alertdialog")).toBe(toast);
    expect(within(toast).getByText("Saved")).not.toBeNull();
  });

  test("the toast carries its kind and whether it is leaving", async () => {
    const queue = toastQueue();
    render(() => <Example queue={queue} />);
    queue.add({ title: "Oops", kind: "error", duration: Infinity });
    await settle();

    expect(screen.getByRole("alertdialog").getAttribute("data-kind")).toBe("error");
    expect(screen.getByRole("alertdialog").hasAttribute("data-leaving")).toBe(false);
  });

  test("a ToastList can sit inside other markup", async () => {
    const queue = toastQueue();
    render(() => (
      <ToastRegion queue={queue}>
        <header>Inbox</header>
        <ToastList data-testid="list">
          {(toast) => (
            <ToastRoot toast={toast}>
              <ToastTitle>{String(toast.title)}</ToastTitle>
            </ToastRoot>
          )}
        </ToastList>
      </ToastRegion>
    ));
    queue.add({ title: "Hello", duration: Infinity });
    await settle();

    const list = screen.getByTestId("list");
    expect(list.tagName).toBe("OL");
    expect(within(list).getByRole("alertdialog")).not.toBeNull();
  });

  test("the region goes where a PortalProvider sends it", async () => {
    const queue = toastQueue();
    const container = document.createElement("div");
    document.body.append(container);
    render(() => (
      <PortalProvider getContainer={() => container}>
        <Example queue={queue} />
      </PortalProvider>
    ));
    queue.add({ title: "Elsewhere", duration: Infinity });
    await settle();

    expect(within(container).getByRole("alertdialog")).not.toBeNull();
    container.remove();
  });
});
