import { For, Show, type Incoming } from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";

import "../theme/layers.ts";
import { text } from "../lib/shared-text.ts";
import { uiVariants } from "../lib/atoms.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Label, type LabelProps } from "./label.tsx";
import { Separator } from "./separator.tsx";

const ui = layer("barq.ui");

const fieldSet = ui({
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 6)",
  ':has(> [data-slot="checkbox-group"])': {
    gap: "calc(var(--spacing) * 3)",
  },
  ':has(> [data-slot="radio-group"])': {
    gap: "calc(var(--spacing) * 3)",
  },
});

export type FieldLegendVariant = "legend" | "label";

export const fieldLegendVariants = uiVariants({
  base: ui(text.medium, {
    marginBottom: "calc(var(--spacing) * 3)",
  }),
  variants: {
    variant: {
      legend: ui({
        fontSize: "var(--text-base)",
        lineHeight: "var(--ui-leading, var(--text-base--line-height))",
      }),
      label: ui(text.sm),
    },
  },
  defaults: { variant: "legend" },
});

const fieldGroup = ui({
  containerType: "inline-size",
  containerName: "field-group",
  display: "flex",
  width: "100%",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 7)",
  '& > [data-slot="field-group"]': {
    gap: "calc(var(--spacing) * 4)",
  },
});

export type FieldOrientation = "vertical" | "horizontal" | "responsive";

export const fieldVariants = uiVariants({
  base: ui({
    display: "flex",
    width: "100%",
    gap: "calc(var(--spacing) * 3)",
    "[data-invalid]": {
      color: "var(--destructive)",
    },
  }),
  variants: {
    orientation: {
      vertical: ui({
        flexDirection: "column",
        "& > *": {
          width: "100%",
        },
      }),
      horizontal: ui({
        flexDirection: "row",
        alignItems: "center",
        ':has(> [data-slot="field-content"])': {
          alignItems: "flex-start",
        },
        '& > [data-slot="field-label"]': {
          flex: "auto",
        },
        ':has(> [data-slot="field-content"]) > [role="checkbox"], &:has(> [data-slot="field-content"]) [role="radio"]':
          {
            marginTop: "1px",
          },
      }),
      responsive: ui({
        flexDirection: "column",
        "& > *": {
          width: "100%",
        },
        "@container field-group (width >= 28rem)": {
          "&": {
            flexDirection: "row",
            alignItems: "center",
          },
          ':has(> [data-slot="field-content"])': {
            alignItems: "flex-start",
          },
          "& > *": {
            width: "auto",
          },
          '& > [data-slot="field-label"]': {
            flex: "auto",
          },
          ':has(> [data-slot="field-content"]) > [role="checkbox"], &:has(> [data-slot="field-content"]) [role="radio"]':
            {
              marginTop: "1px",
            },
        },
      }),
    },
  },
  defaults: { orientation: "vertical" },
});

const fieldContent = ui({
  display: "flex",
  flex: "1",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 1.5)",
  "--ui-leading": "var(--leading-snug)",
  lineHeight: "var(--leading-snug)",
});

const fieldLabel = ui({
  display: "flex",
  width: "fit-content",
  gap: "calc(var(--spacing) * 2)",
  "--ui-leading": "var(--leading-snug)",
  lineHeight: "var(--leading-snug)",
  ":has(:is([data-selected]))": {
    borderColor: "var(--primary)",
    backgroundColor: "var(--primary)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--primary) 5%, transparent)",
    },
  },
  ':has(> [data-slot="field"])': {
    width: "100%",
    flexDirection: "column",
    borderRadius: "calc(var(--radius) - 2px)",
    borderStyle: "var(--ui-border-style)",
    borderWidth: "1px",
  },
  ":is(.dark *):has(:is([data-selected]))": {
    backgroundColor: "var(--primary)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--primary) 10%, transparent)",
    },
  },
  '& > [data-slot="field"]': {
    padding: "calc(var(--spacing) * 4)",
  },
  '[data-slot="field"][data-disabled] &': {
    opacity: "50%",
  },
});

