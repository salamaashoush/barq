import * as mounts from "virtual:barq-server-fns";

void mounts;

export default {
  fetch: () => new Response("not found", { status: 404 }),
  createFetch: () => () => new Response("not found", { status: 404 }),
};
