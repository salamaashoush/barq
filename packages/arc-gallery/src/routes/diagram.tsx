import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/diagram/catalog.ts";
import { demos } from "../examples/diagram/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/diagram")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Diagram" },
  head: { meta: [{ title: "Diagram | arc gallery" }] },
});
