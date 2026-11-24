/**
 * A component's props, on both sides of the call.
 *
 * A component declares `props: P` and its body reads every prop as the value,
 * `children` that declares parameters is called with them, and `cells(props)`
 * is the record of Cells for code that takes `Incoming<P>`. `attribute-types.test.ts` typechecks this
 * directory: every positive compiles and every `@ts-expect-error` fires.
 */

import { cells, createComponent, createContext, merge, omit, provide } from "@barqjs/core";
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

interface ListProps<T> {
  items: T[];
  children: (item: T, index: number) => Child;
}

/** A children function that declares a parameter is called with it. */
function List<T>(props: ListProps<T>) {
  assertType<Equal<typeof props.children, (item: T, index: number) => Child>>();
  return <ul>{props.items.map((item, index) => props.children(item, index))}</ul>;
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

interface SlotProps {
  value: Row;
  children: Child | ((row: Row) => Child);
}

/** Content or a callback: the callback keeps its parameter, the content is read like any prop. */
function Slot(props: SlotProps) {
  const children = props.children;
  assertType<Equal<typeof children, Child | ((row: Row) => Child)>>();
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

export interface MenuProps<T> {
  items?: T[];
  label?: string;
  children?: Child | ((item: T) => Child);
}

/** A generic wrapper forwards its props, callback children included, to the generic it wraps. */
function Menu<T>(props: MenuProps<T>) {
  return <ul aria-label={props.label} />;
}

export function MenuWrapper<T>(props: MenuProps<T>) {
  return <Menu<T> {...props} label="wrapped" />;
}

export interface OptionalChildren {
  children?: Child;
}

export interface RowChildren {
  children?: (row: Row) => Child;
}

/** Ordinary children stay an accessor, and an optional callback stays optional. */
export function ChildrenStayReadable(
  props: Incoming<OptionalChildren>,
  optional: Incoming<RowChildren>,
): void {
  assertType<Equal<typeof props.children, Accessor<Child | undefined> | undefined>>();
  assertType<Equal<typeof optional.children, ((row: Row) => Child) | undefined>>();
  // @ts-expect-error content is read with no arguments
  props.children?.(rows[0]);
}

interface ButtonProps {
  variant?: "primary" | "danger";
  children?: Child;
}

function Button(props: ButtonProps) {
  return <button type="button">{props.children}</button>;
}

/** `ComponentProps` is what the body receives, for a component and for a tag. */
export function Fancy(props: ComponentProps<typeof Button>) {
  assertType<Equal<typeof props.variant, "primary" | "danger" | undefined>>();
  return <Button {...props} />;
}

assertType<Equal<ComponentProps<"a">, JSX.IntrinsicElements["a"]>>();

export interface TagProps {
  text: string;
  tone?: "info" | "warn";
}

function useTone(props: Incoming<TagProps>): Accessor<string> {
  return () => `${props.tone?.() ?? "info"}:${props.text()}`;
}

/** Declared props are values in the body, and `cells` is the record a hook that takes Cells reads. */
export function Tag(props: TagProps) {
  assertType<Equal<typeof props.text, string>>();
  assertType<Equal<typeof props.tone, "info" | "warn" | undefined>>();
  const record = cells(props);
  assertType<Equal<typeof record.text, Accessor<string>>>();
  assertType<Equal<typeof record.tone, Accessor<"info" | "warn" | undefined> | undefined>>();
  // @ts-expect-error a value is not called
  props.text();
  // @ts-expect-error a Cell is not its value
  const wrong: string = record.text;
  void wrong;
  // @ts-expect-error a hook that takes Cells is given `cells(props)`
  useTone(props);
  const label = useTone(record);
  return <span class={props.tone}>{label()}</span>;
}

/** `Component<P>` hands the body values and `cells` the Accessors; the call site writes values. */
const Label: Component<TagProps> = (props) => {
  assertType<Equal<typeof props.text, string>>();
  assertType<Equal<typeof props.tone, "info" | "warn" | undefined>>();
  const record = cells(props);
  assertType<Equal<typeof record.text, Accessor<string>>>();
  // @ts-expect-error a value is not called
  props.text();
  // @ts-expect-error a Cell is read by calling it
  const wrong: string = cells(props).text;
  void wrong;
  return <span class={props.tone}>{props.text}</span>;
};

interface DividerProps {
  inset?: boolean;
}

const Divider: VoidComponent<DividerProps> = (props) => (
  <hr class={props.inset ? "inset" : undefined} />
);

interface CardProps {
  title: string;
}

const Card: ParentComponent<CardProps> = (props) => (
  <section>
    <h2>{props.title}</h2>
    {props.children}
  </section>
);

interface EachProps {
  rows: Row[];
}

const Each: FlowComponent<EachProps, (row: Row) => Child> = (props) => (
  <ul>{props.rows.map((row) => props.children(row))}</ul>
);

/** Bare `ParentProps` is children and nothing else. */
function Group(props: ParentProps) {
  return <div>{props.children}</div>;
}

interface RuleProps {
  label: string;
}

function Rule(props: VoidProps<RuleProps>) {
  return <hr aria-label={props.label} />;
}

interface FrameProps {
  tone: "info" | "warn";
}

function Frame(props: FlowProps<FrameProps>) {
  return <div class={props.tone}>{props.children}</div>;
}

export const helpersAtTheCallSite = (
  <Group>
    <Label text="plain value" tone="info" />
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
    {/* @ts-expect-error an accessor is not the value a prop declares */}
    <Label text={() => "an accessor"} />
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
export function ThemeProvider(props: OptionalChildren): JSX.Element {
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

interface Defaults {
  variant: "primary";
  size: number;
}

declare const defaults: Defaults;
interface Given {
  variant?: "primary" | "danger";
  label: string;
  size?: number | undefined;
}

declare const given: Given;
interface Extra {
  extra: boolean;
}

declare const maybe: Extra | undefined;

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

export interface OmitSubject {
  a: string;
  b?: number;
  c: boolean;
}

export function OmitIsExact(props: Incoming<OmitSubject>): void {
  const rest = omit(props, "a");
  assertType<Equal<keyof typeof rest, "b" | "c">>();
  const others = omit(props, "a", "b");
  assertType<Equal<keyof typeof others, "c">>();
  // @ts-expect-error `a` was omitted
  void rest.a;
  // @ts-expect-error `d` is not a prop
  omit(props, "d");
}

interface UploadsProps {
  upload: () => Promise<string>;
  label: string;
}

/** From code the compiler does not see, a component is handed the record of Cells it reads. */
function Uploads(props: UploadsProps) {
  return <i>{props.label}</i>;
}

export function uploadsFromTs(): void {
  createComponent(Uploads, { upload: () => () => Promise.resolve("x"), label: () => "files" });
  // @ts-expect-error a record of values would have its callback called by the read
  createComponent(Uploads, { upload: () => Promise.resolve("x"), label: () => "files" });
}
