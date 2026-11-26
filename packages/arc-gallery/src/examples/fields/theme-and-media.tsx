import { CheckboxCards, Grid, RadioCards, Stack, ThemePicker } from "@barqjs/arc";
import { bg, edge, gap, layout, place, rounded, space } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";

const gallery = layer("gallery");

const sketch = gallery(layout.row, gap[2], bg.page, place.fill, { padding: space.x3 });
const block = gallery(bg.muted, edge.all, rounded.sm, layout.grow);

interface LayoutProps {
  columns: number;
}

function Layout(props: LayoutProps) {
  return (
    <span class={sketch}>
      {Array.from({ length: props.columns }, () => (
        <span class={block} />
      ))}
    </span>
  );
}

export default function ThemeAndMedia() {
  return (
    <Stack gap={8}>
      <ThemePicker description="Saved on this device and on your account." />
      <ThemePicker variant="segmented" label="Theme in the footer" />
      <Grid columns={{ base: 1, md: 2 }} gap={6}>
        <RadioCards
          label="Dashboard layout"
          mediaRatio="16 / 9"
          minCardWidth="10rem"
          defaultValue="two"
          options={[
            { value: "one", label: "One column", media: <Layout columns={1} /> },
            { value: "two", label: "Two columns", media: <Layout columns={2} /> },
            { value: "three", label: "Three columns", media: <Layout columns={3} /> },
          ]}
        />
        <CheckboxCards
          label="Widgets"
          minCardWidth="10rem"
          defaultValue={["uptime"]}
          options={[
            {
              value: "uptime",
              label: "Uptime",
              description: "The last 90 days",
              media: <Layout columns={1} />,
            },
            {
              value: "latency",
              label: "Latency",
              description: "p50 and p95",
              media: <Layout columns={2} />,
            },
          ]}
        />
      </Grid>
    </Stack>
  );
}
