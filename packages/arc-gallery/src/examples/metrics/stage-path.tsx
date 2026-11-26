import { createSignal } from "@barqjs/core";
import { Button, Inline, StagePath, Stack } from "@barqjs/arc";

const ADMISSION = [
  { key: "applied", label: "Applied" },
  { key: "assessed", label: "Assessed" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "enrolled", label: "Enrolled" },
];

export default function StagePathExample() {
  const [at, setAt] = createSignal(2);
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <StagePath label="Admission" stages={ADMISSION} current={ADMISSION[at()]?.key ?? null} />
        <Inline gap={2}>
          <Button variant="outline" size="sm" onPress={() => setAt((n) => Math.max(0, n - 1))}>
            Back a stage
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={() => setAt((n) => Math.min(ADMISSION.length - 1, n + 1))}
          >
            Move on
          </Button>
        </Inline>
      </Stack>
      <StagePath
        label="Lead"
        stages={[
          { key: "new", label: "New" },
          { key: "contacted", label: "Contacted" },
          { key: "visited", label: "Visited" },
          { key: "won", label: "Won" },
        ]}
        current={null}
        outcome={{ label: "Lost: chose another school", at: "visited" }}
      />
    </Stack>
  );
}
