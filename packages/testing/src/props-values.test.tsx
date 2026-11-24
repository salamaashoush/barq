import { describe, expect, test } from "bun:test";

import { cells, createSignal, flush, type Incoming, type JSXElement } from "@barqjs/core";

import { render, screen } from "./index.ts";

interface LabelProps {
  text: string;
  tone?: string;
  id?: string;
}

function Label({ text, tone = "warm", ...rest }: LabelProps) {
  return (
    <span data-tone={tone} {...rest}>
      {text.toUpperCase()}
    </span>
  );
}

function Wrapper(props: LabelProps) {
  return <Label text={props.text} tone={props.tone} id={props.id} />;
}

interface NestedProps {
  user: NestedUser;
  items: string[];
}

interface NestedUser {
  name: string;
}

function Nested({ user: { name }, items: [first] }: NestedProps) {
  return (
    <p>
      {name}:{first}
    </p>
  );
}

interface TextProps {
  text: string;
}

function useLength(props: TextProps): () => number {
  return () => props.text.length;
}

function Counted(props: TextProps) {
  const length = useLength(props);
  return <b>{length()}</b>;
}

function useCells(props: Incoming<TextProps>): () => string {
  return () => props.text();
}

function Raw(props: TextProps) {
  const text = useCells(cells(props));
  return <u>{text()}</u>;
}

interface SlotProps {
  icon?: JSXElement;
  children?: JSXElement;
}

function Slot(props: SlotProps) {
  return (
    <div>
      {props.icon ? <i>{props.icon}</i> : null}
      {props.children}
    </div>
  );
}

interface PressProps {
  onPress?: (value: string) => void;
  label: string;
}

function Press(props: PressProps) {
  return (
    <button type="button" onClick={() => props.onPress?.(props.label)}>
      {props.label}
    </button>
  );
}

describe("props written as values", () => {
  test("a destructured prop follows the signal behind it", () => {
    const [text, setText] = createSignal("one");
    render(() => <Label text={text()} />);
    const span = screen.getByText("ONE");
    expect(span.getAttribute("data-tone")).toBe("warm");

    setText("two");
    flush();
    expect(span.textContent).toBe("TWO");
  });

  test("a default applies while the prop is undefined and yields when it is passed", () => {
    const [tone, setTone] = createSignal<string | undefined>(undefined);
    render(() => <Label text="x" tone={tone()} />);
    const span = screen.getByText("X");
    expect(span.getAttribute("data-tone")).toBe("warm");

    setTone("cool");
    flush();
    expect(span.getAttribute("data-tone")).toBe("cool");

    setTone(undefined);
    flush();
    expect(span.getAttribute("data-tone")).toBe("warm");
  });

  test("the rest of a pattern carries the props it did not name", () => {
    const [id, setId] = createSignal("a");
    render(() => <Label text="x" id={id()} />);
    const span = screen.getByText("X");
    expect(span.id).toBe("a");

    setId("b");
    flush();
    expect(span.id).toBe("b");
  });

  test("a prop handed on through a component stays live", () => {
    const [text, setText] = createSignal("one");
    const [tone, setTone] = createSignal<string | undefined>("cool");
    render(() => <Wrapper text={text()} tone={tone()} />);
    const span = screen.getByText("ONE");
    expect(span.getAttribute("data-tone")).toBe("cool");

    setText("two");
    setTone(undefined);
    flush();
    expect(span.textContent).toBe("TWO");
    expect(span.getAttribute("data-tone")).toBe("warm");
  });

  test("a nested pattern reads through the prop's value", () => {
    const [user, setUser] = createSignal({ name: "salama" });
    render(() => <Nested user={user()} items={["first", "second"]} />);
    expect(screen.getByText("salama:first")).toBeTruthy();

    setUser({ name: "ashoush" });
    flush();
    expect(screen.getByText("ashoush:first")).toBeTruthy();
  });

  test("props passed whole to a function read as values there", () => {
    const [text, setText] = createSignal("one");
    render(() => <Counted text={text()} />);
    expect(screen.getByText("3")).toBeTruthy();

    setText("three");
    flush();
    expect(screen.getByText("5")).toBeTruthy();
  });

  test("cells(props) is the record a hook that takes Cells reads", () => {
    const [text, setText] = createSignal("one");
    render(() => <Raw text={text()} />);
    expect(screen.getByText("one")).toBeTruthy();

    setText("two");
    flush();
    expect(screen.getByText("two")).toBeTruthy();
  });

  test("JSX passed as a prop is tested without being built and placed once", () => {
    let built = 0;
    function Icon() {
      built++;
      return <em>icon</em>;
    }
    render(() => (
      <Slot icon={<Icon />}>
        <span>body</span>
      </Slot>
    ));
    expect(screen.getByText("icon").parentElement?.tagName).toBe("I");
    expect(screen.getByText("body")).toBeTruthy();
    expect(built).toBe(1);
  });

  test("a prop left out reads undefined", () => {
    render(() => (
      <Slot>
        <span>body</span>
      </Slot>
    ));
    expect(document.querySelector("i")).toBeNull();
  });

  test("a function prop is called with its arguments", () => {
    const seen: string[] = [];
    render(() => <Press label="go" onPress={(value) => seen.push(value)} />);
    screen.getByText("go").click();
    expect(seen).toEqual(["go"]);
  });
});
