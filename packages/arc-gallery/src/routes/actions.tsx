import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/actions/catalog.ts";
import { demos } from "../examples/actions/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/actions")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Actions" },
  head: { meta: [{ title: "Actions | arc gallery" }] },
});
