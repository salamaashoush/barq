import { For } from "@barqjs/core";

import { useOrrery } from "./orrery.ts";
import { Planet } from "./Planet.tsx";

/**
 * Names no element, so the compiler cannot tell which renderer `For` is for:
 * it is the scene's at run time, because this component runs inside one.
 */
export function Planets() {
  const orrery = useOrrery();
  return <For each={orrery.planets()}>{(planet) => <Planet planet={planet} />}</For>;
}
