import { FunnelChart, Grid } from "@barqjs/arc";

export default function FunnelChartExample() {
  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={8}>
      <FunnelChart
        label="Trial to paid, November"
        data={[
          { key: "visited", label: "Visited pricing", value: 18_240 },
          { key: "signed-up", label: "Started a trial", value: 4_310 },
          { key: "activated", label: "Invited a teammate", value: 1_920 },
          { key: "paid", label: "Upgraded", value: 612, tone: "success" },
        ]}
        table="toggle"
      />
      <FunnelChart
        label="Hiring pipeline, support lead"
        tone="info"
        showValues={false}
        data={[
          { key: "applied", label: "Applied", value: 240 },
          { key: "screened", label: "Screened", value: 64 },
          { key: "interviewed", label: "Interviewed", value: 18 },
          { key: "offered", label: "Offered", value: 3 },
        ]}
      />
    </Grid>
  );
}
