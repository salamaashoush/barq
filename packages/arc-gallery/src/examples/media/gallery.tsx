import { createSignal } from "@barqjs/core";
import { Button, Gallery, type GalleryImage, Lightbox, Stack, Text } from "@barqjs/arc";

const PHOTOS: GalleryImage[] = [
  {
    src: "/media/aurora.svg",
    alt: "Aurora over a fjord",
    caption: "Tromsø offsite, March",
    placeholder: "#1f6f8b",
  },
  {
    src: "/media/dunes.svg",
    alt: "Dunes at dusk",
    caption: "Siwa, the team trip",
    placeholder: "#e39b5b",
  },
  {
    src: "/media/harbour.svg",
    alt: "A harbour at noon",
    caption: "Lisbon office opening",
    placeholder: "#5b9bd5",
  },
  {
    src: "/media/forest.svg",
    alt: "A forest ridge",
    caption: "Black Forest hike",
    placeholder: "#6fa35b",
  },
  {
    src: "/media/city.svg",
    alt: "A city at night",
    caption: "Cairo launch party",
    placeholder: "#7a4f9a",
  },
  {
    src: "/media/glacier.svg",
    alt: "A glacier field",
    caption: "Iceland, the long way round",
    placeholder: "#a8cde6",
  },
];

export default function GalleryExample() {
  const [open, setOpen] = createSignal(false);
  const [index, setIndex] = createSignal(0);

  return (
    <Stack gap={4}>
      <Gallery aria-label="Team trips" images={PHOTOS} minItemWidth="9rem" aspectRatio={4 / 3} />
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          A Lightbox of your own, opened at the fourth photo
        </Text>
        <div>
          <Button
            variant="outline"
            onPress={() => {
              setIndex(3);
              setOpen(true);
            }}
          >
            View the Black Forest hike
          </Button>
        </div>
        <Lightbox
          images={PHOTOS}
          isOpen={open()}
          onOpenChange={setOpen}
          index={index()}
          onIndexChange={setIndex}
          label="Team trip photos"
        />
        <Text size="sm" color="muted">
          Showing photo {index() + 1} of {PHOTOS.length}.
        </Text>
      </Stack>
    </Stack>
  );
}
