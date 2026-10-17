/**
 * The flow components infer what their callbacks receive.
 *
 * What each callback is handed is decided at run time by `each`, `branch` and
 * `boundary`, and the types have to say the same thing: a row keyed by its item
 * gets the item and an index accessor, a row keyed by its index gets an item
 * accessor and a number, a row keyed by a function gets two accessors.
 *
 * `attribute-types.test.ts` typechecks this directory. A positive that stops
 * inferring fails its `Expect`, and a `@ts-expect-error` that stops firing
 * fails on its own.
 */

import {
  Errored,
  For,
  Loading,
  Match,
  Repeat,
  Show,
  Switch,
  createSignal,
  lazy,
} from "@barqjs/core";
import { Portal, dynamic } from "../index.ts";
import type { Accessor, Child, Incoming } from "@barqjs/core";
import { assertType } from "./assert.ts";
import type { Equal } from "./assert.ts";

interface Row {
  id: number;
  name: string;
}

const [rows] = createSignal<Row[]>([]);
const [user] = createSignal<Row | undefined>(undefined);
const [flag] = createSignal(false);
declare const content: Child;

export const forByItem = (
  <For each={rows()}>
    {(row, index) => {
      assertType<Equal<typeof row, Row>>();
      assertType<Equal<typeof index, Accessor<number>>>();
      return (
        <li>
          {index()}: {row.name}
        </li>
      );
    }}
  </For>
);

export const forByItemFromAnAccessor = (
  <For each={rows} keyed fallback="none">
    {(row) => {
      assertType<Equal<typeof row, Row>>();
      return <li>{row.name}</li>;
    }}
  </For>
);

export const forByIndex = (
  <For each={rows()} keyed={false}>
    {(row, index) => {
      assertType<Equal<typeof row, Accessor<Row>>>();
      assertType<Equal<typeof index, number>>();
      return (
        <li>
          {index}: {row().name}
        </li>
      );
    }}
  </For>
);

export const forByKey = (
  <For each={rows()} keyed={(row) => row.id}>
    {(row, index) => {
      assertType<Equal<typeof row, Accessor<Row>>>();
      assertType<Equal<typeof index, Accessor<number>>>();
      return (
        <li>
          {index()}: {row().name}
        </li>
      );
    }}
  </For>
);

/** The item type is `each`'s: a callback that annotates less of it does not narrow the row. */
export const forWithAnnotatedCallbacks = (
  <For each={rows} keyed={(row: { id: number }) => row.id}>
    {(row: () => { name: string }) => <li>{row().name}</li>}
  </For>
);

export const forRefusals = (
  <div>
    {/* @ts-expect-error a row keyed by its item is the item, not an accessor */}
    <For each={rows()}>{(row) => <li>{row().name}</li>}</For>
    <For each={rows()} keyed={false}>
      {/* @ts-expect-error a row keyed by its index is an accessor, not the item */}
      {(row) => <li>{row.id}</li>}
    </For>
    {/* @ts-expect-error `each` is a list */}
    <For each={42}>{(row) => <li>{String(row)}</li>}</For>
    <For each={rows()}>
      {/* @ts-expect-error a Row has no `title` */}
      {(row) => <li>{row.title}</li>}
    </For>
  </div>
);

export const showNarrows = (
  <Show when={user()} fallback={<p>nobody</p>}>
    {(found) => {
      assertType<Equal<typeof found, Accessor<Row>>>();
      return <b>{found().name}</b>;
    }}
  </Show>
);

export const showKeyed = (
  <Show when={user()} keyed>
    {(found) => {
      assertType<Equal<typeof found, Row>>();
      return <b>{found.name}</b>;
    }}
  </Show>
);

export const showContent = (
  <div>
    <Show when={flag()}>
      <b>static</b>
    </Show>
    <Show when={flag}>{content}</Show>
    <Show when={user()}>
      <b>one</b>
      <i>two</i>
    </Show>
    <Show when={user()}>{() => <b>lazy</b>}</Show>
  </div>
);

export const showRefusals = (
  <div>
    {/* @ts-expect-error the narrowed value is behind an accessor */}
    <Show when={user()}>{(found) => <b>{found.id}</b>}</Show>
    {/* @ts-expect-error `when` is required */}
    <Show>
      <b>never</b>
    </Show>
  </div>
);

export const switchAndMatch = (
  <Switch fallback={<p>neither</p>}>
    <Match when={user()}>
      {(found) => {
        assertType<Equal<typeof found, Accessor<Row>>>();
        return <b>{found().name}</b>;
      }}
    </Match>
    <Match when={user()} keyed>
      {(found) => {
        assertType<Equal<typeof found, Row>>();
        return <b>{found.name}</b>;
      }}
    </Match>
    <Match when={flag()}>plain</Match>
  </Switch>
);

export const repeat = (
  <Repeat count={3} from={1} fallback="none">
    {(index) => {
      assertType<Equal<typeof index, number>>();
      return <li>{index}</li>;
    }}
  </Repeat>
);

export const errored = (
  <Errored
    fallback={(error, reset) => {
      assertType<Equal<typeof error, Accessor<Error>>>();
      assertType<Equal<typeof reset, () => void>>();
      return (
        <button type="button" onClick={reset}>
          {error().message}
        </button>
      );
    }}
  >
    <p>content</p>
  </Errored>
);

export const erroredWithContent = (
  <Errored fallback={<p>failed</p>}>
    <p>content</p>
  </Errored>
);

export const loadingAndPortal = (
  <Loading fallback={<p>wait</p>} on={user()}>
    <Portal mount={document.body}>
      <p>elsewhere</p>
    </Portal>
    <Portal mount="#overlay">
      <p>by selector</p>
    </Portal>
  </Loading>
);

function Badge(props: Incoming<{ label: string; tone?: "info" | "warn" }>) {
  return <span class={props.tone?.()}>{props.label()}</span>;
}

declare const tag: "a" | "button";

const ChosenBadge = dynamic(() => Badge);
const ChosenLink = dynamic(() => "a");
const MaybeBadge = dynamic(() => (flag() ? Badge : undefined));
const EitherTag = dynamic(() => tag);

export const dynamicComponents = (
  <div>
    <ChosenBadge label="new" tone="warn" />
    <ChosenLink href="https://example.com">a link</ChosenLink>
    <MaybeBadge label="maybe" />
    <EitherTag class="either" />
  </div>
);

export const dynamicRefusals = (
  <div>
    {/* @ts-expect-error `label` is required by the component */}
    <ChosenBadge tone="info" />
    {/* @ts-expect-error `tone` is one of two words */}
    <ChosenBadge label="new" tone="loud" />
    {/* @ts-expect-error an `<a>` has no `colspan` */}
    <ChosenLink colspan={2} />
  </div>
);

const LazyBadge = lazy(() => Promise.resolve({ default: Badge }));
const LazyNamed = lazy(
  () => Promise.resolve({ Badge }),
  (module) => module.Badge,
);

export const lazyInfersProps = (
  <div>
    <LazyBadge label="default export" />
    <LazyNamed label="named export" tone="info" />
  </div>
);

export async function lazyKeepsItsProbes(): Promise<boolean> {
  await LazyBadge.preload();
  LazyBadge.ready();
  return LazyBadge.loaded();
}

export const lazyRefusals = (
  <div>
    {/* @ts-expect-error the loaded component requires `label` */}
    <LazyBadge />
    {/* @ts-expect-error the loaded component's `tone` is one of two words */}
    <LazyNamed label="x" tone="loud" />
  </div>
);
