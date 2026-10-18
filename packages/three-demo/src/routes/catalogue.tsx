import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Link, createFileRoute } from "@barqjs/router";

import { getSystem } from "../data/system.ts";

const sheet = css`
  overflow-y: auto;
  padding: 1.5rem 1.25rem 3rem;

  h1 {
    margin: 0 0 0.3rem;
    font-size: 20px;
    color: #fff;
  }

  table {
    width: 100%;
    max-width: 60rem;
    margin-top: 1rem;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.45rem 0.6rem;
    text-align: left;
    border-bottom: 1px solid rgb(255 255 255 / 0.07);
  }

  th {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #7c86a8;
  }

  td[data-number] {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
`;

const swatch = css`
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  margin-right: 0.5rem;
  border-radius: 50%;
  vertical-align: -0.05rem;
  background: var(--planet);
`;

function Catalogue() {
  const system = Route.useLoaderData();
  return (
    <section class={sheet}>
      <h1>Catalogue</h1>
      <p>
        The bodies the orrery draws, from the same server function its loader calls. No canvas on
        this page: going back to the <Link to="/">orrery</Link> mounts the scene afresh.
      </p>
      <table id="catalogue">
        <thead>
          <tr>
            <th>Planet</th>
            <th>Kind</th>
            <th>Year (days)</th>
            <th>Moons</th>
            <th>Fact</th>
          </tr>
        </thead>
        <tbody>
          <For each={system()?.planets ?? []}>
            {(planet) => (
              <tr data-planet={planet.id}>
                <td>
                  <span class={swatch} style={{ "--planet": planet.color }} />
                  {planet.name}
                </td>
                <td>{planet.kind}</td>
                <td data-number>{planet.period.toLocaleString("en")}</td>
                <td data-number>{planet.moons}</td>
                <td>{planet.fact}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </section>
  );
}

export const Route = createFileRoute("/catalogue")({
  loader: () => getSystem(),
  component: Catalogue,
  head: { meta: [{ title: "Catalogue: barq orrery" }] },
});
