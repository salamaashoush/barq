import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/metrics/catalog.ts";
import { demos } from "../examples/metrics/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/metrics")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Metrics and meters" },
  head: { meta: [{ title: "Metrics and meters | arc gallery" }] },
});
