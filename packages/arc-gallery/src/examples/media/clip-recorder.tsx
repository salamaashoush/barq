import { createSignal } from "@barqjs/core";
import { Grid, ClipRecorder, type RecorderStatus, Stack, Text, toast } from "@barqjs/arc";

export default function ClipRecorderExample() {
  const [status, setStatus] = createSignal<RecorderStatus>("idle");

  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={6}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          A voice note, up to a minute
        </Text>
        <ClipRecorder
          maxDuration={60}
          onStatusChange={setStatus}
          onAttach={async (clip) => {
            await new Promise((resolve) => setTimeout(resolve, 800));
            toast.success(`Attached a ${Math.round(clip.duration)} second voice note`);
          }}
          attachLabel="Attach to ticket"
        />
        <Text size="sm" color="muted">
          Status: {status()}
        </Text>
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          A video clip after a three second countdown
        </Text>
        <ClipRecorder kind="video" countdown={3} maxDuration={30} />
      </Stack>
    </Grid>
  );
}
