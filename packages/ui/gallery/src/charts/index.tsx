import { Dynamic, For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Button } from "@barqjs/ui";
import { Link, useLocation, useParams } from "@barqjs/router";

import { AREA_CHARTS } from "./area.tsx";
import { Page } from "../site.tsx";

import type { Child } from "@barqjs/core";

export interface ChartEntry {
  readonly name: string;
  readonly description: string;
  /** The chart's own component, rendered through `Dynamic` rather than called. */
  readonly component: () => Child;
}

/**
 * The chart types, by the name upstream's `/charts/[type]` route uses.
 *
 * One page per type rather than one long page, because that is upstream's own
 * split and because sixty charts on one page is sixty live hosts measuring
 * sixty containers.
 */
export const CHART_TYPES: readonly {
  type: string;
  label: string;
  charts: readonly ChartEntry[];
}[] = [
  { type: "area", label: "Area", charts: AREA_CHARTS },
  { type: "bar", label: "Bar", charts: [] },
  { type: "line", label: "Line", charts: [] },
  { type: "pie", label: "Pie", charts: [] },
  { type: "radar", label: "Radar", charts: [] },
  { type: "radial", label: "Radial", charts: [] },
  { type: "tooltip", label: "Tooltip", charts: [] },
];

const tabs = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
`;

const plain = css`
  text-decoration: none;
  color: inherit;
`;

const grid = css`
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
  align-items: start;
`;

export function ChartsPage() {
  const params = useParams();
  const here = useLocation();
  const type = (): string => params().type ?? "area";
  const found = (): (typeof CHART_TYPES)[number] | undefined =>
    CHART_TYPES.find((each) => each.type === type());

  return (
    <Page
      title="Charts"
      lede="Every chart shadcn/ui ships, drawn by TanStack Charts through this package's own tokens."
    >
      <div class={tabs}>
        <For each={() => CHART_TYPES}>
          {(each: (typeof CHART_TYPES)[number]) => (
            <Link to={`/charts/${each.type}`} class={plain}>
              <Button
                size="sm"
                variant="ghost"
                data-active={() => (here().pathname === `/charts/${each.type}` ? "true" : "false")}
              >
                {each.label}
              </Button>
            </Link>
          )}
        </For>
      </div>
      <div class={grid}>
        <For each={() => found()?.charts ?? []}>
          {(chart: ChartEntry) => <Dynamic component={chart.component} />}
        </For>
      </div>
    </Page>
  );
}
