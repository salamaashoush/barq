import { For, createSignal } from "@barqjs/core";
import {
  Bytes,
  FileDropZone,
  type FileRejection,
  FileUpload,
  Grid,
  Stack,
  Text,
  type UploadContext,
  UploadQueue,
  useUploadQueue,
} from "@barqjs/arc";

interface Uploaded {
  id: string;
  name: string;
  size: number;
}

/** Posts one file as multipart, reporting progress as the browser sends it. */
function upload(file: File, { onProgress, signal }: UploadContext): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/upload");
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve(request.response as Uploaded);
      else reject(new Error(`The server answered ${String(request.status)}.`));
    });
    request.addEventListener("error", () =>
      reject(new Error("The upload could not reach the server.")),
    );
    signal.addEventListener("abort", () => request.abort());
    const body = new FormData();
    body.append("file", file);
    request.send(body);
  });
}

export default function Uploads() {
  const [stored, setStored] = createSignal<readonly Uploaded[]>([]);
  const [rejected, setRejected] = createSignal<readonly FileRejection[]>([]);
  const queue = useUploadQueue({
    upload,
    concurrency: 1,
    onUploaded: (item) => setStored([...stored(), item.result as Uploaded]),
  });

  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={8}>
      <Stack gap={3}>
        <Text weight="medium">FileUpload: images and PDFs up to 5 MB</Text>
        <FileUpload accept={["image/*", ".pdf"]} maxSize={5_000_000} maxFiles={4} upload={upload} />
      </Stack>

      <Stack gap={3}>
        <Text weight="medium">A drop zone and a queue of your own</Text>
        <FileDropZone
          title="Drop a CSV of customers"
          accept={[".csv", "text/csv"]}
          maxSize={20_000_000}
          multiple={false}
          onFiles={(files) => queue.add(files)}
          onReject={setRejected}
        />
        <UploadQueue queue={queue} />
        <Text size="xs" color="muted">
          {rejected().length === 0 ? "" : `${String(rejected().length)} file refused.`}
        </Text>
        <Stack gap={1}>
          <For each={stored()}>
            {(file) => (
              <Text size="xs" mono>
                {file.id.slice(0, 8)} {file.name} <Bytes value={file.size} />
              </Text>
            )}
          </For>
        </Stack>
      </Stack>

      <FileDropZone
        onFiles={() => undefined}
        isDisabled
        title="Uploads are paused"
        hint="The workspace is read-only."
      />
    </Grid>
  );
}
