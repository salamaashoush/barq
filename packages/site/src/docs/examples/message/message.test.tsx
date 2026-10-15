import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import MessageActionsDemo from "./message-actions.tsx";
import MessageDemo from "./message-demo.tsx";
import MessageGroupDemo from "./message-group.tsx";

const aligns = (): (string | null)[] =>
  [...document.querySelectorAll('[data-slot="message"]')].map((message) =>
    message.getAttribute("data-align"),
  );

describe("the message examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("message")).toEqual([]);
  });

  test("the conversation alternates sides and ends on a typing status", () => {
    render(() => <MessageDemo />);
    expect(aligns()).toEqual(["end", "start", "end", "start"]);
    expect(screen.getByRole("status").textContent).toBe("Omar is typing...");
    expect(screen.getByRole("img", { name: "Reactions: thumbs up" })).toBeTruthy();
  });

  test("a group keeps an empty avatar on the earlier message", () => {
    render(() => <MessageGroupDemo />);
    const avatars = [...document.querySelectorAll('[data-slot="message-avatar"]')];
    expect(avatars).toHaveLength(2);
    expect(avatars[0]?.textContent).toBe("");
    expect(avatars[1]?.textContent).toBe("MK");
  });

  test("each footer action is named", () => {
    render(() => <MessageActionsDemo />);
    for (const name of ["Copy", "Like", "Dislike", "Retry"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });
});
