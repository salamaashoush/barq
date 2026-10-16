/**
 * `clientOnly`, `Hydration` and `NoHydration` at a call site: the wrapped
 * component's props, plus a `fallback`.
 */

import { Hydration, NoHydration, clientOnly } from "../index.ts";
import type { Incoming } from "../index.ts";

function Chart(props: Incoming<{ name: string; points?: number[] }>) {
  return <canvas data-name={props.name()} />;
}

const ChartOnly = clientOnly(() => Promise.resolve({ default: Chart }));
const Legend = clientOnly(() => Promise.resolve({ Legend: Chart, other: 1 }), {
  lazy: true,
  export: "Legend",
});

export const takesTheComponentsProps = (
  <div>
    <ChartOnly name="sales" fallback={<p>chart</p>} />
    <ChartOnly name="sales" points={[1, 2]} />
    <Legend name="sales" fallback="legend" />
    {/* @ts-expect-error `name` is required */}
    <ChartOnly fallback={<p>chart</p>} />
    {/* @ts-expect-error `colour` is not a prop of `Chart` */}
    <ChartOnly name="sales" colour="red" />
  </div>
);

// @ts-expect-error `export` names a key the module has
clientOnly(() => Promise.resolve({ Legend: Chart }), { export: "Missing" });

export const reentersHydration = (
  <NoHydration>
    <section>
      <Hydration id="w-">
        <ChartOnly name="sales" />
      </Hydration>
      <Hydration>
        <p>again</p>
      </Hydration>
    </section>
  </NoHydration>
);
