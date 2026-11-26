import { createSignal } from "@barqjs/core";
import {
  MultiSegmentedControl,
  type Segment,
  SegmentedControl,
  SegmentedField,
  Stack,
  Text,
} from "@barqjs/arc";
import { Globe } from "@barqjs/lucide/icons/globe";
import { MonitorSmartphone } from "@barqjs/lucide/icons/monitor-smartphone";

const STATES: Segment[] = [
  { value: "open", label: "Open", count: 3, tone: "danger" },
  { value: "acknowledged", label: "Acknowledged", count: 1, tone: "warning" },
  { value: "resolved", label: "Resolved", count: 42, tone: "success" },
  { value: "all", label: "All" },
];

const BROWSERS: Segment[] = [
  { value: "chromium", label: "Chromium", icon: Globe },
  { value: "firefox", label: "Firefox" },
  { value: "webkit", label: "WebKit", icon: MonitorSmartphone },
];

export default function SegmentedControlExample() {
  const [state, setState] = createSignal("open");
  const [browsers, setBrowsers] = createSignal<string[]>(["chromium", "webkit"]);
  const [engine, setEngine] = createSignal("");
  return (
    <Stack gap={4}>
      <Stack gap={1.5}>
        <SegmentedControl aria-label="State" items={STATES} value={state()} onChange={setState} />
        <Text size="sm" color="muted">
          Showing {state()} incidents.
        </Text>
      </Stack>
      <SegmentedControl
        aria-label="Window, kept in the address"
        param="window"
        size="sm"
        items={[
          { value: "24h", label: "24h" },
          { value: "7d", label: "7d" },
          { value: "30d", label: "30d" },
          { value: "90d", label: "90d" },
        ]}
      />
      <MultiSegmentedControl
        aria-label="Browsers"
        items={BROWSERS}
        value={browsers()}
        onChange={setBrowsers}
      />
      <SegmentedField
        label="Engine"
        description={
          engine() === "" ? "Each run picks the browser default." : `Runs on ${engine()}.`
        }
        items={[{ value: "", label: "Browser default" }, ...BROWSERS]}
        value={engine()}
        onChange={setEngine}
      />
      <SegmentedControl aria-label="Disabled" items={STATES} isDisabled />
    </Stack>
  );
}
