import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/charts/catalog.ts";
import { demos } from "../examples/charts/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/charts")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Charts" },
  head: { meta: [{ title: "Charts | arc gallery" }] },
});
