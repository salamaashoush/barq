/**
 * Collaboration in the editor's UI, Excalidraw's: the user list at the top
 * end (on a phone, in the main menu), following from it, the host's
 * viewport status frame, the live collaboration trigger and the laser's own
 * button while collaborating, and the collaboration props.
 */

import { describe, expect, test } from "bun:test";
import { createSignal } from "@barqjs/core";
import { screen, user, within } from "@barqjs/testing";

import { LiveCollaborationTrigger, MainMenu } from "../index.ts";
import { canvas, mountEditor, pointer, settle, setupUITests } from "./test-ui.tsx";

import type {
  Collaborator,
  DiagramEditorApi,
  OnUserFollowedPayload,
  PointerUpdatePayload,
  SocketId,
  UserToFollow,
} from "../index.ts";

function region() {
  return document.querySelector<HTMLElement>("[role=application]")!;
}

setupUITests();

function socket(id: string) {
  return id as SocketId;
}

function people(entries: Record<string, Collaborator>) {
  return new Map(Object.entries(entries).map(([id, collaborator]) => [socket(id), collaborator]));
}

async function join(api: DiagramEditorApi, entries: Record<string, Collaborator>) {
  api.updateScene({ collaborators: people(entries) });
  await settle();
}

function avatarNames() {
  return within(screen.getByTestId("user-list"))
    .queryAllByTestId("collaborator-avatar")
    .map((avatar) => avatar.getAttribute("aria-label"));
}

