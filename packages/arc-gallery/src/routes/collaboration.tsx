import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/collaboration/catalog.ts";
import { demos } from "../examples/collaboration/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/collaboration")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Collaboration" },
  head: { meta: [{ title: "Collaboration | arc gallery" }] },
});
