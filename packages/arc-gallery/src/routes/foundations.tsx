import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/foundations/catalog.ts";
import { demos } from "../examples/foundations/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/foundations")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Foundations" },
  head: { meta: [{ title: "Foundations | arc gallery" }] },
});
