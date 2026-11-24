import { createSignal } from "@barqjs/core";
import { Button, Grid, Image, type ImageStatus, Stack, Text } from "@barqjs/arc";

export default function ImageExample() {
  const [status, setStatus] = createSignal<ImageStatus>("loading");
  const [attempt, setAttempt] = createSignal(0);

  return (
    <Grid columns={{ base: 1, cqMd: 3 }} gap={4}>
      <Stack gap={2}>
        <Image
          src="/media/harbour.svg"
          alt="A harbour at noon under a pale sun"
          aspectRatio={3 / 2}
          rounded="lg"
          placeholder="#5b9bd5"
          priority
        />
        <Text size="sm" color="muted">
          Above the fold: loaded at once, over a colour placeholder.
        </Text>
      </Stack>
      <Stack gap={2}>
        <Image
          src={`/media/glacier.svg?attempt=${attempt()}`}
          alt="A glacier field"
          aspectRatio={3 / 2}
          rounded="lg"
          fit="contain"
          onStatusChange={setStatus}
        />
        <Text size="sm" color="muted">
          Lazy, contained, its status reported: {status()}.
        </Text>
        <Button variant="outline" size="sm" onPress={() => setAttempt((n) => n + 1)}>
          Load again
        </Button>
      </Stack>
      <Stack gap={2}>
        <Image
          src="/media/no-such-photo.jpg"
          alt="The Acme office in winter"
          aspectRatio={3 / 2}
          rounded="lg"
        />
        <Text size="sm" color="muted">
          A picture that cannot load keeps its place and its name.
        </Text>
      </Stack>
    </Grid>
  );
}
