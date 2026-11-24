import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/settings/catalog.ts";
import { demos } from "../examples/settings/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/settings")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Settings" },
  head: { meta: [{ title: "Settings | arc gallery" }] },
});
