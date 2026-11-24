import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/editor/catalog.ts";
import { demos } from "../examples/editor/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/editor")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Editor" },
  head: { meta: [{ title: "Editor | arc gallery" }] },
});
