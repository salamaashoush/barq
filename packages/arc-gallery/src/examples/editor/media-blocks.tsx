import { Grid, Stack, Text } from "@barqjs/arc";
import {
  BlockEditor,
  RichTextRenderer,
  embedHtml,
  fileHtml,
  pictureHtml,
  picturesHtml,
  recordingHtml,
} from "@barqjs/arc/editor";
import type { UploadContext } from "@barqjs/arc";

const HARBOUR = pictureHtml(
  {
    src: "/media/harbour.svg",
    alt: "The harbour at dawn, boats at their moorings",
    caption: "The harbour, where the tour starts",
    size: "medium",
    credit: {
      author: "Acme Studio",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      source: "https://example.com/harbour",
    },
    labels: [
      { id: "pier", x: 0.3, y: 0.6, title: "The pier", text: "Boats leave from here on the hour." },
      { id: "light", x: 0.78, y: 0.3, title: "The lighthouse", text: "" },
    ],
  },
  "end",
);

const GALLERY = picturesHtml("gallery", {
  pictures: [
    { src: "/media/aurora.svg", alt: "An aurora over the hills", caption: "Night one" },
    { src: "/media/glacier.svg", alt: "A glacier's face" },
    { src: "/media/forest.svg", alt: "Pines in the snow" },
    { src: "/media/dunes.svg", alt: "Dunes at noon" },
  ],
});

const COMPARE = picturesHtml("compare", {
  pictures: [
    { src: "/media/city.svg", alt: "The square before the works", caption: "2019" },
    { src: "/media/harbour.svg", alt: "The square after the works", caption: "2024" },
  ],
});

const TOUR = recordingHtml({
  src: "/media/tour.mp4",
  mime: "video/mp4",
  caption: "A tour of the office",
  size: "large",
  captionsSrc: "/media/tour.en.vtt",
  captionsLang: "en",
  markers: [
    { at: 0, title: "Welcome" },
    { at: 4, title: "The kitchen" },
  ],
  descriptions: "0:02 A wide hall, desks on either side",
  transcript: "Welcome to the office. This is the kitchen.",
});

const FILM = embedHtml({
  provider: "youtube",
  embedId: "aqz-KE-bpKQ",
  caption: "A short film, loaded only once a reader chooses it",
  size: "full",
  markers: [
    { at: 0, title: "Opening" },
    { at: 95, title: "The meadow" },
  ],
});

const REPORT = fileHtml({
  src: "/media/poster.svg",
  name: "site-plan.svg",
  mime: "image/svg+xml",
  bytes: 48_213,
  caption: "The plan for the new floor",
});

const PAGE = [
  "# Office tour",
  "Choose a block's grip for its size and place, its pencil for alt text, credit, focus point and labels. Drop a picture, a recording or any file on the page to upload it.",
  HARBOUR,
  GALLERY,
  COMPARE,
  TOUR,
  FILM,
  REPORT,
].join("\n\n");

/** Uploads as a slow line would: progress a step at a time, then the file's own address. */
function upload(file: File, context: UploadContext): Promise<string> {
  return new Promise((resolve, reject) => {
    let sent = 0;
    const timer = setInterval(() => {
      sent += 0.2;
      context.onProgress(Math.min(1, sent));
      if (sent >= 1) {
        clearInterval(timer);
        resolve(URL.createObjectURL(file));
      }
    }, 300);
    context.signal.addEventListener("abort", () => {
      clearInterval(timer);
      reject(new Error("file.aborted"));
    });
  });
}

export default function MediaBlocks() {
  return (
    <Stack gap={6}>
      <BlockEditor label="Office tour" defaultMarkdown={PAGE} upload={upload} />
      <Grid columns={{ base: 1, cqLg: 2 }} gap={6}>
        <Stack gap={2}>
          <Text size="sm" weight="medium">
            Read: a labelled picture, a gallery and a before and after
          </Text>
          <RichTextRenderer markdown={[HARBOUR, GALLERY, COMPARE].join("\n\n")} />
        </Stack>
        <Stack gap={2}>
          <Text size="sm" weight="medium">
            Read: a video with chapters, an embed and a file
          </Text>
          <RichTextRenderer markdown={[TOUR, FILM, REPORT].join("\n\n")} />
        </Stack>
      </Grid>
    </Stack>
  );
}
