import { createSignal } from "@barqjs/core";
import { Grid, Stack, TemplateTokenField, Text } from "@barqjs/arc";
import {
  type CodeCompletionItem,
  CodeEditor,
  type CodeIntelligence,
  codeIntelligence,
  tokenCompletions,
} from "@barqjs/arc/code";

const TOKENS = [
  { name: "BASE_URL" },
  { name: "API_TOKEN", secret: true },
  { name: "ADMIN_PASSWORD", secret: true },
  { name: "REGION", description: "eu-west-1" },
];

const COMPLETIONS: readonly CodeCompletionItem[] = [
  { label: "goto", type: "method" },
  { label: "click", type: "method" },
  { label: "fill", type: "method" },
  { label: "getByRole", type: "method" },
  { label: "url", type: "method" },
];

const DOCS: Readonly<Record<string, string>> = {
  goto: "goto(url: string): Promise<Response | null>",
  click: "click(selector: string): Promise<void>",
  fill: "fill(selector: string, value: string): Promise<void>",
  getByRole: "getByRole(role: string, options?: { name?: string }): Locator",
  url: "url(): string",
};

/**
 * A language service answered in the page, standing in for the worker an
 * app would run: completion after `page.`, a signature for each, and a
 * problem wherever `TODO` is written.
 */
const service: CodeIntelligence = {
  completions: (text, pos) =>
    Promise.resolve(text.slice(0, pos).match(/page\.\w*$/) === null ? [] : COMPLETIONS),
  details: (_text, _pos, name) =>
    Promise.resolve(
      DOCS[name] === undefined
        ? null
        : { signature: DOCS[name] ?? "", documentation: "From the check API." },
    ),
  diagnostics: (text) => {
    const found = [];
    for (const match of text.matchAll(/TODO/g)) {
      const from = match.index ?? 0;
      found.push({
        from,
        to: from + 4,
        severity: "warning" as const,
        message: "Finish this before it runs.",
      });
    }
    return Promise.resolve(found);
  },
};

const intelligence = codeIntelligence(service, { source: "Check API" });
const templates = tokenCompletions({
  trigger: "{{",
  close: "}}",
  tokens: TOKENS.map((token) => ({
    name: token.name,
    kind: token.secret === true ? "secret" : "variable",
  })),
});
const env = tokenCompletions({
  trigger: "process.env.",
  tokens: TOKENS.map((token) => ({
    name: token.name,
    kind: token.secret === true ? "secret" : "variable",
  })),
});

export default function EditorTools() {
  const [url, setUrl] = createSignal("{{BASE_URL}}/health");
  return (
    <Stack gap={6}>
      <Grid columns={{ base: 1, cqLg: 2 }} gap={4}>
        <Stack gap={1.5}>
          <Text size="sm">Type page. for completion; TODO is flagged after a pause.</Text>
          <CodeEditor
            label="Check script"
            language="typescript"
            folding
            minHeight={200}
            extensions={[intelligence, env]}
            defaultValue={
              'test("health", async ({ page }) => {\n  await page.goto(process.env.BASE_URL);\n  // TODO assert the status\n});\n'
            }
          />
        </Stack>
        <Stack gap={1.5}>
          <Text size="sm">Type {"{{"} for the names, each secret marked.</Text>
          <CodeEditor
            label="Request headers"
            language="yaml"
            lineNumbers={false}
            minHeight={200}
            extensions={templates}
            defaultValue={"Authorization: Bearer {{API_TOKEN}}\nX-Region: {{REGION}}\n"}
          />
        </Stack>
      </Grid>
      <Grid columns={{ base: 1, cqLg: 2 }} gap={4}>
        <TemplateTokenField
          label="URL"
          description="Reference a secret so its value is never shown."
          tokens={TOKENS}
          value={url()}
          onChange={setUrl}
        />
        <TemplateTokenField
          label="Proxy password"
          tokens={TOKENS}
          defaultValue="{{PROXY_PASSWORD}}"
        />
        <TemplateTokenField label="Disabled" tokens={TOKENS} defaultValue="{{REGION}}" isDisabled />
        <TemplateTokenField
          label="With an error"
          tokens={TOKENS}
          defaultValue=""
          isRequired
          errorMessage="Enter where the check sends its requests."
        />
      </Grid>
    </Stack>
  );
}
