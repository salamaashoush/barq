import type { UploadContext } from "@barqjs/arc";

export interface Uploaded {
  readonly id: string;
  readonly name: string;
  readonly size: number;
}

/**
 * Sends one file to the gallery's `/api/upload` as `multipart/form-data`,
 * reporting progress as it goes. XHR rather than fetch, since only XHR
 * reports how much of a request body has been sent.
 */
export function uploadFile(file: File, { onProgress, signal }: UploadContext): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/upload");
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    request.addEventListener("load", () => {
      const body = request.response as (Uploaded & { error?: string }) | null;
      if (request.status >= 200 && request.status < 300 && body !== null) resolve(body);
      else reject(new Error(body?.error ?? `Upload failed with ${request.status}`));
    });
    request.addEventListener("error", () =>
      reject(new Error("The upload could not reach the server.")),
    );
    request.addEventListener("abort", () =>
      reject(new DOMException("Upload cancelled", "AbortError")),
    );
    signal.addEventListener("abort", () => request.abort(), { once: true });
    const form = new FormData();
    form.append("file", file);
    request.send(form);
  });
}
