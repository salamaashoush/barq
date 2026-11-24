import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/overlays/catalog.ts";
import { demos } from "../examples/overlays/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/overlays")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Overlays" },
  head: { meta: [{ title: "Overlays | arc gallery" }] },
});
