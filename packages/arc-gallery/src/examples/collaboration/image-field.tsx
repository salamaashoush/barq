import { Show, createSignal, onCleanup } from "@barqjs/core";
import {
  Button,
  type CropArea,
  type CropView,
  Grid,
  ImageCropper,
  ImageField,
  Stack,
  Text,
  cropImage,
} from "@barqjs/arc";
import { rounded, surface } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";

import { uploadFile } from "../../data/upload.ts";

const demo = layer("demo");
const result = demo(surface.bordered, rounded.md, { maxWidth: "100%", maxHeight: "12rem" });

/** The server keeps nothing, so the picture is shown from the file that was sent. */
async function upload(file: File, context: Parameters<typeof uploadFile>[1]): Promise<string> {
  await uploadFile(file, context);
  return URL.createObjectURL(file);
}

export default function ImageFieldExample() {
  const [avatar, setAvatar] = createSignal<string | null>(null);
  const [view, setView] = createSignal<CropView>({ zoom: 1.4, panX: 0.3, panY: -0.2 });
  const [area, setArea] = createSignal<CropArea | undefined>(undefined);
  const [cropped, setCropped] = createSignal<string | undefined>(undefined);
  let image: HTMLImageElement | undefined;
  onCleanup(() => {
    const url = cropped();
    if (url !== undefined) URL.revokeObjectURL(url);
  });

  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={6}>
      <Stack gap={6}>
        <ImageField
          label="Profile photo"
          description="PNG or JPEG up to 5 MB, cropped square."
          value={avatar()}
          onChange={setAvatar}
          upload={upload}
        />
        <ImageField
          label="Workspace cover"
          description="Choose a ratio, then pan and zoom. A file named “fail” is refused by the server."
          shape="image"
          defaultValue="/acme-office.svg"
          upload={upload}
          onChooseFromLibrary={() => Promise.resolve("/acme-office.svg")}
        />
        <ImageField label="Team logo" upload={upload} isDisabled />
        <ImageField
          label="Invoice logo"
          upload={upload}
          errorMessage="Add a logo before sending invoices."
        />
      </Stack>
      <Stack gap={3}>
        <Text size="sm" weight="medium">
          ImageCropper on its own, cropped in the browser with cropImage
        </Text>
        <ImageCropper
          src="/acme-office.svg"
          aspects={[
            { label: "16:9", ratio: 16 / 9 },
            { label: "1:1", ratio: 1 },
          ]}
          view={view()}
          onViewChange={(next, kept) => {
            setView(next);
            setArea(kept);
          }}
          onImage={(loaded) => {
            image = loaded;
          }}
        />
        <Text size="xs" color="muted" numeric>
          Zoom {view().zoom.toFixed(2)}, keeping{" "}
          {area() === undefined
            ? "the centre"
            : `${Math.round(area()?.width ?? 0)} × ${Math.round(area()?.height ?? 0)} px`}
        </Text>
        <Button
          variant="outline"
          isDisabled={area() === undefined}
          onPress={() =>
            void (async () => {
              const kept = area();
              if (image === undefined || kept === undefined) return;
              const blob = await cropImage(image, kept, { maxSize: 640 });
              const previous = cropped();
              if (previous !== undefined) URL.revokeObjectURL(previous);
              setCropped(URL.createObjectURL(blob));
            })()
          }
        >
          Crop
        </Button>
        <Show when={cropped()}>
          {(url) => <img class={result} src={url()} alt="The cropped office" />}
        </Show>
      </Stack>
    </Grid>
  );
}
