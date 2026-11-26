import { createSignal } from "@barqjs/core";
import { Grid, Stack, Text, ToggleGroup, ToggleGroupItem } from "@barqjs/arc";
import {
  CodeBlock,
  CodeEditor,
  languageForContentType,
  prettyJson,
  rangeAround,
} from "@barqjs/arc/code";

const SCRIPT = `import { expect, test } from "@acme/check";

test("checkout", async ({ page }) => {
  await page.goto("https://shop.acme.example.com");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await expect(page.getByText("Order placed")).toBeVisible();
});
`;

const FAILED_LINE = 6;

const BODIES: Readonly<Record<string, string>> = {
  "application/json":
    '{"order":"ord_8f2","total":42.5,"items":[{"sku":"mug","qty":2}],"paid":true}',
  "text/html": "<!doctype html>\n<h1>Order placed</h1>\n<p>Thanks, Ada.</p>",
  "": '<?xml version="1.0"?>\n<order id="ord_8f2"><total>42.50</total></order>',
};

const CONFIG = `[server]
address = "0.0.0.0:8080"
workers = 4

[storage]
path = "/var/lib/acme"
retain_days = 30
`;

export default function CodeExcerpt() {
  const [type, setType] = createSignal("application/json");
  function body(): string {
    return BODIES[type()] ?? "";
  }
  function language(): string | undefined {
    return languageForContentType(type(), body());
  }
  return (
    <Stack gap={6}>
      <CodeBlock
        filename="checkout.spec.ts:6"
        language="typescript"
        code={SCRIPT}
        lineNumbers
        range={rangeAround(SCRIPT, FAILED_LINE, 2)}
        marks={[{ line: FAILED_LINE, tone: "danger", label: "Failed here" }]}
      />
      <Stack gap={2}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Content type"
          value={type()}
          onValueChange={(value) => {
            if (typeof value === "string") setType(value);
          }}
        >
          <ToggleGroupItem value="application/json">JSON</ToggleGroupItem>
          <ToggleGroupItem value="text/html">HTML</ToggleGroupItem>
          <ToggleGroupItem value="">No type, sniffed</ToggleGroupItem>
        </ToggleGroup>
        <CodeBlock
          label={`Response body, ${language() ?? "plain text"}`}
          language={language()}
          code={language() === "json" ? prettyJson(body()) : body()}
          lineNumbers
          marks={language() === "json" ? [{ line: 3, tone: "info", label: "Read here" }] : []}
          maxHeight={220}
        />
      </Stack>
      <Grid columns={{ base: 1, cqLg: 2 }} gap={4}>
        <Stack gap={1.5}>
          <Text size="sm">
            An editor that folds, with the line a check complained about marked:
          </Text>
          <CodeEditor
            label="Server config"
            language="toml"
            folding
            defaultValue={CONFIG}
            marks={[{ line: 7, tone: "warning", label: "Below the minimum" }]}
          />
        </Stack>
        <Stack gap={1.5}>
          <Text size="sm">Shell is bundled too:</Text>
          <CodeEditor
            label="Start script"
            language="shell"
            folding
            defaultValue={
              '#!/bin/sh\nset -eu\nif [ -z "${API_TOKEN:-}" ]; then\n  echo "API_TOKEN is not set" >&2\n  exit 1\nfi\nexec acme serve --port 8080\n'
            }
          />
        </Stack>
      </Grid>
    </Stack>
  );
}
