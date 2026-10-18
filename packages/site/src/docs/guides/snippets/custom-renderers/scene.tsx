/** @jsxImportSource @barqjs/universal */
import { For, Show, createSignal } from "@barqjs/core";

export const [players, setPlayers] = createSignal(["salama", "acme"]);
export const [paused, setPaused] = createSignal(false);

export default function Scene() {
  return (
    <stage>
      <Show when={paused()}>
        <label text="paused" />
      </Show>
      <For each={players()}>{(name) => <sprite name={name} />}</For>
    </stage>
  );
}
