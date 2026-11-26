import { type Child, For, Show, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  motion,
  place,
  plainList,
  rounded,
  space,
  type,
} from "../style/index.ts";
import { expandChevron } from "./expand-chevron.ts";
import { type ArcMessages, ENGLISH, useArcMessages } from "./messages.ts";

/** A JSON Schema, or an OpenAPI schema object: the keywords this reads, and any others. */
export interface JsonSchema {
  type?: string | readonly string[];
  title?: string;
  description?: string;
  properties?: Readonly<Record<string, JsonSchema>>;
  required?: readonly string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  enum?: readonly unknown[];
  const?: unknown;
  default?: unknown;
  example?: unknown;
  examples?: readonly unknown[];
  format?: string;
  oneOf?: readonly JsonSchema[];
  anyOf?: readonly JsonSchema[];
  allOf?: readonly JsonSchema[];
  $ref?: string;
  $defs?: Readonly<Record<string, JsonSchema>>;
  definitions?: Readonly<Record<string, JsonSchema>>;
  deprecated?: boolean;
  readonly [keyword: string]: unknown;
}

/** Schemas a `$ref` names, by the last segment of the reference. */
export type JsonSchemaDefs = Readonly<Record<string, JsonSchema>>;

interface Resolved {
  schema: JsonSchema;
  /** The name it was reached by, through a `$ref`. */
  name?: string;
}

interface Shape {
  properties: [string, JsonSchema][];
  required: Set<string>;
  variants: JsonSchema[];
}

function list(value: readonly JsonSchema[] | undefined): JsonSchema[] {
  return Array.isArray(value) ? [...value] : [];
}

function isNull(schema: JsonSchema): boolean {
  return schema.type === "null";
}

function choices(schema: JsonSchema): JsonSchema[] {
  return [...list(schema.oneOf), ...list(schema.anyOf)].filter((one) => !isNull(one));
}

function typesOf(schema: JsonSchema): string[] {
  if (Array.isArray(schema.type)) return [...(schema.type as readonly string[])];
  return typeof schema.type === "string" ? [schema.type] : [];
}

/** `schema` with its `$ref` followed. A description beside a `$ref` is kept, as OpenAPI 3.1 allows. */
function resolve(schema: JsonSchema, defs: JsonSchemaDefs): Resolved {
  if (schema.$ref === undefined) return { schema };
  const name = schema.$ref.split("/").at(-1) ?? schema.$ref;
  const target = defs[name] ?? {};
  return {
    schema:
      schema.description === undefined ? target : { ...target, description: schema.description },
    name,
  };
}

/** An object schema's properties with its `allOf` merged in, and the `oneOf` it carries. */
function shapeOf(schema: JsonSchema, defs: JsonSchemaDefs, depth = 0): Shape {
  const properties: [string, JsonSchema][] = Object.entries(schema.properties ?? {});
  const required = new Set<string>(schema.required ?? []);
  // A union of one shape, such as a reference that may be null, is that shape.
  let found = choices(schema).length > 1 ? choices(schema) : [];
  if (depth < 8) {
    for (const member of list(schema.allOf)) {
      const inner = shapeOf(resolve(member, defs).schema, defs, depth + 1);
      properties.push(...inner.properties);
      for (const name of inner.required) required.add(name);
      if (inner.variants.length > 0) found = inner.variants;
    }
  }
  return { properties, required, variants: found };
}

interface OpenApiComponents {
  schemas?: JsonSchemaDefs;
}

/** The schemas a `$ref` can name in `root`: its `$defs`, `definitions`, or an OpenAPI document's components. */
export function jsonSchemaDefs(root: JsonSchema): JsonSchemaDefs {
  const components = root.components as OpenApiComponents | undefined;
  return { ...components?.schemas, ...root.definitions, ...root.$defs };
}

/**
 * What a value is, in a few words: `string`, `integer or null`, `array of
 * Check`, `map of string`, `string (uuid)`. A named object is its name.
 */