describe("the user list", () => {
  test("shows once there are collaborators, the named ones, the current user's menu last", async () => {
    const { api } = await mountEditor();
    expect(screen.queryByTestId("user-list")).toBeNull();
    await join(api, {
      me: { username: "Me", isCurrentUser: true },
      alice: { username: "Alice" },
      nameless: { username: "  " },
      bob: { username: "Bob", avatarUrl: "https://example.com/bob.png" },
    });
    expect(avatarNames()).toEqual(["Alice", "Bob"]);
    const list = screen.getByTestId("user-list");
    const trigger = within(list).getByTestId("user-list-trigger");
    expect(list.querySelector("img")?.getAttribute("src")).toBe("https://example.com/bob.png");
    // an initial on the collaborator's colour without a picture
    expect(within(list).getByText("A")).toBeDefined();
    expect(trigger.getAttribute("aria-label")).toBe("Collaborators");
  });

  test("an avatar asks to follow its collaborator, and to stop once followed", async () => {
    const intents: OnUserFollowedPayload[] = [];
    const { api } = await mountEditor({ onUserFollow: (payload) => intents.push(payload) });
    const fromApi: OnUserFollowedPayload[] = [];
    api.onUserFollow((payload) => fromApi.push(payload));
    await join(api, { alice: { socketId: socket("alice"), username: "Alice" } });
    await user.click(screen.getByRole("button", { name: "Alice" }));
    expect(intents).toEqual([
      { userToFollow: { socketId: socket("alice"), username: "Alice" }, action: "FOLLOW" },
    ]);
    expect(fromApi).toEqual(intents);
  });

  test("the followed collaborator is marked, and pressing them again stops following", async () => {
    const intents: OnUserFollowedPayload[] = [];
    const { api } = await mountEditor({
      userToFollow: { socketId: socket("alice"), username: "Alice" },
      onUserFollow: (payload) => intents.push(payload),
    });
    await join(api, {
      alice: { socketId: socket("alice"), username: "Alice" },
      bob: { socketId: socket("bob"), username: "Bob" },
    });
    expect(screen.getByRole("button", { name: "Alice" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Bob" }).getAttribute("aria-pressed")).toBe("false");
    await user.click(screen.getByRole("button", { name: "Alice" }));
    expect(intents.map((intent) => intent.action)).toEqual(["UNFOLLOW"]);
  });

  test("as many avatars as fit, everyone in the menu, searchable once there are many", async () => {
    const { api } = await mountEditor();
    const names = ["Ann", "Bob", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jon", "Kim"];
    await join(api, {
      me: { username: "Me", isCurrentUser: true },
      ...Object.fromEntries(names.map((name) => [name, { username: name }])),
    });
    // eight slots: seven others, and the current user's menu
    expect(avatarNames()).toEqual(names.slice(0, 7));

    await user.click(screen.getByTestId("user-list-trigger"));
    await settle();
    const menu = screen.getByTestId("user-list-menu");
    expect(within(menu).getByText("Click on user to follow")).toBeDefined();
    function rows() {
      return within(menu)
        .queryAllByTestId("collaborator-row")
        .map((row) => row.textContent?.trim());
    }
    expect(rows()).toEqual(["MMe (You)", ...names.map((name) => `${name[0]}${name}`)]);

    const search = within(menu).getByTestId<HTMLInputElement>("user-list-search");
    await user.type(search, "BO");
    await settle();
    expect(rows()).toEqual(["BBob"]);
    await user.clear(search);
    await user.type(search, "zzz");
    await settle();
    expect(rows()).toEqual([]);
    expect(within(menu).getByText("No users found")).toBeDefined();
  });

  test("no search under eight; the current user's row does nothing; a row follows", async () => {
    const intents: OnUserFollowedPayload[] = [];
    const { api } = await mountEditor({
      userToFollow: { socketId: socket("alice"), username: "Alice" },
      onUserFollow: (payload) => intents.push(payload),
    });
    await join(api, {
      me: { socketId: socket("me"), username: "Me", isCurrentUser: true },
      alice: { socketId: socket("alice"), username: "Alice", isInCall: true, isMuted: true },
      bob: { socketId: socket("bob"), username: "Bob", isInCall: true, isSpeaking: true },
    });
    await user.click(screen.getByTestId("user-list-trigger"));
    await settle();
    const menu = screen.getByTestId("user-list-menu");
    expect(within(menu).queryByTestId("user-list-search")).toBeNull();
    const [me, alice, bob] = within(menu).getAllByTestId("collaborator-row");
    expect((me as HTMLButtonElement).disabled).toBe(true);
    expect(within(alice!).getByTestId("collaborator-followed")).toBeDefined();
    expect(within(alice!).getByTestId("collaborator-muted")).toBeDefined();
    expect(within(bob!).getByTestId("collaborator-speaking")).toBeDefined();
    await user.click(bob!);
    expect(intents).toEqual([
      { userToFollow: { socketId: socket("bob"), username: "Bob" }, action: "FOLLOW" },
    ]);
  });

  test("the host's currentUserControls go below the list, told it is not a phone", async () => {
    const surfaces: boolean[] = [];
    const { api } = await mountEditor({
      currentUserControls: (isMobile: boolean) => {
        surfaces.push(isMobile);
        return <button type="button">Spotlight me</button>;
      },
    });
    await join(api, { me: { username: "Me", isCurrentUser: true }, alice: { username: "Alice" } });
    expect(screen.queryByRole("button", { name: "Spotlight me" })).toBeNull();
    await user.click(screen.getByTestId("user-list-trigger"));
    await settle();
    const menu = screen.getByTestId("user-list-menu");
    expect(within(menu).getByRole("button", { name: "Spotlight me" })).toBeDefined();
    expect(within(menu).getByRole("separator")).toBeDefined();
    expect(surfaces.every((isMobile) => !isMobile)).toBe(true);
  });

  test("on a phone, the collaborators are in the main menu", async () => {
    const { api } = await mountEditor({
      UIOptions: { getFormFactor: () => "phone" },
      currentUserControls: (isMobile: boolean) => (
        <button type="button">{isMobile ? "Phone controls" : "Desktop controls"}</button>
      ),
    });
    await join(api, { me: { username: "Me", isCurrentUser: true }, alice: { username: "Alice" } });
    expect(screen.queryByTestId("user-list")).toBeNull();
    await user.click(screen.getByTestId("main-menu-trigger"));
    await settle();
    const list = screen.getByTestId("user-list-mobile");
    expect(
      within(list)
        .getAllByTestId("collaborator-avatar")
        .map((avatar) => avatar.getAttribute("aria-label")),
    ).toEqual(["Me", "Alice"]);
    expect(screen.getByText("Collaborators")).toBeDefined();
    expect(within(list).getByRole("button", { name: "Phone controls" })).toBeDefined();
  });
});

describe("the viewport status frame", () => {
  test("frames the canvas in its colour, with a badge that closes", async () => {
    let closed = 0;
    let clicked = 0;
    await mountEditor({
      viewportStatusFrame: {
        border: "rgb(255, 0, 0)",
        label: {
          label: "Following Alice",
          onClose: () => closed++,
          onClick: () => clicked++,
        },
      },
    });
    const border = screen.getByTestId("viewport-status-border");
    expect(border.style.borderColor).toBe("rgb(255, 0, 0)");
    const badge = screen.getByTestId("viewport-status-badge");
    expect(badge.getAttribute("role")).toBe("status");
    expect(badge.textContent).toContain("Following Alice");
    await user.click(screen.getByRole("button", { name: "Following Alice" }));
    expect(clicked).toBe(1);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(closed).toBe(1);
  });

  test("no frame and no badge without one, and a badge alone without a border", async () => {
    await mountEditor({ viewportStatusFrame: { border: false, label: { label: "Presenting" } } });
    expect(screen.queryByTestId("viewport-status-border")).toBeNull();
    expect(screen.getByTestId("viewport-status-badge").textContent).toBe("Presenting");
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  test("on a phone the badge is at the top", async () => {
    await mountEditor({
      UIOptions: { getFormFactor: () => "phone" },
      viewportStatusFrame: { border: "red", label: { label: "Following Alice" } },
    });
    expect(screen.getByTestId("viewport-status-badge").textContent).toContain("Following Alice");
    expect(screen.getByTestId("viewport-status-border")).toBeDefined();
  });
});

describe("LiveCollaborationTrigger", () => {
  test("opens the app's share dialog and counts the collaborators", async () => {
    let opened = 0;
    const { api } = await mountEditor({
      renderTopRightUI: () => (
        <LiveCollaborationTrigger isCollaborating={false} onSelect={() => opened++} />
      ),
    });
    const trigger = screen.getByTestId("collab-button");
    expect(trigger.getAttribute("title")).toBe("Live collaboration...");
    expect(trigger.hasAttribute("data-active")).toBe(false);
    expect(screen.queryByTestId("collab-count")).toBeNull();
    await user.click(trigger);
    expect(opened).toBe(1);
    await join(api, { alice: { username: "Alice" }, bob: { username: "Bob" } });
    expect(screen.getByTestId("collab-count").textContent).toBe("2");
  });

  test("is green while collaborating", async () => {
    await mountEditor({
      renderTopRightUI: () => <LiveCollaborationTrigger isCollaborating onSelect={() => {}} />,
    });
    expect(screen.getByTestId("collab-button").hasAttribute("data-active")).toBe(true);
  });

  test("is a main menu entry too", async () => {
    let opened = 0;
    await mountEditor({}, () => (
      <MainMenu>
        <MainMenu.DefaultItems.LiveCollaborationTrigger isCollaborating onSelect={() => opened++} />
      </MainMenu>
    ));
    await user.click(screen.getByTestId("main-menu-trigger"));
    await settle();
    const item = screen.getByRole("menuitem", { name: "Live collaboration..." });
    expect(item.hasAttribute("data-active")).toBe(true);
    await user.click(item);
    expect(opened).toBe(1);
  });
});

describe("isCollaborating", () => {
  test("gives the laser a button beside the toolbar, which the extra tools then leave alone", async () => {
    const { api } = await mountEditor({ isCollaborating: true });
    const laser = screen.getByTestId("collab-laser");
    expect(laser.getAttribute("aria-pressed")).toBe("false");
    await user.click(laser);
    await settle();
    expect(api.getAppState().activeTool.type).toBe("laser");
    expect(laser.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("toolbar-extra-tools").hasAttribute("data-active")).toBe(false);
  });

  test("without it, no such button, and the extra tools show the laser", async () => {
    const { api } = await mountEditor();
    expect(screen.queryByTestId("collab-laser")).toBeNull();
    api.setActiveTool({ type: "laser" });
    await settle();
    expect(screen.getByTestId("toolbar-extra-tools").hasAttribute("data-active")).toBe(true);
  });
});

describe("the collaboration props", () => {
  test("onPointerUpdate and onScrollChange are called as the pointer and the viewport move", async () => {
    const pointers: PointerUpdatePayload[] = [];
    const scrolls: number[][] = [];
    const { api, region: editor } = await mountEditor({
      onPointerUpdate: (payload) => pointers.push(payload),
      onScrollChange: (x, y, zoom) => scrolls.push([x, y, zoom.value]),
    });
    pointer(canvas(editor), "pointermove", 200, 150);
    expect(pointers.at(-1)?.pointer).toEqual({ x: 200, y: 150, tool: "pointer" });
    expect(pointers.at(-1)?.button).toBe("up");
    api.updateScene({ appState: { scrollX: 30, scrollY: 40 } });
    expect(scrolls.at(-1)).toEqual([30, 40, 1]);
  });

  test("userToFollow follows the host's prop as it changes", async () => {
    const [followed, setFollowed] = createSignal<UserToFollow | null>(null);
    const intents: OnUserFollowedPayload[] = [];
    const { api } = await mountEditor({
      get userToFollow() {
        return followed();
      },
      onUserFollow: (payload) => intents.push(payload),
    });
    await join(api, {
      alice: { socketId: socket("alice"), username: "Alice" },
      bob: { socketId: socket("bob"), username: "Bob" },
    });
    expect(screen.getByRole("button", { name: "Bob" }).getAttribute("aria-pressed")).toBe("false");
    setFollowed({ socketId: socket("bob"), username: "Bob" });
    await settle();
    expect(screen.getByRole("button", { name: "Bob" }).getAttribute("aria-pressed")).toBe("true");
    // the editor's own requests read it too: a wheel takes the view over
    region().dispatchEvent(
      new WheelEvent("wheel", { deltaY: 10, bubbles: true, cancelable: true }),
    );
    expect(intents).toEqual([
      { userToFollow: { socketId: socket("bob"), username: "Bob" }, action: "UNFOLLOW" },
    ]);
  });
});
