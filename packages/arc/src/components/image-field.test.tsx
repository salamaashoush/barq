import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, fireEvent, render, screen, user, waitFor, within } from "@barqjs/testing";
import { touch } from "@barqjs/ui/shared-touch";

import { hydrates, settle, wears } from "../test-arc.ts";
import { type CropArea, ImageCropper, ImageField, cropArea } from "./image-field.tsx";

const HERE = import.meta.dir;

function file(name: string, size: number, type: string): File {
  return new File([new Uint8Array(size)], name, { type });
}

function pick(files: File[]): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { configurable: true, value: files });
  fireEvent.change(input);
}

/** Give the crop stage's picture a size, as loading it would. */
async function loaded(width = 800, height = 400): Promise<HTMLImageElement> {
  const image = document.querySelector('[data-slot="image-cropper-image"]') as HTMLImageElement;
  Object.defineProperty(image, "naturalWidth", { configurable: true, value: width });
  Object.defineProperty(image, "naturalHeight", { configurable: true, value: height });
  image.dispatchEvent(new Event("load"));
  await settle();
  return image;
}

interface Drawn {
  area: number[];
  size: [number, number];
}

const drawn: Drawn[] = [];
const original = {
  getContext: HTMLCanvasElement.prototype.getContext,
  toBlob: HTMLCanvasElement.prototype.toBlob,
};

beforeEach(() => {
  drawn.length = 0;
  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
    return {
      drawImage: (_image: unknown, x: number, y: number, w: number, h: number) =>
        drawn.push({ area: [x, y, w, h], size: [this.width, this.height] }),
    };
  } as never;
  HTMLCanvasElement.prototype.toBlob = function (done: BlobCallback, type?: string) {
    done(new Blob(["png"], { type: type ?? "image/png" }));
  };
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = original.getContext;
  HTMLCanvasElement.prototype.toBlob = original.toBlob;
  destroyAnnouncer();
});

describe("cropArea", () => {
  test("covers the frame at zoom 1, and pans as far as the image reaches", () => {
    expect(cropArea(800, 400, 1, { zoom: 1, panX: 0, panY: 0 })).toEqual({
      x: 200,
      y: 0,
      width: 400,
      height: 400,
    });
    expect(cropArea(800, 400, 1, { zoom: 2, panX: 1, panY: -1 })).toEqual({
      x: 600,
      y: 0,
      width: 200,
      height: 200,
    });
  });
});

describe("ImageField", () => {
  test("empty, it is a drop zone with a button to choose; a picture too large is refused", async () => {
    render(() => <ImageField label="Profile photo" upload={async () => "/u.png"} />);
    expect(screen.getByRole("button", { name: "Choose an image" })).toBeDefined();
    pick([file("huge.png", 6_000_000, "image/png")]);
    await settle();
    const field = document.querySelector('[data-slot="image-field"]') as HTMLElement;
    expect(within(field).getByText(/huge\.png is larger than/)).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
    pick([file("notes.pdf", 10, "application/pdf")]);
    await settle();
    expect(within(field).getByText("notes.pdf is not a type this accepts")).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a picture opens the crop, which uploads what the frame holds and shows it", async () => {
    const sent: File[] = [];
    let finish: (url: string) => void = () => {};
    const seen: (string | null)[] = [];
    render(() => (
      <ImageField
        label="Profile photo"
        onChange={(value) => seen.push(value)}
        upload={(sentFile, { onProgress }) => {
          sent.push(sentFile);
          onProgress(0.5);
          return new Promise((resolve) => {
            finish = resolve;
          });
        }}
      />
    ));
    pick([file("me.jpg", 10, "image/jpeg")]);
    await settle();
    expect(screen.getByRole("dialog", { name: "Crop the image" })).toBeDefined();
    await loaded(800, 400);
    expect(await ariaViolations(document.body)).toEqual([]);
    const stage = screen.getByRole("group", { name: "Crop area" });
    stage.focus();
    await user.keyboard("+");
    await user.keyboard("{ArrowLeft}");
    await settle();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.type).toBe("image/jpeg");
    expect(drawn[0]?.size[0]).toBe(drawn[0]?.size[1]);
    expect(drawn[0]?.area[0]).toBeGreaterThan(200);
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("progressbar", { name: "Uploading me.jpg" })).toBeDefined();
    finish("/photos/me.jpg");
    await waitFor(() => expect(seen).toEqual(["/photos/me.jpg"]));
    await settle();
    expect(screen.getAllByRole("img", { name: "Profile photo" }).length).toBeGreaterThan(0);
    expect(
      document.querySelector('[data-slot="image-field-preview"] img')?.getAttribute("src"),
    ).toBe("/photos/me.jpg");
  });

  test("with a picture set, Change and Remove sit beside it; Choose from library takes a URL", async () => {
    const [value, setValue] = createSignal<string | null>("/a.png");
    render(() => (
      <ImageField
        label="Logo"
        shape="image"
        value={value()}
        onChange={setValue}
        upload={async () => "/b.png"}
        onChooseFromLibrary={async () => "/library/c.png"}
      />
    ));
    expect(screen.getByRole("button", { name: "Change" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await settle();
    expect(value()).toBeNull();
    await user.click(screen.getByRole("button", { name: "Choose from library" }));
    await waitFor(() => expect(value()).toBe("/library/c.png"));
  });

  test("a failed upload says so and is retried", async () => {
    let attempts = 0;
    render(() => (
      <ImageField
        label="Photo"
        crop={false}
        upload={async () => {
          attempts++;
          if (attempts === 1) throw new Error("down");
          return "/ok.png";
        }}
      />
    ));
    pick([file("me.png", 10, "image/png")]);
    const field = document.querySelector('[data-slot="image-field"]') as HTMLElement;
    await waitFor(() =>
      expect(within(field).getByText("me.png could not be uploaded")).toBeDefined(),
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("img", { name: "Photo" })).toBeDefined());
    expect(attempts).toBe(2);
  });
});