const fieldTitle = ui(text.medium, {
  display: "flex",
  width: "fit-content",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  fontSize: "var(--text-sm)",
  lineHeight: firstThatWorks(
    "var(--leading-snug)",
    "var(--ui-leading, var(--text-sm--line-height))",
  ),
  "--ui-leading": "var(--leading-snug)",
  '[data-slot="field"][data-disabled] &': {
    opacity: "50%",
  },
});

const fieldDescription = ui({
  fontSize: "var(--text-sm)",
  lineHeight: firstThatWorks(
    "var(--leading-normal)",
    "var(--ui-leading, var(--text-sm--line-height))",
  ),
  "--ui-leading": "var(--leading-normal)",
  "--ui-font-weight": "var(--font-weight-normal)",
  fontWeight: "var(--font-weight-normal)",
  color: "var(--muted-foreground)",
  ":last-child": {
    marginTop: "0px",
  },
  ":nth-last-child(2)": {
    marginTop: "calc(var(--spacing) * -1)",
  },
  "& > a": {
    textDecorationLine: "underline",
    textUnderlineOffset: "4px",
  },
  "& > a:hover": {
    color: "var(--primary)",
  },
  '[data-slot="field-legend"][data-variant="legend"] + &': {
    marginTop: "calc(var(--spacing) * -1.5)",
  },
  '[data-slot="field"]:has([data-orientation="horizontal"]) &': {
    textWrap: "balance",
  },
});

const fieldSeparator = ui(text.sm, {
  position: "relative",
  marginBlock: "calc(var(--spacing) * -2)",
  height: "calc(var(--spacing) * 5)",
  '[data-slot="field-group"][data-variant="outline"] &': {
    marginBottom: "calc(var(--spacing) * -2)",
  },
});

const fieldSeparatorLine = ui({
  position: "absolute",
  inset: "0px",
  top: "calc(1 / 2 * 100%)",
});

const fieldSeparatorContent = ui({
  position: "relative",
  marginInline: "auto",
  display: "block",
  width: "fit-content",
  backgroundColor: "var(--background)",
  paddingInline: "calc(var(--spacing) * 2)",
  color: "var(--muted-foreground)",
});

const fieldError = ui(text.sm, {
  "--ui-font-weight": "var(--font-weight-normal)",
  fontWeight: "var(--font-weight-normal)",
  color: "var(--destructive)",
});

const errorList = ui({
  marginLeft: "calc(var(--spacing) * 4)",
  display: "flex",
  listStyleType: "disc",
  flexDirection: "column",
  gap: "var(--spacing)",
});

/**
 * ```tsx
 * <FieldSet>
 *   <FieldLegend>Delivery</FieldLegend>
 *   <FieldGroup>
 *     <Field>
 *       <FieldLabel for="street">Street</FieldLabel>
 *       <Input id="street" />
 *       <FieldDescription>Where the parcel goes.</FieldDescription>
 *     </Field>
 *   </FieldGroup>
 * </FieldSet>
 * ```
 */
export function FieldSet(props: Incoming<UiProps>) {
  return <fieldset {...uiProps("field-set", fieldSet, props)}>{props.children}</fieldset>;
}

export interface FieldLegendProps extends UiProps {
  /** `label` sizes it as a field label rather than a section heading. @default "legend" */
  variant?: FieldLegendVariant;
}

export function FieldLegend(props: Incoming<FieldLegendProps>) {
  const className = (): string => fieldLegendVariants({ variant: props.variant?.() });
  return (
    <legend
      {...uiProps("field-legend", className, props)}
      data-variant={props.variant?.() ?? "legend"}
    >
      {props.children}
    </legend>
  );
}

export interface FieldGroupProps extends UiProps {
  /** `outline` is the boxed group, which pulls its separators tight. */
  variant?: "outline";
}

/**
 * The container query `<Field orientation="responsive">` measures itself
 * against. A responsive field outside one never turns horizontal, which is why
 * this exists as a component rather than as a class on whatever wraps a form.
 */
