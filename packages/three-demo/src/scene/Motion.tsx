import { Show } from "@barqjs/core";
import { useFrame } from "@barqjs/three";

import { useOrrery } from "./orrery.ts";

/** Advances the clock every frame. Mounted only while playing, so a paused scene draws on demand alone. */
function Clock() {
  const orrery = useOrrery();
  useFrame((_, delta) => {
    // The first delta after a pause spans the whole pause.
    orrery.setDays(orrery.days() + Math.min(delta, 0.1) * orrery.speed());
  });
  return null;
}

export function Motion() {
  const orrery = useOrrery();
  return (
    <Show when={orrery.playing()}>
      <Clock />
    </Show>
  );
}
