import { css } from "@barqjs/css";
import { TrendingUp } from "@barqjs/lucide/icons/trending-up";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Chart,
  ChartContainer,
  type ChartConfig,
  type ChartDefinition,
} from "@barqjs/ui";

import type { Child, Incoming } from "@barqjs/core";

/**
 * The six months every one of shadcn's chart examples is drawn from.
 *
 * Their numbers, unchanged, because the point of these pages is that the same
 * data draws the same picture: a value moved here to make a curve look better
 * would make this a different chart from the one being ported.
 */
export const MONTHS = [
  { month: "January", desktop: 186, mobile: 80 },
  { month: "February", desktop: 305, mobile: 200 },
  { month: "March", desktop: 237, mobile: 120 },
  { month: "April", desktop: 73, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "June", desktop: 214, mobile: 140 },
] as const;

export const DESKTOP: ChartConfig = [{ key: "desktop", label: "Desktop", color: "var(--chart-1)" }];

export const DESKTOP_MOBILE: ChartConfig = [
  { key: "desktop", label: "Desktop", color: "var(--chart-1)" },
  { key: "mobile", label: "Mobile", color: "var(--chart-2)" },
];

/** `January` as `Jan`, which is upstream's `tickFormatter` on every one. */
export const short = (value: unknown): string => String(value).slice(0, 3);

/**
 * The axis shadcn draws: labels, and nothing else.
 *
 * `tickLine={false} axisLine={false} tickMargin={8}` is on every `<XAxis>`
 * upstream, and the grid is `vertical={false}`. So the horizontal rules carry
 * the reading and the axis itself is only a row of words.
 *
 * `ticks: false` is NOT how to say that. It removes the whole tick guide, and
 * the guide is what carries `format` and what the labels are generated from, so
 * every chart came out as a bare plot with no months under it. A tick of length
 * ZERO is the mark upstream hides while keeping the label it belongs to.
 */
export const BARE_AXIS = {
  line: false,
  ticks: { size: 0, padding: 8 },
  tickLabels: { fontSize: 12, thin: true },
} as const;

/** The same, formatting each month to upstream's three letters. */
export const MONTH_AXIS = {
  line: false,
  ticks: { size: 0, padding: 8, format: short },
  tickLabels: { fontSize: 12, thin: true },
} as const;

const footer = css`
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.875rem;
`;

const trend = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  line-height: 1;
  font-weight: 500;
`;

const note = css`
  line-height: 1;
  color: var(--muted-foreground);
`;

export interface ChartCardProps {
  title: string;
  description?: string;
  config: ChartConfig;
  definition: ChartDefinition;
  ariaLabel: string;
  /** The line above the muted one, which upstream always fills with a trend. */
  trend?: string;
  footnote?: string;
  height?: number;
  children?: Child;
}

/**
 * The card every chart on these pages sits in, which is upstream's arrangement.
 *
 * Title and description above, the plot in the content, a trend and a range
 * below. Repeating that per chart is what upstream does and what makes each
 * file a copyable example; here it is one component because the gallery renders
 * sixty of them and the difference between two is the DEFINITION.
 */
export function ChartCard(props: Incoming<ChartCardProps>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        {props.description?.() === undefined ? null : (
          <CardDescription>{props.description()}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <ChartContainer config={props.config()}>
          <Chart
            definition={props.definition()}
            ariaLabel={props.ariaLabel()}
            height={props.height?.() ?? 250}
          />
          {props.children}
        </ChartContainer>
      </CardContent>
      {props.trend?.() === undefined && props.footnote?.() === undefined ? null : (
        <CardFooter class={footer}>
          {props.trend?.() === undefined ? null : (
            <div class={trend}>
              {props.trend()} <TrendingUp size={16} />
            </div>
          )}
          {props.footnote?.() === undefined ? null : <div class={note}>{props.footnote()}</div>}
        </CardFooter>
      )}
    </Card>
  );
}
