import { afterEach, describe, expect, jest, test } from "bun:test";
import { flush } from "@barqjs/core";
import { cleanup, render } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "./avatar.tsx";

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

const slot = (name: string): HTMLElement | null => document.querySelector(`[data-slot="${name}"]`);

describe("Avatar", () => {
  test("the badge sits at the end corner, whichever side that is", () => {
    render(() => (
      <Avatar>
        <AvatarFallback>SA</AvatarFallback>
        <AvatarBadge />
      </Avatar>
    ));
    const rules = rulesFor(slot("avatar-badge")?.className ?? "");
    expect(rules).toContain("inset-inline-end: 0px");
    expect(rules).not.toContain("{right:");
  });

  test("a delayed fallback stays out until the delay has passed", () => {
    jest.useFakeTimers();
    render(() => (
      <Avatar>
        <AvatarImage src="/salama.png" alt="" />
        <AvatarFallback delayMs={600}>SA</AvatarFallback>
      </Avatar>
    ));
    expect(slot("avatar-fallback")).toBeNull();

    jest.advanceTimersByTime(599);
    flush();
    expect(slot("avatar-fallback")).toBeNull();

    jest.advanceTimersByTime(1);
    flush();
    expect(slot("avatar-fallback")?.textContent).toBe("SA");
  });

  test("without a delay the fallback is there from the first paint", () => {
    render(() => (
      <Avatar>
        <AvatarFallback>SA</AvatarFallback>
      </Avatar>
    ));
    expect(slot("avatar-fallback")?.textContent).toBe("SA");
  });

  test("the image takes what an image takes", () => {
    render(() => (
      <Avatar>
        <AvatarImage
          src="https://example.com/salama.png"
          alt="salama"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          loading="lazy"
        />
      </Avatar>
    ));
    const image = slot("avatar-image") as HTMLImageElement;
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(image.getAttribute("crossorigin")).toBe("anonymous");
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.alt).toBe("salama");
  });
});
