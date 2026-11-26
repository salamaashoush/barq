import { type JsonSchema, JsonSchemaFields, Stack, jsonSchemaExample } from "@barqjs/arc";
import { CodeBlock } from "@barqjs/arc/code";

const SCHEMA: JsonSchema = {
  $ref: "#/$defs/Check",
  $defs: {
    Check: {
      type: "object",
      required: ["name", "kind", "schedule"],
      properties: {
        name: { type: "string", description: "What the check is called on the dashboard." },
        kind: { type: "string", enum: ["http", "browser", "tcp"], description: "How it runs." },
        schedule: { type: "string", default: "every 5m", description: "How often it runs." },
        locations: {
          type: "array",
          items: { type: "string" },
          description: "Where it runs from. Every location when left out.",
        },
        labels: { type: "object", additionalProperties: { type: "string" } },
        owner: { anyOf: [{ $ref: "#/$defs/Person" }, { type: "null" }] },
        timeout: { type: ["integer", "null"], format: "int32", default: 30 },
        request: {
          description: "What it sends, by its kind.",
          oneOf: [
            {
              type: "object",
              required: ["kind", "url"],
              properties: {
                kind: { const: "http" },
                url: { type: "string", format: "uri" },
                method: { type: "string", enum: ["GET", "POST", "HEAD"], default: "GET" },
              },
            },
            {
              type: "object",
              required: ["kind", "host", "port"],
              properties: {
                kind: { const: "tcp" },
                host: { type: "string", format: "hostname" },
                port: { type: "integer" },
              },
            },
          ],
        },
        retries: { type: "integer", deprecated: true, description: "Use `attempts` instead." },
      },
    },
    Person: {
      type: "object",
      required: ["email"],
      properties: {
        email: { type: "string", format: "email" },
        name: { type: "string" },
      },
    },
  },
};

export default function JsonSchemaExample() {
  return (
    <Stack gap={6}>
      <JsonSchemaFields schema={SCHEMA} anchor={(name) => `key-${name}`} />
      <CodeBlock
        filename="Example request"
        language="json"
        code={JSON.stringify(jsonSchemaExample(SCHEMA), null, 2)}
      />
    </Stack>
  );
}
