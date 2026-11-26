import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/records/catalog.ts";
import { demos } from "../examples/records/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/records")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Lists, records and activity" },
  head: { meta: [{ title: "Lists, records and activity | arc gallery" }] },
});
