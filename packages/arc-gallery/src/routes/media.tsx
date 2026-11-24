import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/media/catalog.ts";
import { demos } from "../examples/media/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/media")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Media" },
  head: { meta: [{ title: "Media | arc gallery" }] },
});