describe("ImageCropper", () => {
  test("aspect presets change the frame; a drag pans it", async () => {
    const areas: CropArea[] = [];
    render(() => (
      <ImageCropper
        src="/x.png"
        aspects={[
          { label: "16:9", ratio: 16 / 9 },
          { label: "1:1", ratio: 1 },
        ]}
        onViewChange={(_view, area) => areas.push(area)}
      />
    ));
    await loaded(1600, 900);
    expect(areas.at(-1)).toEqual({ x: 0, y: 0, width: 1600, height: 900 });
    await user.click(screen.getByRole("button", { name: "1:1" }));
    await settle();
    expect(areas.at(-1)?.width).toBe(900);
    const stage = screen.getByRole("group", { name: "Crop area" });
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 300 }) as DOMRect;
    stage.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 100, clientY: 0, pointerId: 1, bubbles: true }),
    );
    stage.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 150, clientY: 0, pointerId: 1, bubbles: true }),
    );
    stage.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true }));
    await settle();
    expect(areas.at(-1)?.x).toBeLessThan(350);
    expect(stage.getAttribute("dir")).toBe("ltr");
  });

  test("its controls stay a finger's size and it runs right to left", async () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <ImageField label="الصورة" upload={async () => "/u.png"} />
      </Arabic>
    ));
    const choose = screen.getByRole("button", { name: "Choose an image" });
    expect(wears(choose, touch.target)).toBe(true);
  });

  test("takes a class per part", async () => {
    render(() => (
      <ImageField
        class="mine"
        label="Logo"
        defaultValue="/a.png"
        upload={async () => "/b.png"}
        classes={{ root: "r", preview: "p", actions: "a", body: "b" }}
      />
    ));
    const root = document.querySelector('[data-slot="image-field"]');
    expect(root?.classList.contains("r")).toBe(true);
    expect(root?.classList.contains("mine")).toBe(true);
    for (const [slot, cls] of [
      ["image-field-preview", "p"],
      ["image-field-actions", "a"],
      ["image-field-body", "b"],
    ] as const) {
      expect(document.querySelector(`[data-slot="${slot}"]`)?.classList.contains(cls)).toBe(true);
    }
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { ImageField } from "${HERE}/image-field.tsx";
      export function Page() {
        return <ImageField label="Logo" defaultValue="/logo.png" upload={async () => "/x.png"} />;
      }
    `);
    expect(result.container.querySelector("img")?.getAttribute("src")).toBe("/logo.png");
    result.unmount();
  });
});
