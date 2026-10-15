import { describe, expect, test } from "bun:test";
import { createSignal, flush, type Child, type Incoming } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { Button } from "../ui/button.tsx";
import { TriggerPart, useTrigger, type TriggerPartProps } from "./trigger.tsx";

/** A trigger as every family writes one: the slot it offers, and the part. */
function Opener(props: Incoming<TriggerPartProps & { onOpen: () => void; isOpen: boolean }>) {
  return (
    <TriggerPart
      slot={{
        props: {
          "aria-haspopup": true,
          "aria-expanded": () => props.isOpen(),
          onPress: () => props.onOpen()(),
        },
      }}
      render={props.render?.()}
    >
      {props.children}
    </TriggerPart>
  );
}

/** Someone else's control: its own element, with what the trigger wants spread onto it. */
function Chip(props: Incoming<{ children?: Child }>) {
  const trigger = useTrigger();
  return (
    <button data-testid="chip" {...trigger.props} ref={trigger.ref}>
      {props.children}
    </button>
  );
}

function Fixture(props: Incoming<{ kind: "slot" | "element" | "component" }>) {
  const [open, setOpen] = createSignal(false);
  const onOpen = (): void => {
    setOpen(true);
  };
  if (props.kind() === "slot") {
    return (
      <Opener isOpen={open()} onOpen={onOpen}>
        <Button>Open</Button>
      </Opener>
    );
  }
  if (props.kind() === "element") {
    return (
      <Opener
        isOpen={open()}
        onOpen={onOpen}
        render={(trigger) => (
          <button {...trigger.props} ref={trigger.ref}>
            Open
          </button>
        )}
      />
    );
  }
  return (
    <Opener isOpen={open()} onOpen={onOpen}>
      <Chip>Open</Chip>
    </Opener>
  );
}

describe("TriggerPart", () => {
  for (const kind of ["slot", "element", "component"] as const) {
    test(`a ${kind} control is the trigger: it carries the ARIA and a press opens`, async () => {
      render(() => <Fixture kind={kind} />);
      const control = screen.getByRole("button", { name: "Open" });
      expect(control.getAttribute("aria-haspopup")).toBe("true");
      expect(control.getAttribute("aria-expanded")).toBe("false");

      await user.click(control);
      flush();
      expect(control.getAttribute("aria-expanded")).toBe("true");
    });

    test(`a ${kind} control opens from the keyboard`, async () => {
      render(() => <Fixture kind={kind} />);
      const control = screen.getByRole("button", { name: "Open" });
      control.focus();
      await user.keyboard("{Enter}");
      flush();
      expect(control.getAttribute("aria-expanded")).toBe("true");
    });
  }

  test("a rendered control is a real button and is handed the ref", () => {
    let seen: Element | null = null;
    render(() => (
      <TriggerPart
        slot={{
          props: {},
          ref: (element) => {
            seen = element;
          },
        }}
        render={(trigger) => (
          <button {...trigger.props} ref={trigger.ref}>
            Open
          </button>
        )}
      />
    ));
    const control = screen.getByRole("button", { name: "Open" });
    expect(control.getAttribute("type")).toBe("button");
    expect(seen === control).toBe(true);
  });

  test("a rendered control is named after the part, as upstream's own trigger element is", () => {
    render(() => (
      <TriggerPart
        name="dialog-trigger"
        slot={{ props: {} }}
        render={(trigger) => (
          <button {...trigger.props} ref={trigger.ref}>
            Open
          </button>
        )}
      />
    ));
    expect(screen.getByRole("button", { name: "Open" }).getAttribute("data-slot")).toBe(
      "dialog-trigger",
    );
  });

  test("a component written outside any trigger is still an ordinary button", () => {
    render(() => <Chip>Alone</Chip>);
    const control = screen.getByRole("button", { name: "Alone" });
    expect(control.getAttribute("type")).toBe("button");
    expect(control.hasAttribute("aria-haspopup")).toBe(false);
  });
});