export function FieldGroup(props: Incoming<FieldGroupProps>) {
  return (
    <div {...uiProps("field-group", fieldGroup, props)} data-variant={props.variant?.()}>
      {props.children}
    </div>
  );
}

export interface FieldProps extends UiProps {
  /** `responsive` is vertical until the enclosing `<FieldGroup>` is wide. @default "vertical" */
  orientation?: FieldOrientation;
  /** Colours the whole row, label included. The control's own `aria-invalid` is separate. */
  isInvalid?: boolean;
  /** Dims the label and the title. The control is disabled by its own prop. */
  isDisabled?: boolean;
}

export function Field(props: Incoming<FieldProps>) {
  const className = (): string => fieldVariants({ orientation: props.orientation?.() });
  return (
    <div
      {...uiProps("field", className, props)}
      role={props.role?.() ?? "group"}
      data-orientation={props.orientation?.() ?? "vertical"}
      data-invalid={props.isInvalid?.() === true ? "" : undefined}
      data-disabled={props.isDisabled?.() === true ? "" : undefined}
    >
      {props.children}
    </div>
  );
}

/** The column beside a checkbox or a radio, holding its title and description. */
export function FieldContent(props: Incoming<UiProps>) {
  return <div {...uiProps("field-content", fieldContent, props)}>{props.children}</div>;
}

export interface FieldLabelProps extends LabelProps {}

/** A `<Label>` that a `<Field>` can lay out, and that lights up around a chosen control. */
export function FieldLabel(props: Incoming<FieldLabelProps>) {
  return (
    <Label
      {...props}
      data-slot={props["data-slot"]?.() ?? "field-label"}
      class={ui(fieldLabel, props.class?.(), props.className?.())}
    />
  );
}

/** What a `<Field>` is called when it has no control of its own to label. */
export function FieldTitle(props: Incoming<UiProps>) {
  return <div {...uiProps("field-title", fieldTitle, props)}>{props.children}</div>;
}

export function FieldDescription(props: Incoming<UiProps>) {
  return <p {...uiProps("field-description", fieldDescription, props)}>{props.children}</p>;
}

export interface FieldSeparatorProps extends UiProps {}

/** A rule across a `<FieldGroup>`, with an optional word sitting on it. */
export function FieldSeparator(props: Incoming<FieldSeparatorProps>) {
  const hasContent = (): boolean => props.children?.() !== undefined;
  return (
    <div
      {...uiProps("field-separator", fieldSeparator, props)}
      data-content={hasContent() ? "" : undefined}
    >
      <Separator data-slot="field-separator-line" class={fieldSeparatorLine} />
      <Show when={hasContent()}>
        <span data-slot="field-separator-content" class={fieldSeparatorContent}>
          {props.children}
        </span>
      </Show>
    </div>
  );
}

export interface FieldErrorProps extends UiProps {
  /** Rendered when there are no `children`: one message plainly, several as a list. */
  errors?: readonly ({ message?: string } | undefined)[];
}

/**
 * Renders nothing at all when there is nothing to say, so a form does not
 * reserve a row for an error that has not happened.
 *
 * Repeated messages are shown once. A schema that reports the same failure for
 * three fields at once is the ordinary case, not an edge one.
 */
export function FieldError(props: Incoming<FieldErrorProps>) {
  const messages = (): string[] => {
    const unique = new Set<string>();
    for (const error of props.errors?.() ?? []) {
      const message = error?.message;
      if (message !== undefined && message !== "") unique.add(message);
    }
    return [...unique];
  };
  const hasChildren = (): boolean => props.children?.() !== undefined;
  const isEmpty = (): boolean => !hasChildren() && messages().length === 0;

  return (
    <Show when={!isEmpty()}>
      <div {...uiProps("field-error", fieldError, props)} role={props.role?.() ?? "alert"}>
        <Show
          when={hasChildren()}
          fallback={
            <Show when={messages().length > 1} fallback={messages()[0]}>
              <ul class={errorList}>
                <For each={() => messages()}>{(message: string) => <li>{message}</li>}</For>
              </ul>
            </Show>
          }
        >
          {props.children}
        </Show>
      </div>
    </Show>
  );
}
