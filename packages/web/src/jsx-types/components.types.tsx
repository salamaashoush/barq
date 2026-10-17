/**
 * A component's props, on both sides of the call.
 *
 * The body reads every prop by calling it, `children` that declares parameters
 * is called with them, and the helper types say the same thing whichever one a
 * component is annotated with. `attribute-types.test.ts` typechecks this
 * directory: every positive compiles and every `@ts-expect-error` fires.
 */

import { createContext, merge, omit, provide } from "@barqjs/core";
import type {
  Accessor,
  Child,
  Component,
  FlowComponent,
  FlowProps,
  Incoming,
  ParentComponent,
  ParentProps,
  VoidComponent,
  VoidProps,
} from "@barqjs/core";
import type { ComponentProps, JSX } from "../index.ts";
import { assertType } from "./assert.ts";
import type { Equal } from "./assert.ts";

interface Row {
  id: number;
  name: string;
}

/** A children function that declares a parameter is called with it. */
function List<T>(props: Incoming<{ items: T[]; children: (item: T, index: number) => Child }>) {
  assertType<Equal<typeof props.children, (item: T, index: number) => Child>>();
  return <ul>{props.items().map((item, index) => props.children(item, index))}</ul>;
}

declare const rows: Row[];

export const listInfersItsItem = (
  <List items={rows}>
    {(row, index) => {
      assertType<Equal<typeof row, Row>>();
      assertType<Equal<typeof index, number>>();
      return <li>{row.name}</li>;
    }}
  </List>
);

/** Content or a callback: the callback keeps its parameter, the content is read like any prop. */
function Slot(props: Incoming<{ value: Row; children: Child | ((row: Row) => Child) }>) {
  const children = props.children;
  assertType<Equal<typeof children, Accessor<Child> | ((row: Row) => Child)>>();
  return <div>{typeof children === "function" ? null : children}</div>;
}

export const slotTakesEither = (
  <div>
    <Slot value={rows[0]}>
      {(row) => {
        assertType<Equal<typeof row, Row>>();
        return <b>{row.name}</b>;
      }}
    </Slot>
    <Slot value={rows[0]}>
      <b>static</b>
    </Slot>
  </div>
);

/** A generic wrapper forwards its props, callback children included, to the generic it wraps. */
function Menu<T>(
  props: Incoming<{ items?: T[]; label?: string; children?: Child | ((item: T) => Child) }>,
) {
  return <ul aria-label={props.label?.()} />;
}

export function MenuWrapper<T>(
  props: Incoming<{ items?: T[]; label?: string; children?: Child | ((item: T) => Child) }>,
) {
  return <Menu<T> {...props} label="wrapped" />;
}

/** Ordinary children stay an accessor, and an optional callback stays optional. */
export function ChildrenStayReadable(
  props: Incoming<{ children?: Child }>,
  optional: Incoming<{ children?: (row: Row) => Child }>,
): void {
  assertType<Equal<typeof props.children, Accessor<Child | undefined> | undefined>>();
  assertType<Equal<typeof optional.children, ((row: Row) => Child) | undefined>>();
  // @ts-expect-error content is read with no arguments
  props.children?.(rows[0]);
}

function Button(props: Incoming<{ variant?: "primary" | "danger"; children?: Child }>) {
  return <button type="button">{props.children}</button>;
}

/** `ComponentProps` is what the body receives, for a component and for a tag. */
export function Fancy(props: ComponentProps<typeof Button>) {
  assertType<Equal<typeof props.variant, Accessor<"primary" | "danger" | undefined> | undefined>>();
  return <Button {...props} />;
}

assertType<Equal<ComponentProps<"a">, JSX.IntrinsicElements["a"]>>();

