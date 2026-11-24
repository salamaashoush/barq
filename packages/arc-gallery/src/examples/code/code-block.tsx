import { Stack, Text } from "@barqjs/arc";
import { CodeBlock, Highlight } from "@barqjs/arc/code";

import { SNIPPETS } from "../../data/snippets.ts";

export default function CodeBlockExample() {
  return (
    <Stack gap={4}>
      <CodeBlock
        filename="src/billing/overdue.ts"
        language="typescript"
        code={SNIPPETS["typescript"] ?? ""}
        lineNumbers
      />
      <CodeBlock
        filename="deploy/api-gateway.yaml"
        language="yaml"
        code={SNIPPETS["yaml"] ?? ""}
        copyLabel="Copy the manifest"
      />
      <CodeBlock language="sql" code={SNIPPETS["sql"] ?? ""} maxHeight={120} lineNumbers />
      <CodeBlock label="Terminal" code={"bun add @barqjs/arc\nbun run dev"} copyable={false} />
      <Stack gap={1.5}>
        <Text size="sm">Highlight is the code alone, with no frame, copy button or caption:</Text>
        <Highlight
          language="typescript"
          code="const late = overdue(await invoices.list({ customer: 'acme' }));"
        />
      </Stack>
      <Highlight language="python" code={SNIPPETS["python"] ?? ""} lineNumbers wrap />
    </Stack>
  );
}
