import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/example-app/catalog.ts";
import { demos } from "../examples/example-app/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/example-app")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Example app" },
  head: { meta: [{ title: "Example app | arc gallery" }] },
});