export function jsonSchemaTypeLabel(
  schema: JsonSchema,
  defs: JsonSchemaDefs = jsonSchemaDefs(schema),
  messages: ArcMessages = ENGLISH,
  seen: readonly string[] = [],
): string {
  const { schema: resolved, name } = resolve(schema, defs);
  if (
    name !== undefined &&
    (resolved.properties !== undefined ||
      resolved.allOf !== undefined ||
      resolved.oneOf !== undefined)
  ) {
    return name;
  }
  if (name !== undefined && seen.includes(name)) return name;
  const trail = name === undefined ? seen : [...seen, name];
  const types = typesOf(resolved);
  const nullable =
    types.includes("null") ||
    list(resolved.oneOf).some(isNull) ||
    list(resolved.anyOf).some(isNull);
  const main = types.filter((one) => one !== "null");
  let label: string;
  const extra = resolved.additionalProperties;
  if (main[0] === "array" && resolved.items !== undefined) {
    label = messages.schemaArrayOf(jsonSchemaTypeLabel(resolved.items, defs, messages, trail));
  } else if (main[0] === "object" && typeof extra === "object") {
    label = messages.schemaMapOf(jsonSchemaTypeLabel(extra, defs, messages, trail));
  } else if (main.length > 0) {
    label = messages.schemaEither(main);
  } else {
    const options = choices(resolved);
    const first = options[0];
    label =
      options.length === 1 && first !== undefined
        ? jsonSchemaTypeLabel(first, defs, messages, trail)
        : (name ?? (options.length > 0 ? messages.schemaOneOfSeveral : messages.schemaAny));
  }
  if (resolved.format !== undefined && main.length === 1 && main[0] !== "object") {
    label = `${label} (${resolved.format})`;
  }
  return nullable ? messages.schemaOrNull(label) : label;
}

/** What a field holds that opens in place: an object's fields, an array's items', a map's values'. */
function nested(
  schema: JsonSchema,
  defs: JsonSchemaDefs,
  seen: readonly string[],
): Resolved | undefined {
  const { schema: resolved, name } = resolve(schema, defs);
  if (name !== undefined && seen.includes(name)) return undefined;
  const shape = shapeOf(resolved, defs);
  if (shape.properties.length > 0 || shape.variants.length > 0) return { schema: resolved, name };
  const trail = name === undefined ? seen : [...seen, name];
  const extra = resolved.additionalProperties;
  const inner = resolved.items ?? (typeof extra === "object" ? extra : undefined);
  if (inner !== undefined) return nested(inner, defs, trail);
  const options = choices(resolved);
  const only = options[0];
  if (options.length === 1 && only !== undefined) return nested(only, defs, trail);
  return undefined;
}

/** A variant's name: its one-valued property (`kind = "http"`), or its title. */
function variantLabel(variant: JsonSchema, defs: JsonSchemaDefs, messages: ArcMessages): string {
  const { schema, name } = resolve(variant, defs);
  for (const [key, property] of shapeOf(schema, defs).properties) {
    const values = resolve(property, defs).schema;
    if (Array.isArray(values.enum) && values.enum.length === 1) {
      return `${key} = ${JSON.stringify(values.enum[0])}`;
    }
    if (values.const !== undefined) return `${key} = ${JSON.stringify(values.const)}`;
  }
  return schema.title ?? name ?? messages.schemaVariant;
}

const SAMPLE_STRINGS: Readonly<Record<string, string>> = {
  uuid: "0192a3b4-0000-7000-8000-000000000000",
  "date-time": "2026-01-01T09:00:00Z",
  date: "2026-01-01",
  time: "09:00:00",
  email: "ada@example.com",
  uri: "https://example.com/",
  url: "https://example.com/",
  hostname: "example.com",
  ipv4: "192.0.2.1",
  ipv6: "2001:db8::1",
};

/**
 * A value shaped like `schema`, for an example request or response: its
 * `example`, then the first of its `examples`, `enum` or `const`, then its
 * `default`, then the first variant; an object holds its required fields,
 * three levels deep, and a format gives a string its shape.
 */
