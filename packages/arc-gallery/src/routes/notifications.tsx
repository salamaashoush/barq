import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/notifications/catalog.ts";
import { demos } from "../examples/notifications/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/notifications")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Notifications" },
  head: { meta: [{ title: "Notifications | arc gallery" }] },
});
