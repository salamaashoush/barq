import { Grid, Heatmap } from "@barqjs/arc";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = ["00", "03", "06", "09", "12", "15", "18", "21"];

const DEPLOYS = DAYS.flatMap((day, d) =>
  HOURS.map((hour, h) => ({
    day,
    hour,
    deploys:
      d >= 5 ? h % 4 : Math.round(2 + 6 * Math.sin(((h + 1) / HOURS.length) * Math.PI) + (d % 3)),
  })),
);

const ERRORS = [
  { service: "api", region: "eu-west-1", rate: 0.4 },
  { service: "api", region: "us-east-1", rate: 1.2 },
  { service: "api", region: "ap-south-1", rate: 2.8 },
  { service: "billing", region: "eu-west-1", rate: 0.1 },
  { service: "billing", region: "us-east-1", rate: 0.3 },
  { service: "billing", region: "ap-south-1", rate: 0.6 },
  { service: "search", region: "eu-west-1", rate: 1.9 },
  { service: "search", region: "us-east-1", rate: 3.4 },
  { service: "search", region: "ap-south-1", rate: 4.1 },
];

export default function HeatmapExample() {
  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={8}>
      <Heatmap
        label="Deploys by weekday and hour, UTC"
        data={DEPLOYS}
        x="hour"
        y="day"
        value="deploys"
        yLabel="Day"
        valueLabel="Deploys"
        table="toggle"
      />
      <Heatmap
        label="Error rate by service and region"
        data={ERRORS}
        x="region"
        y="service"
        value="rate"
        yLabel="Service"
        valueLabel="Error rate"
        tone="danger"
        steps={4}
        domain={[0, 5]}
        formatOptions={{ style: "unit", unit: "percent", maximumFractionDigits: 1 }}
      />
    </Grid>
  );
}
