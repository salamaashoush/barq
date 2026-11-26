import { type EditorExtension, defineEditorExtension } from "./extension.ts";

export interface StoredFilesOptions {
  /** How HTML brought in from elsewhere addresses a file the app keeps: `"acme-file:"`, before the file's id. */
  scheme: string;
}

/** The file id an address names under `scheme`, or `null` for any other address. */
function idOf(address: string | null, scheme: string): string | null {
  return address !== null && address.startsWith(scheme) && address.length > scheme.length
    ? address.slice(scheme.length)
    : null;
}

/**
 * Files an app already keeps, addressed in HTML brought into a document (a
 * Word file's pictures, another system's pages) as `<scheme><id>`: a picture
 * becomes a picture block, a link a file block and a recording a recording
 * block, each holding the file by its id, its address from
 * `EditorMedia.fileUrl`. Any other address is read as it would be without it.
 */
export function storedFilesExtension(options: StoredFilesOptions): EditorExtension {
  const scheme = options.scheme;
  return defineEditorExtension({
    name: "arc/stored-files",
    html: (page) => {
      for (const image of page.querySelectorAll("img[src]")) {
        const id = idOf(image.getAttribute("src"), scheme);
        if (id === null) continue;
        image.setAttribute("data-file-id", id);
        image.setAttribute("src", "");
      }
      for (const link of page.querySelectorAll("a[href]")) {
        const id = idOf(link.getAttribute("href"), scheme);
        if (id === null) continue;
        link.setAttribute("data-file", "");
        link.setAttribute("data-file-id", id);
        link.setAttribute("href", "");
      }
      for (const media of page.querySelectorAll("audio[src], video[src]")) {
        const id = idOf(media.getAttribute("src"), scheme);
        if (id === null) continue;
        media.setAttribute("data-file-id", id);
        media.setAttribute("src", "");
      }
    },
  });
}
