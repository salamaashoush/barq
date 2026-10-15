import { serverRpc } from "../src/index.ts";
import { serveBarq } from "../src/serve.ts";
import { mount } from "../src/server.ts";

mount(
  "boom",
  serverRpc<undefined, null>(
    { id: "boom" },
    {
      validator: null,
      middleware: [],
      handler: () => {
        throw new Error('relation "users_private" does not exist');
      },
    },
  ),
);

serveBarq({
  port: Number(process.env.PORT),
  hostname: "127.0.0.1",
  silent: true,
  fetch: (request) => {
    if (new URL(request.url).pathname !== "/report") return new Response("ok");
    throw new Error('relation "reports_private" does not exist');
  },
});
