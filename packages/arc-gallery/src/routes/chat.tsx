import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/chat/catalog.ts";
import { demos } from "../examples/chat/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/chat")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Chat" },
  head: { meta: [{ title: "Chat | arc gallery" }] },
});
