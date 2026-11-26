import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/workbench/catalog.ts";
import { demos } from "../examples/workbench/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/workbench")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Workbench panels" },
  head: { meta: [{ title: "Workbench panels | arc gallery" }] },
});
