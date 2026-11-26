import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/files/catalog.ts";
import { demos } from "../examples/files/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/files")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Files, tabs and REPL" },
  head: { meta: [{ title: "Files, tabs and REPL | arc gallery" }] },
});
