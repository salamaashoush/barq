import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/layouts/catalog.ts";
import { demos } from "../examples/layouts/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/layouts")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Page layouts" },
  head: { meta: [{ title: "Page layouts | arc gallery" }] },
});
