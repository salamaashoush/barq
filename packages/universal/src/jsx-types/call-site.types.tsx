/**
 * A call site under `jsxImportSource: "@barqjs/universal"` writes values where
 * the component's body reads Cells, as it does under `@barqjs/web`.
 */

import { For, Show, createSignal } from "@barqjs/core";
import type { Accessor } from "@barqjs/core";

const [players] = createSignal(["salama", "acme"]);
const [paused] = createSignal(false);

export const flow = (
  <stage>
    <Show when={paused()}>
      <label text="paused" />
    </Show>
    <For each={players()}>
      {(name) => {
        const inferred: string = name;
        return <sprite name={inferred} />;
      }}
    </For>
    <For each={players()} keyed={false}>
      {(name, index) => {
        const item: Accessor<string> = name;
        const at: number = index;
        return <sprite name={item()} at={at} />;
      }}
    </For>
  </stage>
);

function Badge(props: { label: Accessor<string>; count?: Accessor<number> }) {
  return <badge label={props.label()} count={props.count?.()} />;
}

export const values = <Badge label="salama" count={3} />;
export const accessors = <Badge label={() => "salama"} />;

// @ts-expect-error `label` is required.
export const missing = <Badge count={1} />;

// @ts-expect-error `label` is a string.
export const wrong = <Badge label={1} />;
