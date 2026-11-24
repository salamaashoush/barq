import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/formatting/catalog.ts";
import { demos } from "../examples/formatting/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/formatting")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Formatting" },
  head: { meta: [{ title: "Formatting | arc gallery" }] },
});