export function jsonSchemaExample(
  schema: JsonSchema,
  defs: JsonSchemaDefs = jsonSchemaDefs(schema),
  depth = 0,
  seen: readonly string[] = [],
): unknown {
  const { schema: resolved, name } = resolve(schema, defs);
  if (name !== undefined && seen.includes(name)) return {};
  const trail = name === undefined ? seen : [...seen, name];
  if (resolved.example !== undefined) return resolved.example;
  if (Array.isArray(resolved.examples) && resolved.examples.length > 0) return resolved.examples[0];
  if (resolved.const !== undefined) return resolved.const;
  if (Array.isArray(resolved.enum)) return resolved.enum.find((one) => one !== null) ?? null;
  if (resolved.default !== undefined && resolved.default !== null) return resolved.default;
  const shape = shapeOf(resolved, defs);
  if (shape.properties.length > 0 || shape.variants.length > 0) {
    if (depth > 3) return {};
    const value: Record<string, unknown> = {};
    const first = shape.variants[0];
    const variant = first === undefined ? undefined : shapeOf(resolve(first, defs).schema, defs);
    for (const [key, property] of [...(variant?.properties ?? []), ...shape.properties]) {
      if (!shape.required.has(key) && variant?.required.has(key) !== true) continue;
      value[key] = jsonSchemaExample(property, defs, depth + 1, trail);
    }
    return value;
  }
  const options = choices(resolved);
  const only = options[0];
  if (only !== undefined) return jsonSchemaExample(only, defs, depth, trail);
  switch (typesOf(resolved).find((one) => one !== "null")) {
    case "string":
      return SAMPLE_STRINGS[resolved.format ?? ""] ?? "string";
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return depth > 3 ? [] : [jsonSchemaExample(resolved.items ?? {}, defs, depth + 1, trail)];
    case "object":
      return {};
    default:
      return null;
  }
}

export const jsonSchemaFieldsStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero),
    list: arc(plainList, layout.column),
    field: arc(layout.column, gap[1], edge.bottom, {
      paddingBlock: space.x3,
      scrollMarginBlockStart: space.x16,
      ":last-child": { borderBottomWidth: "0px" },
    }),
    head: arc(layout.row, layout.wrap, gap[2], { alignItems: "baseline" }),
    name: arc(type.mono, type.sm, type.medium, fg.default, { overflowWrap: "anywhere" }),
    type: arc(type.mono, type.meta, fg.faint),
    required: arc(type.meta),
    deprecated: arc(type.meta, { textDecorationLine: "line-through" }),
    description: arc(type.body, fg.muted, layout.flush, { maxWidth: "72ch" }),
    values: arc(type.meta, layout.flush, { maxWidth: "72ch" }),
    value: arc(type.mono),
    toggle: arc(
      bg.transparent,
      edge.none,
      place.unpadded,
      interaction.pressable,
      layout.inlineRow,
      gap[1],
      glyph.sm,
      type.meta,
      fg.muted,
      focus.visible,
      interaction.hoverText,
      rounded.sm,
      {
        alignSelf: "flex-start",
        marginBlockStart: space.x1,
      },
      motion.colours,
    ),
    nested: arc(edge.all, rounded.md, { paddingInline: space.x4, marginBlockStart: space.x1 }),
    variants: arc(layout.column, gap[2], edge.top, {
      paddingBlock: space.x3,
      ":first-child": { borderTopWidth: "0px" },
    }),
    variantsIntro: arc(type.meta, layout.flush),
    plain: arc(type.meta, layout.flush, { paddingBlock: space.x3 }),
  },
});

type Slots = ReturnType<typeof jsonSchemaFieldsStyles>;

export interface JsonSchemaFieldsProps extends Customisable<Slots> {
  schema: JsonSchema;
  /** What a `$ref` names. @default the schema's own `$defs`, `definitions` or `components.schemas` */
  defs?: JsonSchemaDefs;
  /** An id for each top-level field, so a link can point at it: `(name) => \`key-${name}\``. */
  anchor?: (name: string) => string;
  /** Draws a description, as inline Markdown say. @default the text as it is */
  renderDescription?: (text: string) => Child;
}

