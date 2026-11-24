/**
 * A session wired into `<DiagramEditor>` from its `api`, as a barq page
 * does: the session's state in a signal, `userToFollow` and
 * `viewportStatusFrame` passed back as props. Alice is a headless editor in
 * the same Yjs room.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { createSignal } from "@barqjs/core";
import { render, screen, user, within } from "@barqjs/testing";
import * as Y from "yjs";

import { DiagramEditor } from "../index.ts";
import { unmountEditors } from "../editor/test-editor.ts";
import { settle, setupUITests } from "../ui/test-ui.tsx";
import { createCollaboration } from "./collaboration.ts";
import { joinRoom, newRoom, pointer, rect, until, type Peer } from "./test-collab.ts";
import { Room } from "./test-yjs.ts";
import { createYjsTransport } from "./yjs.ts";

import type { DiagramEditorApi } from "../index.ts";
import type { Collaboration, CollaborationState } from "./collaboration.ts";

setupUITests();

const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
  unmountEditors();
});

describe("a session in <DiagramEditor>", () => {
  test("shows who is in the room, follows from the user list, and stops from the frame", async () => {
    const room = await newRoom();
    const yRoom = new Room();
    const aliceDoc = new Y.Doc();
    const alice: Peer = await joinRoom(
      room,
      createYjsTransport({ doc: aliceDoc, awareness: yRoom.add(aliceDoc) }),
      { username: "Alice", existingRoom: false },
      [rect("r1", 10)],
    );
    stops.push(() => alice.session.stop());

    const bobDoc = new Y.Doc();
    const transport = createYjsTransport({ doc: bobDoc, awareness: yRoom.add(bobDoc) });
    const [state, setState] = createSignal<CollaborationState | null>(null);
    let api: DiagramEditorApi | undefined;
    let session: Collaboration | undefined;
    render(() => (
      <DiagramEditor
        height={800}
        api={(given) => {
          api = given;
          session = createCollaboration({
            api: given,
            transport,
            ...room,
            username: "Bob",
            existingRoom: true,
            idleDetection: false,
          });
          session.subscribe(setState);
        }}
        isCollaborating={state() !== null}
        userToFollow={state()?.userToFollow ?? null}
        viewportStatusFrame={state()?.viewportStatusFrame ?? null}
      />
    ));
    await settle();
    stops.push(() => session!.stop());
    await session!.ready;
    await until(() => api!.getSceneElements().some((each) => each.id === "r1"), "the scene");

    pointer(alice, "pointermove", 300, 300);
    await until(() => screen.queryByRole("button", { name: "Alice" }) !== null, "Alice's avatar");
    // isCollaborating from the session: the laser has its own button
    expect(screen.getByTestId("collab-laser")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Alice" }));
    await until(() => state()?.userToFollow?.username === "Alice", "following Alice");
    await settle();
    expect(
      within(screen.getByTestId("viewport-status-badge")).getByText("Following Alice"),
    ).toBeDefined();
    expect(screen.getByTestId("viewport-status-border")).toBeDefined();
    await until(() => alice.session.getState().followedBy.size === 1, "Alice followed");

    await user.click(screen.getByTestId("viewport-status-close"));
    await until(() => state()?.userToFollow === null, "the follow stopped");
    await settle();
    expect(screen.queryByTestId("viewport-status-badge")).toBeNull();
    await until(() => alice.session.getState().followedBy.size === 0, "Alice unfollowed");
  });
});
