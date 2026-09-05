/**
 * What shows data: a table, a chart, a calendar, and the two empty states.
 */

import { css } from "@barqjs/css";
import { CalendarDate } from "@barqjs/aria";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import {
  Badge,
  Button,
  Calendar,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartBars,
  ChartContainer,
  ChartLegend,
  ChartLines,
  ChartTooltipContent,
  DatePicker,
  DateRangePicker,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  Marker,
  MarkerContent,
  RangeCalendar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barqjs/ui";

import { row, wide } from "./shared.ts";

const CHART_CONFIG = [
  { key: "desktop", label: "Desktop", color: "var(--chart-1)" },
  { key: "mobile", label: "Mobile", color: "var(--chart-2)" },
  { key: "tablet", label: "Tablet", color: "var(--chart-3)" },
];

const CHART_DATA = [
  { month: "Jan", desktop: 186, mobile: 80, tablet: 45 },
  { month: "Feb", desktop: 305, mobile: 200, tablet: 92 },
  { month: "Mar", desktop: 237, mobile: 120, tablet: 61 },
  { month: "Apr", desktop: 273, mobile: 190, tablet: 78 },
  { month: "May", desktop: 209, mobile: 130, tablet: 55 },
];

export function TableDemo() {
  return (
    <div class={wide}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>INV001</TableCell>
            <TableCell>
              <Badge variant="secondary">Paid</Badge>
            </TableCell>
            <TableCell>250.00</TableCell>
          </TableRow>
          <TableRow isSelected>
            <TableCell>INV002</TableCell>
            <TableCell>
              <Badge variant="destructive">Overdue</Badge>
            </TableCell>
            <TableCell>150.00</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>INV003</TableCell>
            <TableCell>
              <Badge variant="outline">Draft</Badge>
            </TableCell>
            <TableCell>90.00</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

const chartCard = css`
  width: 100%;
  max-width: 26rem;
`;

export function ChartBarsDemo() {
  return (
    <Card class={chartCard}>
      <CardHeader>
        <CardTitle>Revenue</CardTitle>
        <CardDescription>Every series is a step of the theme's ramp.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={CHART_CONFIG}>
          <ChartBars data={CHART_DATA} x="month" aria-label="Revenue by month" />
          <ChartLegend />
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function ChartLinesDemo() {
  return (
    <Card class={chartCard}>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={CHART_CONFIG}>
          <ChartLines data={CHART_DATA} x="month" area aria-label="Sessions by month" />
          <ChartLegend />
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function ChartTooltipDemo() {
  return (
    <ChartTooltipContent
      label="March"
      items={[
        { key: "desktop", label: "Desktop", value: "1,204" },
        { key: "mobile", label: "Mobile", value: "832" },
      ]}
    />
  );
}

export function CalendarDemo() {
  return <Calendar aria-label="Departure" />;
}

export function RangeCalendarDemo() {
  return <RangeCalendar aria-label="Stay" />;
}

export function DatePickerDemo() {
  return (
    <div class={row}>
      <DatePicker />
      <DatePicker defaultValue={new CalendarDate(2022, 1, 20)} />
    </div>
  );
}

export function DateRangePickerDemo() {
  return (
    <DateRangePicker
      defaultValue={{
        start: new CalendarDate(2022, 1, 20),
        end: new CalendarDate(2022, 2, 9),
      }}
    />
  );
}

const box = css`
  width: 100%;
  max-width: 22rem;
`;

export function EmptyDemo() {
  return (
    <Empty class={box}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox />
        </EmptyMedia>
        <EmptyTitle>No invoices yet</EmptyTitle>
        <EmptyDescription>They appear here once you send one.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm">New invoice</Button>
      </EmptyContent>
    </Empty>
  );
}

export function ItemDemo() {
  return (
    <ItemGroup style={{ width: "100%", "max-width": "28rem" }}>
      <Item variant="outline">
        <ItemMedia variant="icon">
          <FileText />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Q3 report</ItemTitle>
          <ItemDescription>Uploaded two days ago, 2.4 MB.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button size="sm" variant="outline">
            Open
          </Button>
        </ItemActions>
      </Item>
    </ItemGroup>
  );
}

export function ItemVariants() {
  return (
    <ItemGroup style={{ width: "100%", "max-width": "28rem" }}>
      <Item size="sm" href="#">
        <ItemMedia variant="icon">
          <FileText />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Q2 report</ItemTitle>
          <ItemDescription>A link, so the whole row lights up.</ItemDescription>
        </ItemContent>
      </Item>
      <ItemSeparator />
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>Q1 report</ItemTitle>
          <ItemDescription>Archived.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant="secondary">Archived</Badge>
        </ItemActions>
      </Item>
    </ItemGroup>
  );
}

export function MarkerDemo() {
  return (
    <div class={wide}>
      <Marker variant="separator">
        <MarkerContent>Yesterday</MarkerContent>
      </Marker>
      <Marker>
        <MarkerContent>Mira joined the conversation</MarkerContent>
      </Marker>
    </div>
  );
}