interface Context {
  defs: JsonSchemaDefs;
  classes: Slots;
  messages: ArcMessages;
  renderDescription: ((text: string) => Child) | undefined;
}

interface FieldsProps {
  schema: JsonSchema;
  context: Context;
  seen: readonly string[];
  anchor?: ((name: string) => string) | undefined;
}

interface FieldProps {
  name: string;
  schema: JsonSchema;
  required: boolean;
  context: Context;
  seen: readonly string[];
  id?: string | undefined;
}

interface DisclosureProps {
  label: Child;
  context: Context;
  children: () => Child;
}

/** A button that opens what is under it, which is drawn only while open: a schema's nesting can be deep. */
function Disclosure(props: DisclosureProps) {
  const [open, setOpen] = createSignal(false);
  return (
    <>
      <button
        type="button"
        class={props.context.classes.toggle}
        data-slot="json-schema-toggle"
        aria-expanded={open() ? "true" : "false"}
        onClick={() => setOpen(!open())}
      >
        <ChevronRight class={expandChevron} aria-hidden="true" />
        {props.label}
      </button>
      <Show when={open()}>
        <div class={props.context.classes.nested} data-slot="json-schema-nested">
          {props.children()}
        </div>
      </Show>
    </>
  );
}

interface DescriptionProps {
  text: string;
  context: Context;
}

function withName(seen: readonly string[], name: string | undefined): readonly string[] {
  return name === undefined ? seen : [...seen, name];
}

function Description(props: DescriptionProps) {
  return (
    <p class={props.context.classes.description} data-slot="json-schema-description">
      {props.context.renderDescription?.(props.text) ?? props.text}
    </p>
  );
}

function Field(props: FieldProps) {
  const ctx = props.context;
  function resolved(): JsonSchema {
    return resolve(props.schema, ctx.defs).schema;
  }
  function values(): unknown[] {
    const schema = resolved();
    if (schema.const !== undefined) return [schema.const];
    return Array.isArray(schema.enum) ? schema.enum.filter((one) => one !== null) : [];
  }
  function inner(): Resolved | undefined {
    return nested(props.schema, ctx.defs, props.seen);
  }
  function toggleLabel(): string {
    const found = inner();
    if (found === undefined) return "";
    const shape = shapeOf(found.schema, ctx.defs);
    return shape.properties.length === 0 && shape.variants.length > 0
      ? ctx.messages.schemaShowShapes(shape.variants.length)
      : ctx.messages.schemaShowProperties(shape.properties.length);
  }
  return (
    <li id={props.id} class={ctx.classes.field} data-slot="json-schema-field">
      <div class={ctx.classes.head}>
        <code class={ctx.classes.name} data-slot="json-schema-name" dir="ltr">
          {props.name}
        </code>
        <span class={ctx.classes.type} data-slot="json-schema-type" dir="ltr">
          {jsonSchemaTypeLabel(props.schema, ctx.defs, ctx.messages)}
        </span>
        <Show when={props.required}>
          <span class={ctx.classes.required} data-slot="json-schema-required">
            {ctx.messages.schemaRequired}
          </span>
        </Show>
        <Show when={resolved().deprecated === true}>
          <span class={ctx.classes.deprecated} data-slot="json-schema-deprecated">
            {ctx.messages.schemaDeprecated}
          </span>
        </Show>
      </div>
      <Show when={resolved().description}>
        {(text: () => string) => <Description text={text()} context={ctx} />}
      </Show>
      <Show when={values().length > 0}>
        <p class={ctx.classes.values} data-slot="json-schema-values">
          {ctx.messages.schemaOneOf}{" "}
          <For each={values()}>
            {(value: unknown, index: () => number) => (
              <>
                {index() > 0 ? ", " : ""}
                <code class={ctx.classes.value} dir="ltr">
                  {JSON.stringify(value)}
                </code>
              </>
            )}
          </For>
        </p>
      </Show>
      <Show when={resolved().default !== undefined && resolved().default !== null}>
        <p class={ctx.classes.values} data-slot="json-schema-default">
          {ctx.messages.schemaDefault}{" "}
          <code class={ctx.classes.value} dir="ltr">
            {JSON.stringify(resolved().default)}
          </code>
        </p>
      </Show>
      <Show when={inner()}>
        {(found: () => Resolved) => (
          <Disclosure label={toggleLabel()} context={ctx}>
            {() => (
              <Fields
                schema={found().schema}
                context={ctx}
                seen={withName(props.seen, found().name)}
              />
            )}
          </Disclosure>
        )}
      </Show>
    </li>
  );
}

