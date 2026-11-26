import { Show, createSignal } from "@barqjs/core";
import { Button, Grid, LinkPreview, Stack } from "@barqjs/arc";

const COVER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 382 200"><rect width="382" height="200" fill="#3b5bdb"/><circle cx="300" cy="60" r="80" fill="#748ffc"/><rect x="24" y="120" width="180" height="16" rx="8" fill="#edf2ff"/></svg>`,
  );

export default function LinkPreviewExample() {
  const [shown, setShown] = createSignal(true);
  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={6}>
      <Stack gap={4}>
        <Show
          when={shown()}
          fallback={
            <Button variant="outline" size="sm" onPress={() => setShown(true)}>
              Bring the preview back
            </Button>
          }
        >
          <LinkPreview
            url="https://example.com/blog/arc-charts"
            title="Charts that read in words"
            description="Every arc chart is also a table, and its marks say what they mean in the legend."
            siteName="Example Blog"
            image={COVER}
            onDismiss={() => setShown(false)}
          />
        </Show>
        <LinkPreview
          url="https://docs.example.com/guides/getting-started"
          title="Getting started"
        />
        <LinkPreview url="https://example.com/slow" loading />
      </Stack>
      <LinkPreview
        layout="stacked"
        url="https://example.com/events/open-day"
        title="Open day, 6 December"
        description="Tour the school, meet the teachers and see the new library."
        image={COVER}
      />
    </Grid>
  );
}
