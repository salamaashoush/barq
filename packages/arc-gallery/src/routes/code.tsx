import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/code/catalog.ts";
import { demos } from "../examples/code/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/code")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Code" },
  head: { meta: [{ title: "Code | arc gallery" }] },
});