/** `Component<P>` hands the body Cells; the call site writes values. */
const Label: Component<{ text: string; tone?: "info" | "warn" }> = (props) => {
  assertType<Equal<typeof props.text, Accessor<string>>>();
  // @ts-expect-error a prop is read by calling it
  const wrong: string = props.text;
  void wrong;
  return <span class={props.tone?.()}>{props.text()}</span>;
};

const Divider: VoidComponent<{ inset?: boolean }> = (props) => (
  <hr class={props.inset?.() ? "inset" : undefined} />
);

const Card: ParentComponent<{ title: string }> = (props) => (
  <section>
    <h2>{props.title()}</h2>
    {props.children}
  </section>
);

const Each: FlowComponent<{ rows: Row[] }, (row: Row) => Child> = (props) => (
  <ul>{props.rows().map((row) => props.children(row))}</ul>
);

/** Bare `ParentProps` is children and nothing else. */
function Group(props: ParentProps) {
  return <div>{props.children}</div>;
}

function Rule(props: VoidProps<{ label: string }>) {
  return <hr aria-label={props.label()} />;
}

function Frame(props: FlowProps<{ tone: "info" | "warn" }>) {
  return <div class={props.tone()}>{props.children}</div>;
}

export const helpersAtTheCallSite = (
  <Group>
    <Label text="plain value" tone="info" />
    <Label text={() => "an accessor"} />
    <Divider inset />
    <Card title="Titled">
      <p>content</p>
    </Card>
    <Each rows={rows}>{(row) => <li>{row.name}</li>}</Each>
    <Rule label="rule" />
    <Frame tone="warn">
      <p>framed</p>
    </Frame>
  </Group>
);

export const helperRefusals = (
  <Group>
    {/* @ts-expect-error `text` is required */}
    <Label tone="info" />
    {/* @ts-expect-error `tone` is one of two words */}
    <Label text="x" tone="loud" />
    <Divider>
      {/* @ts-expect-error a void component takes no children */}
      <p>no</p>
    </Divider>
    {/* @ts-expect-error a flow component must be given children */}
    <Frame tone="info" />
    <Each rows={rows}>
      {/* @ts-expect-error a flow component with a callback slot takes a callback */}
      <li>static</li>
    </Each>
  </Group>
);

const Theme = createContext<"light" | "dark">();

/** `provide` answers with what a component returns, whatever its block built. */
export function ThemeProvider(props: Incoming<{ children?: Child }>): JSX.Element {
  return provide(
    Theme,
    () => "dark" as const,
    () => props.children,
  );
}

export const providerIsAComponent = (
  <ThemeProvider>
    <p>themed</p>
  </ThemeProvider>
);

declare const defaults: { variant: "primary"; size: number };
declare const given: { variant?: "primary" | "danger"; label: string; size?: number | undefined };
declare const maybe: { extra: boolean } | undefined;

/** With `undefined` as a value, an optional later key leaves either source's answer. */
export function MergeKeepsUndefined(): void {
  const merged = merge(defaults, given);
  assertType<Equal<(typeof merged)["variant"], "primary" | "danger" | undefined>>();
  assertType<Equal<(typeof merged)["label"], string>>();
  const overridden = merge(given, defaults);
  assertType<Equal<(typeof overridden)["variant"], "primary">>();
  const one = merge(given);
  assertType<Equal<typeof one, typeof given>>();
  const withAbsent = merge(given, maybe);
  assertType<Equal<(typeof withAbsent)["extra"], boolean | undefined>>();
  const dynamic = merge(defaults, () => given);
  assertType<Equal<(typeof dynamic)["label"], string>>();
}

export function OmitIsExact(props: Incoming<{ a: string; b?: number; c: boolean }>): void {
  const rest = omit(props, "a");
  assertType<Equal<keyof typeof rest, "b" | "c">>();
  const others = omit(props, "a", "b");
  assertType<Equal<keyof typeof others, "c">>();
  // @ts-expect-error `a` was omitted
  void rest.a;
  // @ts-expect-error `d` is not a prop
  omit(props, "d");
}
