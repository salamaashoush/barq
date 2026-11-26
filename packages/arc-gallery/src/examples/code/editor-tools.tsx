import { createSignal } from "@barqjs/core";
import { Grid, Stack, TemplateTokenField, Text } from "@barqjs/arc";
import { CodeEditor, languageClient, portTransport, tokenCompletions } from "@barqjs/arc/code";
import {
  type ServerContext,
  type lsp,
  offsetAt,
  positionAt,
  serveLanguageServer,
} from "@barqjs/arc/code/worker";

const TOKENS = [
  { name: "BASE_URL" },
  { name: "API_TOKEN", secret: true },
  { name: "ADMIN_PASSWORD", secret: true },
  { name: "REGION", description: "eu-west-1" },
];

const METHODS: Readonly<Record<string, string>> = {
  goto: "goto(url: string): Promise<Response | null>",
  click: "click(selector: string): Promise<void>",
  fill: "fill(selector: string, value: string): Promise<void>",
  getByRole: "getByRole(role: string, options?: { name?: string }): Locator",
  url: "url(): string",
};

function problems(text: string): lsp.Diagnostic[] {
  return [...text.matchAll(/TODO/g)].map((match) => ({
    range: {
      start: positionAt(text, match.index ?? 0),
      end: positionAt(text, (match.index ?? 0) + 4),
    },
    severity: 2,
    source: "Check API",
    message: "Finish this before it runs.",
  }));
}

/**
 * A language server in the page, standing in for the worker an app would
 * run: completion after `page.`, each method's signature as it is picked,
 * and a warning wherever `TODO` is written.
 */
function startServer() {
  const channel = new MessageChannel();
  serveLanguageServer(channel.port2, {
    capabilities: { completionProvider: { triggerCharacters: ["."], resolveProvider: true } },
    changed: (document, { notify }) =>
      notify("textDocument/publishDiagnostics", {
        uri: document.uri,
        version: document.version,
        diagnostics: problems(document.text),
      }),
    requests: {
      "textDocument/completion": (params: lsp.CompletionParams, context: ServerContext) => {
        const text = context.documents.get(params.textDocument.uri)?.text ?? "";
        const before = text.slice(0, offsetAt(text, params.position));
        if (/page\.\w*$/.exec(before) === null) return [];
        return Object.keys(METHODS).map((name): lsp.CompletionItem => ({ label: name, kind: 2 }));
      },
      "completionItem/resolve": (item: lsp.CompletionItem): lsp.CompletionItem => ({
        ...item,
        detail: METHODS[item.label],
        documentation: "From the check API.",
      }),
    },
  });
  return portTransport(channel.port1);
}

const client = languageClient({ transport: startServer, languageId: "typescript" });
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
            extensions={[client.document("file:///checks/health.ts"), env]}
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
