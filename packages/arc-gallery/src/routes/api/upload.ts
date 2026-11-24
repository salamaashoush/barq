import { createFileRoute } from "@barqjs/router";

/**
 * Takes one file as `multipart/form-data` under `file` and answers with what
 * it kept. Nothing is stored: the body is read to its end and dropped. A file
 * whose name holds "fail" is refused, so an upload queue's error row can be seen.
 */
export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) {
          return Response.json({ error: "Send the file under `file`." }, { status: 400 });
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (file.name.toLowerCase().includes("fail")) {
          return Response.json(
            { error: `${file.name} was refused by the server.` },
            { status: 422 },
          );
        }
        const size = (await file.arrayBuffer()).byteLength;
        return Response.json({ id: crypto.randomUUID(), name: file.name, size });
      },
    },
  },
});
