import type { UploadContext } from "@barqjs/arc";
import type { MentionCandidate } from "@barqjs/arc/editor";

import { searchEntities } from "../server/entities.ts";
import { uploadFile } from "./upload.ts";

/** People in Acme's workspace for `@`, found by the server as the reader types. */
export async function mentionPeople(
  query: string,
  context: { signal: AbortSignal },
): Promise<MentionCandidate[]> {
  const page = await searchEntities({ data: { query, kind: "people" }, signal: context.signal });
  return page.results.map((hit) => ({ id: hit.id, name: hit.label, description: hit.description }));
}

/** Sends a picture to `/api/upload`; the server keeps nothing, so it is shown from the file itself. */
export async function uploadImage(file: File, context: UploadContext): Promise<string> {
  await uploadFile(file, context);
  return URL.createObjectURL(file);
}
