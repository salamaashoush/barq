import { afterEach, describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, fireEvent, render, screen, user, waitFor } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import {
  FileDropZone,
  FileUpload,
  type UploadContext,
  type UploadQueueApi,
  UploadQueue,
  checkFiles,
  fileDropZoneStyles,
  formatBytes,
  useUploadQueue,
} from "./file-upload.tsx";
import { ENGLISH } from "./messages.ts";

afterEach(() => destroyAnnouncer());

function file(name: string, size: number, type: string): File {
  return new File([new Uint8Array(size)], name, { type });
}

function picker(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

function pick(files: File[]): void {
  Object.defineProperty(picker(), "files", { configurable: true, value: files });
  fireEvent.change(picker());
}

/** An upload the test finishes, fails or watches being aborted. */
function controllable() {
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; context: UploadContext }
  >();
  const upload = (one: File, context: UploadContext): Promise<unknown> =>
    new Promise((resolve, reject) => pending.set(one.name, { resolve, reject, context }));
  return { pending, upload };
}

describe("checkFiles", () => {
  test("holds files to their type, their size and how many", () => {
    const files = [
      file("a.png", 10, "image/png"),
      file("b.exe", 10, "application/x-msdownload"),
      file("c.pdf", 5_000_000, "application/pdf"),
      file("d.pdf", 10, "application/pdf"),
      file("e.jpg", 10, "image/jpeg"),
    ];
    const { accepted, rejected } = checkFiles(
      files,
      { accept: ["image/*", ".pdf"], maxSize: 1_000_000, maxFiles: 2 },
      ENGLISH,
      "en-US",
    );
    expect(accepted.map((one) => one.name)).toEqual(["a.png", "d.pdf"]);
    expect(rejected.map((one) => one.reason)).toEqual([
      "b.exe is not a type this accepts",
      "c.pdf is larger than 1 MB",
      "No more than 2 files at once",
    ]);
    expect(formatBytes(2_400_000, "en-US")).toBe("2.4 MB");
  });
});

