import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { type Child, flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";
import { Button } from "./button.tsx";
import {
  drag,
  type DragOptions,
  dragSession,
  type DropEvent,
  isTextDropItem,
} from "./dnd/index.ts";
import { DropZone, DropZoneLabel } from "./dropzone.tsx";
import {
  fireClipboard,
  fireDrag,
  MockDataTransfer,
  nextFrame,
  restoreRects,
  stubRects,
} from "./test-dnd.ts";

function Draggable(props: { options?: Partial<DragOptions> }) {
  const { dragProps } = drag({
    getItems: () => [{ "text/plain": "hello world" }],
    ...props.options,
  });
  return (
    <div {...dragProps} role="button" tabIndex={0}>
      Drag me
    </div>
  );
}

async function textOf(event: DropEvent): Promise<string> {
  const item = event.items[0];
  if (item === undefined || !isTextDropItem(item)) throw new Error("not text");
  return item.getText("text/plain");
}

function Labelled(props: { children?: Child; onDrop?: (event: DropEvent) => void }) {
  return (
    <DropZone data-testid="zone" onDrop={props.onDrop}>
      <DropZoneLabel>Drop files here</DropZoneLabel>
      {props.children}
    </DropZone>
  );
}

afterEach(async () => {
  restoreRects();
  if (dragSession() !== null) {
    user.keyDown("Escape");
    user.keyUp("Escape");
  }
  await nextFrame();
});

describe("DropZone", () => {
  test("renders its children and forwards what it has no opinion about", () => {
    render(() => (
      <DropZone data-testid="zone" data-slot="dropzone" class="zone">
        <DropZoneLabel>Drop files here</DropZoneLabel>
      </DropZone>
    ));
    const zone = screen.getByTestId("zone");
    expect(zone.getAttribute("data-slot")).toBe("dropzone");
    expect(zone.getAttribute("class")).toBe("zone");
    expect(zone.textContent).toBe("Drop files here");
  });

  test("its button is named by itself and by its label", () => {
    render(() => <Labelled />);
    const button = screen.getByRole("button");
    const label = screen.getByText("Drop files here");
    expect(button.getAttribute("aria-label")).toBe("DropZone");
    expect(button.getAttribute("aria-labelledby")).toBe(`${button.id} ${label.id}`);
  });

  test("a label given by the caller replaces the default", () => {
    render(() => <DropZone aria-label="Upload for acme" />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toBe("Upload for acme");
    expect(button.hasAttribute("aria-labelledby")).toBe(false);
  });

  test("reports hover and focus as data attributes", () => {
    render(() => <Labelled />);
    const zone = screen.getByTestId("zone");
    user.hover(zone);
    expect(zone.hasAttribute("data-hovered")).toBe(true);
    user.unhover(zone);

    user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button"));
    expect(zone.hasAttribute("data-focused")).toBe(true);
    expect(zone.hasAttribute("data-focus-visible")).toBe(true);
  });

  describe("with a pointer", () => {
    let rects: { mockRestore(): void };
    beforeEach(() => {
      const rect = { left: 0, top: 0, right: 100, bottom: 50, x: 0, y: 0, width: 100, height: 50 };
      rects = stubRects(() => ({
        ...rect,
        toJSON: () => rect,
      }));
    });
    afterEach(() => rects.mockRestore());

    test("is the drop target while a drag is over it", async () => {
      const onDropEnter = mock();
      const onDrop = mock();
      render(() => (
        <>
          <Draggable />
          <DropZone data-testid="zone" onDropEnter={onDropEnter} onDrop={onDrop}>
            <DropZoneLabel>Drop files here</DropZoneLabel>
          </DropZone>
        </>
      ));
      const zone = screen.getByTestId("zone");
      const dataTransfer = new MockDataTransfer();
      fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer });
      fireDrag(zone, "dragenter", { dataTransfer, clientX: 1, clientY: 1 });
      expect(zone.hasAttribute("data-drop-target")).toBe(true);
      expect(onDropEnter).toHaveBeenCalledWith({ type: "dropenter", x: 1, y: 1 });

      fireDrag(zone, "drop", { dataTransfer, clientX: 1, clientY: 1 });
      expect(onDrop).toHaveBeenCalledTimes(1);
      expect(await textOf(onDrop.mock.calls[0]?.[0] as DropEvent)).toBe("hello world");
      expect(zone.hasAttribute("data-drop-target")).toBe(false);
      fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
    });

    test("a disabled zone takes nothing", () => {
      const onDropEnter = mock();
      const onDrop = mock();
      render(() => (
        <>
          <Draggable />
          <DropZone data-testid="zone" isDisabled onDropEnter={onDropEnter} onDrop={onDrop} />
        </>
      ));
      const zone = screen.getByTestId("zone");
      expect(zone.hasAttribute("data-disabled")).toBe(true);
      const dataTransfer = new MockDataTransfer();
      fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer });
      fireDrag(zone, "dragenter", { dataTransfer });
      fireDrag(zone, "drop", { dataTransfer });
      expect(onDropEnter).not.toHaveBeenCalled();
      expect(onDrop).not.toHaveBeenCalled();
      expect(zone.hasAttribute("data-drop-target")).toBe(false);
      fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
    });

    test("a click on the zone focuses its button", () => {
      render(() => (
        <Labelled>
          <div data-testid="inside">Somewhere</div>
        </Labelled>
      ));
      user.click(screen.getByTestId("inside"));
      expect(document.activeElement).toBe(screen.getByRole("button"));
    });

    test("a click on something focusable inside keeps focus there", () => {
      render(() => (
        <Labelled>
          <Button>Browse</Button>
        </Labelled>
      ));
      const browse = screen.getByRole("button", { name: "Browse" });
      user.click(browse);
      expect(document.activeElement).toBe(browse);
    });
  });

  describe("with a keyboard", () => {
    test("takes a keyboard drop", async () => {
      const onDrop = mock();
      const onDragEnd = mock();
      render(() => (
        <>
          <Draggable options={{ onDragEnd }} />
          <DropZone data-testid="zone" onDrop={onDrop}>
            <DropZoneLabel>Drop files here</DropZoneLabel>
          </DropZone>
        </>
      ));
      const draggable = screen.getByText("Drag me");
      user.tab();
      user.keyDown("Enter", { target: draggable });
      user.keyUp("Enter", { target: draggable });
      await nextFrame();

      const zone = screen.getByTestId("zone");
      const hidden = zone.querySelector("button") as HTMLButtonElement;
      expect(document.activeElement).toBe(hidden);
      expect(zone.hasAttribute("data-drop-target")).toBe(true);
      const describedBy = hidden.getAttribute("aria-describedby") ?? "";
      expect(document.getElementById(describedBy)?.textContent).toBe(
        "Press Enter to drop. Press Escape to cancel drag.",
      );

      user.keyDown("Enter");
      user.keyUp("Enter");
      expect(onDrop).toHaveBeenCalledTimes(1);
      expect(await textOf(onDrop.mock.calls[0]?.[0] as DropEvent)).toBe("hello world");
      expect(onDragEnd.mock.calls[0]?.[0]).toMatchObject({ dropOperation: "move" });
      expect(zone.hasAttribute("data-drop-target")).toBe(false);
    });

    test("a disabled zone is not offered", async () => {
      const onDrop = mock();
      const onDragEnd = mock();
      render(() => (
        <>
          <Draggable options={{ onDragEnd }} />
          <DropZone isDisabled onDrop={onDrop} />
        </>
      ));
      const draggable = screen.getByText("Drag me");
      user.tab();
      user.keyDown("Enter", { target: draggable });
      user.keyUp("Enter", { target: draggable });
      await nextFrame();
      expect(document.activeElement).toBe(draggable);

      user.keyDown("Enter");
      user.keyUp("Enter");
      expect(onDrop).not.toHaveBeenCalled();
      expect(onDragEnd.mock.calls[0]?.[0]).toMatchObject({ dropOperation: "cancel" });
    });
  });

  describe("paste", () => {
    test("a paste is a copy dropped on the zone", async () => {
      const onDrop = mock();
      render(() => <Labelled onDrop={onDrop} />);
      user.tab();
      const button = screen.getByRole("button");
      expect(document.activeElement).toBe(button);

      const data = new MockDataTransfer();
      data.items.add("salama", "text/plain");
      expect(fireClipboard(button, "beforepaste", data)).toBe(false);
      fireClipboard(button, "paste", data);
      expect(onDrop).toHaveBeenCalledTimes(1);
      const event = onDrop.mock.calls[0]?.[0] as DropEvent;
      expect(event).toMatchObject({ type: "drop", x: 0, y: 0, dropOperation: "copy" });
      expect(await textOf(event)).toBe("salama");
    });

    test("a disabled zone cannot be focused to paste into", () => {
      const onDrop = mock();
      render(() => <DropZone isDisabled onDrop={onDrop} />);
      user.tab();
      flush();
      expect(document.activeElement).not.toBe(screen.getByRole("button"));
    });
  });
});
