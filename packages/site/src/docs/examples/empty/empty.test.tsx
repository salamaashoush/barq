import { describe, expect, test } from "bun:test";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import EmptyAvatarGroup from "./empty-avatar-group.tsx";
import EmptyDemo from "./empty-demo.tsx";
import EmptyInputGroup from "./empty-input-group.tsx";
import EmptyRtl from "./empty-rtl.tsx";

describe("the empty examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("empty")).toEqual([]);
  });

  test("the empty state holds its media, its two actions and a link", () => {
    render(() => <EmptyDemo />);
    const empty = document.querySelector<HTMLElement>('[data-slot="empty"]');
    expect(empty?.querySelector('[data-slot="empty-media"]')?.getAttribute("data-variant")).toBe(
      "icon",
    );
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Create Project",
      "Import Project",
    ]);
    const more = screen.getByRole("link", { name: "Learn More" });
    expect(more.getAttribute("data-variant")).toBe("link");
    expect(more.parentElement).toBe(empty);
  });

  test("the avatar group is three avatars inside the media", () => {
    render(() => <EmptyAvatarGroup />);
    const media = document.querySelector('[data-slot="empty-media"]');
    expect(media?.getAttribute("data-variant")).toBe("default");
    expect(media?.querySelectorAll('[data-slot="avatar"]')).toHaveLength(3);
  });

  test("the search inside the empty state takes what is typed", async () => {
    render(() => <EmptyInputGroup />);
    const input = screen.getByRole("textbox", { name: "Search pages" }) as HTMLInputElement;
    await user.type(input, "pricing");
    expect(input.value).toBe("pricing");
    expect(input.closest('[data-slot="empty-content"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: "Contact support" })).toBeTruthy();
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <EmptyRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="empty"]')).not.toBeNull();
  });
});
