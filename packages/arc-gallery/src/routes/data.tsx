import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/data/catalog.ts";
import { demos } from "../examples/data/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/data")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Data display" },
  head: { meta: [{ title: "Data display | arc gallery" }] },
});
