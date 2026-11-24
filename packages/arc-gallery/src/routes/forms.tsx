import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/forms/catalog.ts";
import { demos } from "../examples/forms/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/forms")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Forms" },
  head: { meta: [{ title: "Forms | arc gallery" }] },
});
