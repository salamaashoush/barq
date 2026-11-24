import { Grid } from "@barqjs/arc";
import { CodeEditor } from "@barqjs/arc/code";

import { SNIPPETS } from "../../data/snippets.ts";

export default function CodeEditorStates() {
  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={4}>
      <CodeEditor label="Read-only" language="sql" defaultValue={SNIPPETS["sql"]} readOnly />
      <CodeEditor
        label="Empty, with a placeholder"
        language="json"
        placeholder={'{ "region": "eu-west-1" }'}
        minHeight={140}
      />
      <CodeEditor
        label="Invalid"
        description="replicas must be a number."
        invalid
        language="yaml"
        defaultValue={"replicas: three\nregion: eu-west-1\n"}
      />
      <CodeEditor
        label="Wrapped, no line numbers, tab size 4"
        language="python"
        lineNumbers={false}
        wrap
        tabSize={4}
        defaultValue={SNIPPETS["python"]}
        maxHeight={200}
      />
    </Grid>
  );
}
