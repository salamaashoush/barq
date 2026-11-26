import { CodeBlock } from "@barqjs/arc/code";
import { FileExplorer, Grid, Stack, Text, virtualFs } from "@barqjs/arc";
import { createSignal } from "@barqjs/core";

import { WORKSPACE } from "./data.ts";

export default function FileExplorerExample() {
  const fs = virtualFs(WORKSPACE);
  const [open, setOpen] = createSignal<string | undefined>("src/main.calc");
  const [log, setLog] = createSignal<string[]>([]);
  function heard(line: string): void {
    setLog([line, ...log()].slice(0, 4));
  }
  return (
    <Grid columns={{ base: 1, md: 2 }} gap={6}>
      <Stack gap={3}>
        <FileExplorer
          fs={fs}
          title="Calculator"
          activePath={open()}
          onOpen={setOpen}
          dirtyPaths={["src/rates.calc"]}
          onCreate={(path, kind) => heard(`made ${kind} ${path}`)}
          onMove={(from, to) => {
            heard(`moved ${from} to ${to}`);
            const current = open();
            if (current !== undefined && (current === from || current.startsWith(`${from}/`))) {
              setOpen(to + current.slice(from.length));
            }
          }}
          onDelete={(path) => heard(`deleted ${path}`)}
        />
        <Text size="sm" color="muted">
          {open() === undefined ? "Nothing open" : `Open: ${open() ?? ""}`}
        </Text>
        <Text size="sm" color="muted">
          {log().join(" · ")}
        </Text>
        <FileExplorer fs={virtualFs({ "README.md": "" })} title="Shared with you" readOnly />
        <FileExplorer fs={virtualFs()} title="New project" empty="No files yet. Add one above." />
      </Stack>
      <CodeBlock
        filename="workspace.json"
        language="json"
        code={JSON.stringify(fs.toJSON(), null, 2)}
        maxHeight={420}
      />
    </Grid>
  );
}
