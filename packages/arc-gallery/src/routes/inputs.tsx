import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/inputs/catalog.ts";
import { demos } from "../examples/inputs/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/inputs")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Inputs and pickers" },
  head: { meta: [{ title: "Inputs and pickers | arc gallery" }] },
});
