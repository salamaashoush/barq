import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/fields/catalog.ts";
import { demos } from "../examples/fields/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/fields")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Form fields" },
  head: { meta: [{ title: "Form fields | arc gallery" }] },
});
