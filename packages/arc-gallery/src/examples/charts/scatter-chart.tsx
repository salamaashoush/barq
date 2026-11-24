import { Grid, ScatterChart } from "@barqjs/arc";

const ACCOUNTS = [
  { name: "Northwind", seats: 42, revenue: 18.2, tickets: 12, plan: "business" },
  { name: "Globex", seats: 120, revenue: 61.5, tickets: 30, plan: "business" },
  { name: "Initech", seats: 18, revenue: 5.4, tickets: 4, plan: "team" },
  { name: "Umbrella", seats: 64, revenue: 22.1, tickets: 22, plan: "team" },
  { name: "Hooli", seats: 210, revenue: 98.4, tickets: 41, plan: "business" },
  { name: "Stark", seats: 9, revenue: 1.1, tickets: 2, plan: "starter" },
  { name: "Wayne", seats: 15, revenue: 2.4, tickets: 6, plan: "starter" },
  { name: "Soylent", seats: 36, revenue: 10.8, tickets: 9, plan: "team" },
];

export default function ScatterChartExample() {
  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={8}>
      <ScatterChart
        label="Revenue against seats, by plan"
        data={ACCOUNTS}
        x="seats"
        y="revenue"
        name="name"
        group="plan"
        xLabel="Seats"
        yLabel="Revenue (thousands)"
        series={[
          { key: "starter", label: "Starter", tone: "neutral" },
          { key: "team", label: "Team", tone: "info" },
          { key: "business", label: "Business", tone: "success" },
        ]}
        height={280}
      />
      <ScatterChart
        label="Support load: tickets as bubble size"
        data={ACCOUNTS}
        x="seats"
        y="revenue"
        size="tickets"
        name="name"
        xLabel="Seats"
        yLabel="Revenue (thousands)"
        sizeLabel="Open tickets"
        table="toggle"
        height={280}
      />
    </Grid>
  );
}
