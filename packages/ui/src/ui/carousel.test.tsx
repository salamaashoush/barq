import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, tick, user } from "@barqjs/testing";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "./carousel.tsx";

afterEach(cleanup);

function Three(props: {
  orientation?: "horizontal" | "vertical";
  setApi?: (api: CarouselApi) => void;
}) {
  return (
    <Carousel orientation={props.orientation} setApi={props.setApi}>
      <CarouselContent>
        <CarouselItem>One</CarouselItem>
        <CarouselItem>Two</CarouselItem>
        <CarouselItem>Three</CarouselItem>
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}

const at = (slot: string): HTMLElement | null => document.querySelector(`[data-slot="${slot}"]`);

describe("Carousel", () => {
  test("it announces itself as a carousel, not as a region of unknown purpose", () => {
    render(() => <Three />);
    const region = at("carousel");
    expect(region?.getAttribute("role")).toBe("region");
    expect(region?.getAttribute("aria-roledescription")).toBe("carousel");
  });

  test("each slide says it is one", () => {
    render(() => <Three />);
    const slides = [...document.querySelectorAll('[data-slot="carousel-item"]')];
    expect(slides).toHaveLength(3);
    expect(slides[0]?.getAttribute("role")).toBe("group");
    expect(slides[0]?.getAttribute("aria-roledescription")).toBe("slide");
  });

  test("the viewport clips and the track moves, which is two elements", () => {
    // embla measures the root it is given and translates that root's FIRST
    // CHILD, so handing it the flex row makes the row its own viewport and
    // nothing ever moves.
    render(() => <Three />);
    const clip = at("carousel-viewport");
    expect(clip).not.toBeNull();
    expect(clip?.firstElementChild?.getAttribute("data-slot")).toBe("carousel-content");
  });

  test("the buttons name themselves for a screen reader", () => {
    render(() => <Three />);
    expect(at("carousel-previous")?.textContent).toContain("Previous slide");
    expect(at("carousel-next")?.textContent).toContain("Next slide");
  });

  test("at the start there is nothing behind, so back is disabled", () => {
    render(() => <Three />);
    expect(at("carousel-previous")?.hasAttribute("disabled")).toBe(true);
  });

  test("the orientation is an attribute, because the rules select on it", () => {
    render(() => <Three orientation="vertical" />);
    expect(at("carousel")?.getAttribute("data-orientation")).toBe("vertical");
    expect(at("carousel-content")?.getAttribute("data-orientation")).toBe("vertical");
  });

  test("a vertical carousel lays its track out as a column", () => {
    render(() => <Three orientation="vertical" />);
    const horizontal = at("carousel-content")?.className;
    cleanup();
    render(() => <Three />);
    expect(at("carousel-content")?.className).not.toBe(horizontal);
  });

  test("the api reaches the caller, so a page can drive it", async () => {
    const seen: CarouselApi[] = [];
    render(() => <Three setApi={(api) => seen.push(api)} />);
    // On a microtask: a ref fires before the track's children exist, so the
    // instance is built once the tree has settled and the slides are in it.
    await tick();
    expect(seen).toHaveLength(1);
    expect(typeof seen[0]?.scrollNext).toBe("function");
    expect(seen[0]?.slideNodes()).toHaveLength(3);
  });

  test("the arrow keys move it, and only the ones for its axis", async () => {
    const seen: CarouselApi[] = [];
    render(() => <Three setApi={(api) => seen.push(api)} />);
    await tick();
    const api = seen[0];
    let moved = 0;
    api?.on("select", () => moved++);

    const region = at("carousel") as HTMLElement;
    // happy-dom measures nothing, so embla has one snap point and cannot
    // actually move; what this pins is which keys are TAKEN.
    const down = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    region.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);

    const right = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    region.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(true);
  });

  test("a vertical carousel takes the up and down keys instead", () => {
    render(() => <Three orientation="vertical" />);
    const region = at("carousel") as HTMLElement;
    const right = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    region.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(false);

    const down = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    region.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  test("pressing next asks the carousel to move", async () => {
    // `isDisabled` is forced because happy-dom measures nothing, so embla has
    // one snap point and would disable the button. What is under test is the
    // wiring from the press to the instance.
    const seen: CarouselApi[] = [];
    render(() => (
      <Carousel setApi={(api) => seen.push(api)}>
        <CarouselContent>
          <CarouselItem>One</CarouselItem>
          <CarouselItem>Two</CarouselItem>
        </CarouselContent>
        <CarouselNext isDisabled={false} />
      </Carousel>
    ));
    await tick();
    let asked = 0;
    const api = seen[0] as CarouselApi;
    const original = api.scrollNext.bind(api);
    Object.defineProperty(api, "scrollNext", {
      value: () => {
        asked++;
        original();
      },
    });
    await user.click(at("carousel-next") as HTMLElement);
    expect(asked).toBe(1);
  });

  test("leaving destroys the instance, which holds listeners on the window", async () => {
    const seen: CarouselApi[] = [];
    render(() => <Three setApi={(api) => seen.push(api)} />);
    await tick();
    const api = seen[0] as CarouselApi;
    let destroyed = 0;
    const original = api.destroy.bind(api);
    Object.defineProperty(api, "destroy", {
      value: () => {
        destroyed++;
        original();
      },
    });
    cleanup();
    expect(destroyed).toBe(1);
  });

  test("a piece outside a carousel says what is wrong", () => {
    expect(() => render(() => <CarouselItem>loose</CarouselItem>)).toThrow("inside a <Carousel>");
  });
});
