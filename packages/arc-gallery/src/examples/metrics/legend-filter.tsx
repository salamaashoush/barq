import { createSignal } from "@barqjs/core";
import { LegendFilter, Stack, Text } from "@barqjs/arc";

const KINDS = [
  { key: "lesson", label: "Lessons", tone: "info" as const },
  { key: "exam", label: "Exams", tone: "danger" as const },
  { key: "trip", label: "Trips", tone: "success" as const },
  { key: "meeting", label: "Parent meetings", tone: "warning" as const },
  { key: "holiday", label: "Holidays", color: "var(--chart-5)" },
];

export default function LegendFilterExample() {
  const [hidden, setHidden] = createSignal<readonly string[]>(["holiday"]);
  return (
    <Stack gap={3}>
      <LegendFilter label="Kinds" items={KINDS} hidden={hidden()} onHiddenChange={setHidden} />
      <Text size="xs" color="muted">
        {hidden().length === 0 ? "Every kind shown." : `Hidden: ${hidden().join(", ")}`}
      </Text>
    </Stack>
  );
}
