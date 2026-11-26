import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/views/catalog.ts";
import { demos } from "../examples/views/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/views")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Table and list views" },
  head: { meta: [{ title: "Table and list views | arc gallery" }] },
});
