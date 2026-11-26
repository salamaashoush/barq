import { createSignal } from "@barqjs/core";
import { Button, SegmentedBar, Stack, TallyProgress } from "@barqjs/arc";

export default function SegmentedBars() {
  const [passed, setPassed] = createSignal(31);
  return (
    <Stack gap={8}>
      <SegmentedBar
        label="Request timing"
        caption="412 ms"
        shares
        segments={[
          { key: "dns", label: "DNS", value: 18 },
          { key: "connect", label: "Connect", value: 34 },
          { key: "tls", label: "TLS", value: 52 },
          { key: "wait", label: "Waiting", value: 268, tone: "warning" },
          { key: "download", label: "Download", value: 40 },
        ]}
      />
      <SegmentedBar
        label="Storage by kind"
        total={10}
        caption="6.4 GB of 10 GB"
        formatOptions={{ style: "unit", unit: "gigabyte" }}
        segments={[
          { key: "video", label: "Video", value: 4.1 },
          { key: "images", label: "Images", value: 1.6 },
          { key: "documents", label: "Documents", value: 0.7 },
        ]}
      />
      <Stack gap={3}>
        <TallyProgress
          label="Tests finished"
          total={48}
          segments={[
            { key: "passed", label: "Passed", value: passed(), tone: "success" },
            { key: "flaky", label: "Flaky", value: 2, tone: "warning" },
            { key: "failed", label: "Failed", value: 3, tone: "danger" },
            { key: "skipped", label: "Skipped", value: 1, tone: "neutral" },
          ]}
        />
        <Button variant="outline" size="sm" onPress={() => setPassed((n) => Math.min(42, n + 4))}>
          Finish more tests
        </Button>
      </Stack>
      <TallyProgress
        label="Rows imported"
        total={1200}
        legend={false}
        size="sm"
        segments={[{ key: "done", label: "Imported", value: 1200, tone: "success" }]}
      />
    </Stack>
  );
}
