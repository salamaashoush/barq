import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/feedback/catalog.ts";
import { demos } from "../examples/feedback/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/feedback")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Feedback and states" },
  head: { meta: [{ title: "Feedback and states | arc gallery" }] },
});
