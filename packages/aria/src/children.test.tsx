/**
 * A child that MOVES stays a hole, however many siblings it has.
 *
 * Found in `@barqjs/ui`'s gallery, on a copy button that never said "Copied".
 * The rule the compiler broke is `insert`'s: an array holding a FUNCTION is one
 * live hole, and a value left bare in that array is spent once. A component's
 * children go into a Block when any of them builds DOM, and `buildChild` runs a
 * Block UNTRACKED on purpose — a component's construction must not be a
 * dependency of the hole that places it — so the per-element thunk is the only
 * thing keeping a read alive in there. Nothing wrapped them, so one child that
 * built DOM froze every other child beside it.
 *
 * These are runtime tests rather than codegen ones because that is the property:
 * `packages/compiler-rs/src/passes/shape.rs` pins the emitted shape, and this
 * pins what the shape has to DO. Every case below passed as markup on first
 * render and the failures were all in the second assertion.
 */

import { describe, expect, test } from "bun:test";
import { flush, signal, type Child, type Incoming } from "@barqjs/core";
import { render, screen } from "@barqjs/testing";

function Box(props: Incoming<{ children?: Child }>) {
  return <div data-testid="box">{props.children}</div>;
}

describe("a reactive read among a component's children", () => {
  test("moves when it is the only child", () => {
    const on = signal(false);
    render(() => <Box>{on() ? "yes" : "no"}</Box>);
    expect(screen.getByTestId("box").textContent).toBe("no");
    on.set(true);
    flush();
    expect(screen.getByTestId("box").textContent).toBe("yes");
  });

  test("moves beside another reactive read", () => {
    const on = signal(false);
    render(() => (
      <Box>
        {on() ? "yes" : "no"}
        {on() ? "!" : "?"}
      </Box>
    ));
    expect(screen.getByTestId("box").textContent).toBe("no?");
    on.set(true);
    flush();
    expect(screen.getByTestId("box").textContent).toBe("yes!");
  });

  test("moves beside a plain element", () => {
    // The common shape, and the one that was broken: an icon beside a label.
    const on = signal(false);
    render(() => (
      <Box>
        <i data-testid="icon" />
        {on() ? "yes" : "no"}
      </Box>
    ));
    expect(screen.getByTestId("box").textContent).toBe("no");
    on.set(true);
    flush();
    expect(screen.getByTestId("box").textContent).toBe("yes");
    expect(screen.queryByTestId("icon"), "the element beside it was dropped").not.toBeNull();
  });

  test("moves beside a choice between two elements", () => {
    const on = signal(false);
    render(() => (
      <Box>
        {on() ? <i data-testid="yes" /> : <i data-testid="no" />}
        {on() ? "Y" : "N"}
      </Box>
    ));
    expect(screen.getByTestId("box").textContent).toBe("N");
    on.set(true);
    flush();
    expect(screen.getByTestId("box").textContent).toBe("Y");
  });
});

describe("a choice between two elements among children", () => {
  test("swaps when it is the only child", () => {
    const on = signal(false);
    render(() => <Box>{on() ? <i data-testid="yes" /> : <i data-testid="no" />}</Box>);
    expect(screen.queryByTestId("no")).not.toBeNull();
    on.set(true);
    flush();
    expect(screen.queryByTestId("yes"), "the true branch never arrived").not.toBeNull();
    expect(screen.queryByTestId("no"), "the false branch was left behind").toBeNull();
  });

  test("swaps beside another child", () => {
    const on = signal(false);
    render(() => (
      <Box>
        {on() ? <i data-testid="yes" /> : <i data-testid="no" />}
        <span>tail</span>
      </Box>
    ));
    expect(screen.queryByTestId("no")).not.toBeNull();
    on.set(true);
    flush();
    expect(screen.queryByTestId("yes"), "the true branch never arrived").not.toBeNull();
    expect(screen.queryByTestId("no"), "the false branch was left behind").toBeNull();
  });

  test("swaps inside an intrinsic element, which always worked", () => {
    const on = signal(false);
    render(() => (
      <div data-testid="host">{on() ? <i data-testid="yes" /> : <i data-testid="no" />}</div>
    ));
    on.set(true);
    flush();
    expect(screen.queryByTestId("yes")).not.toBeNull();
    expect(screen.queryByTestId("no")).toBeNull();
  });
});