describe("FileDropZone", () => {
  test("a button opens the picker, and what it picks is checked before it is handed on", async () => {
    const taken: string[][] = [];
    render(() => (
      <FileDropZone
        accept={[".pdf"]}
        maxSize={1_000_000}
        onFiles={(files) => taken.push(files.map((one) => one.name))}
      />
    ));
    await settle();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeDefined();
    expect(picker().getAttribute("accept")).toBe(".pdf");
    expect(document.querySelector('[data-slot="file-drop-zone-hint"]')?.textContent).toBe(
      "Accepts .pdf · Up to 1 MB each",
    );
    pick([file("ok.pdf", 10, "application/pdf"), file("no.png", 10, "image/png")]);
    await settle();
    expect(taken).toEqual([["ok.pdf"]]);
    expect(document.querySelector('[data-slot="file-drop-zone-errors"]')?.textContent).toBe(
      "no.png is not a type this accepts",
    );
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("is reached by Tab as a named drop target, and the picker by its button", async () => {
    render(() => <FileDropZone onFiles={() => {}} />);
    await settle();
    user.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Upload files");
    user.tab();
    expect(document.activeElement?.textContent).toBe("Choose files");
  });

  test("on a touch screen the button is the way in, and the drop line is hidden", async () => {
    let opened = 0;
    render(() => <FileDropZone onFiles={() => {}} />);
    await settle();
    picker().addEventListener("click", () => opened++);
    user.tap(screen.getByRole("button", { name: "Choose files" }));
    expect(opened).toBe(1);
    const sheet = collectCss();
    const hidden = fileDropZoneStyles()
      .title.split(" ")
      .some((one) => sheet.includes(`@media (pointer: coarse){.${one}{display:none}`));
    expect(hidden).toBe(true);
  });
});

describe("useUploadQueue and UploadQueue", () => {
  test("sends files two at a time, shows progress, and announces each one done", async () => {
    const { pending, upload } = controllable();
    let queue!: UploadQueueApi;
    render(() => {
      queue = useUploadQueue({ upload });
      return <UploadQueue queue={queue} />;
    });
    queue.add([file("a.txt", 1, "text/plain"), file("b.txt", 1, "text/plain"), file("c.txt", 1, "text/plain")]);
    await settle();
    expect(queue.items().map((item) => item.status)).toEqual(["uploading", "uploading", "queued"]);
    pending.get("a.txt")?.context.onProgress(0.5);
    await settle();
    const bar = screen.getByRole("progressbar", { name: "Uploading a.txt" });
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
    pending.get("a.txt")?.resolve({ url: "/a" });
    await waitFor(() => {
      expect(queue.items().map((item) => item.status)).toEqual(["done", "uploading", "uploading"]);
    });
    expect(queue.items()[0]?.result).toEqual({ url: "/a" });
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("cancel aborts the request, retry sends it again, remove takes it out", async () => {
    const { pending, upload } = controllable();
    let queue!: UploadQueueApi;
    render(() => {
      queue = useUploadQueue({ upload, concurrency: 1 });
      return <UploadQueue queue={queue} />;
    });
    queue.add([file("a.txt", 1, "text/plain")]);
    await settle();
    const signal = pending.get("a.txt")?.context.signal;
    await user.click(screen.getByRole("button", { name: "Cancel a.txt" }));
    await settle();
    expect(signal?.aborted).toBe(true);
    expect(queue.items()[0]?.status).toBe("cancelled");

    await user.click(screen.getByRole("button", { name: "Retry a.txt" }));
    await settle();
    expect(queue.items()[0]?.status).toBe("uploading");
    pending.get("a.txt")?.reject(new Error("Server said no"));
    await waitFor(() => expect(queue.items()[0]?.status).toBe("error"));
    await settle();
    expect(document.querySelector('[data-slot="upload-queue-meta"]')?.textContent).toContain(
      "Server said no",
    );

    const remove = screen.getByRole("button", { name: "Remove a.txt" });
    remove.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(queue.items()).toHaveLength(0);
  });

  test("sizes are written in the locale's digits", async () => {
    function Rtl(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    let queue!: UploadQueueApi;
    render(() => (
      <Rtl>
        {(() => {
          queue = useUploadQueue({ upload: () => new Promise(() => {}) });
          return <UploadQueue queue={queue} />;
        })()}
      </Rtl>
    ));
    queue.add([file("a.txt", 2_400_000, "text/plain")]);
    await settle();
    expect(document.querySelector('[data-slot="upload-queue-meta"]')?.textContent).toContain("٢٫٤");
  });
});

describe("FileUpload", () => {
  test("files picked go into its queue and up through upload", async () => {
    const sent: string[] = [];
    render(() => (
      <FileUpload
        upload={(one) => {
          sent.push(one.name);
          return Promise.resolve();
        }}
      />
    ));
    await settle();
    pick([file("a.txt", 1, "text/plain")]);
    await waitFor(() => expect(sent).toEqual(["a.txt"]));
    await settle();
    expect(document.querySelector('[data-slot="upload-queue-item"]')?.getAttribute("data-status")).toBe(
      "done",
    );
  });

  test("takes a class per part and a slot on every part", async () => {
    let queue!: UploadQueueApi;
    render(() => {
      queue = useUploadQueue({ upload: () => new Promise(() => {}) });
      return (
        <>
          <FileDropZone
            class="mine"
            hint="Anything."
            onFiles={() => {}}
            classes={{ zone: "z", icon: "i", title: "t", hint: "h", browse: "b" }}
          />
          <UploadQueue queue={queue} classes={{ root: "q", item: "it", name: "n", meta: "m" }} />
        </>
      );
    });
    queue.add([file("a.txt", 1, "text/plain")]);
    await settle();
    const by = (slot: string): Element | null => document.querySelector(`[data-slot="${slot}"]`);
    expect(by("file-drop-zone")?.classList.contains("mine")).toBe(true);
    expect(by("file-drop-zone-area")?.classList.contains("z")).toBe(true);
    expect(by("file-drop-zone-icon")?.classList.contains("i")).toBe(true);
    expect(by("file-drop-zone-title")?.classList.contains("t")).toBe(true);
    expect(by("file-drop-zone-hint")?.classList.contains("h")).toBe(true);
    expect(by("file-drop-zone-browse")?.classList.contains("b")).toBe(true);
    expect(by("upload-queue")?.classList.contains("q")).toBe(true);
    expect(by("upload-queue-item")?.classList.contains("it")).toBe(true);
    expect(by("upload-queue-name")?.classList.contains("n")).toBe(true);
    expect(by("upload-queue-meta")?.classList.contains("m")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { FileUpload } from "<arc>";
      export function Page() {
        return <FileUpload accept={["image/*"]} maxSize={5000000} upload={() => Promise.resolve()} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="file-drop-zone-hint"]')?.textContent).toBe(
      "Accepts image/* · Up to 5 MB each",
    );
    result.unmount();
  });
});
