import { Grid, MediaPlayer, Stack, Text } from "@barqjs/arc";

export default function MediaPlayerExample() {
  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={6}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Video with captions in two languages, chapters and a transcript
        </Text>
        <MediaPlayer
          title="Acme product tour"
          src={[{ src: "/media/tour.mp4", type: "video/mp4" }]}
          poster="/media/poster.svg"
          tracks={[
            { src: "/media/tour.en.vtt", srclang: "en", label: "English", default: true },
            { src: "/media/tour.ar.vtt", srclang: "ar", label: "العربية" },
          ]}
          chapters={[
            { start: 0, title: "Welcome" },
            { start: 3, title: "The dashboard" },
            { start: 6, title: "Invoices" },
            { start: 9, title: "Wrapping up" },
          ]}
          transcript={[
            { start: 0, end: 3, text: "Welcome to the Acme product tour." },
            { start: 3, end: 6, text: "The dashboard shows every service at a glance." },
            { start: 6, end: 9, text: "Open an invoice to see who paid and when." },
            { start: 9, end: 12, text: "That is the tour. Thanks for watching." },
          ]}
        />
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Audio, its own speeds
        </Text>
        <MediaPlayer
          kind="audio"
          title="Monday stand-up, 24 November"
          src="/media/standup.webm"
          rates={[1, 1.5, 2]}
        />
      </Stack>
    </Grid>
  );
}