function Fields(props: FieldsProps) {
  const ctx = props.context;
  function root(): Resolved {
    return resolve(props.schema, ctx.defs);
  }
  function trail(): readonly string[] {
    const name = root().name;
    return name === undefined ? props.seen : [...props.seen, name];
  }
  function shape(): Shape {
    return shapeOf(root().schema, ctx.defs);
  }
  function ordered(): [string, JsonSchema][] {
    const { properties, required } = shape();
    return [
      ...properties.filter(([key]) => required.has(key)),
      ...properties.filter(([key]) => !required.has(key)),
    ];
  }
  function through(): Resolved | undefined {
    if (ordered().length > 0 || shape().variants.length > 0) return undefined;
    return nested(props.schema, ctx.defs, props.seen);
  }
  return (
    <Show
      when={ordered().length > 0 || shape().variants.length > 0}
      fallback={
        <Show
          when={through()}
          fallback={
            <p class={ctx.classes.plain} data-slot="json-schema-plain">
              {jsonSchemaTypeLabel(props.schema, ctx.defs, ctx.messages)}
            </p>
          }
        >
          {(found: () => Resolved) => (
            <Fields schema={found().schema} context={ctx} seen={trail()} anchor={props.anchor} />
          )}
        </Show>
      }
    >
      <Show when={ordered().length > 0}>
        <ul class={ctx.classes.list} data-slot="json-schema-fields">
          <For each={ordered()}>
            {(entry: [string, JsonSchema]) => (
              <Field
                name={entry[0]}
                schema={entry[1]}
                required={shape().required.has(entry[0])}
                context={ctx}
                seen={trail()}
                id={props.anchor?.(entry[0])}
              />
            )}
          </For>
        </ul>
      </Show>
      <Show when={shape().variants.length > 0}>
        <div class={ctx.classes.variants} data-slot="json-schema-variants">
          <p class={ctx.classes.variantsIntro}>{ctx.messages.schemaVariantsIntro}</p>
          <For each={shape().variants}>
            {(variant: JsonSchema) => (
              <Disclosure
                label={
                  <code class={ctx.classes.value} dir="ltr">
                    {variantLabel(variant, ctx.defs, ctx.messages)}
                  </code>
                }
                context={ctx}
              >
                {() => <Fields schema={variant} context={ctx} seen={trail()} />}
              </Disclosure>
            )}
          </For>
        </div>
      </Show>
    </Show>
  );
}

/**
 * A JSON Schema's fields as a list to read: each name, what it holds in a
 * few words, whether it is required, what it is for, the values it takes and
 * its default. Required fields come first. A nested object, an array's items,
 * a map's values and the shapes of a `oneOf` open in place, each variant
 * named by its one-valued property (`kind = "http"`) or its title.
 *
 * ```tsx
 * <JsonSchemaFields schema={configSchema} anchor={(name) => `key-${name}`} />
 * ```
 *
 * `allOf` members are merged and a `$ref` is followed, keeping a description
 * written beside it; a schema that refers to itself opens once and then is
 * named, so a cycle ends. `jsonSchemaExample` writes a value shaped like it.
 */
export function JsonSchemaFields(props: JsonSchemaFieldsProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(jsonSchemaFieldsStyles(), props.classes);
  }
  function context(): Context {
    return {
      defs: props.defs ?? jsonSchemaDefs(props.schema),
      classes: cls(),
      messages: messages(),
      renderDescription: props.renderDescription,
    };
  }
  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="json-schema-fields-root">
      <Fields schema={props.schema} context={context()} seen={[]} anchor={props.anchor} />
    </div>
  );
}
