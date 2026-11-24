import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/navigation/catalog.ts";
import { demos } from "../examples/navigation/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/navigation")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Navigation" },
  head: { meta: [{ title: "Navigation | arc gallery" }] },
});
