import { type Accessor, type Child, Show, createMemo, untrack } from "@barqjs/core";

import { useArcFormContext } from "../lib/field.tsx";

/** How one field depends on the others. Each function is handed the form's values. */
export interface FieldRule<Values> {
  /** Shown only while this holds. A hidden field's value is left out by `prune`. */
  show?: (values: Values) => boolean;
  /** Disabled while this answers a reason, which is said under the field. */
  disable?: (values: Values) => string | undefined;
  /** The least the field takes, read from other fields. */
  min?: (values: Values) => number | undefined;
  /** The most the field takes, read from other fields: a quorum is at most the locations. */
  max?: (values: Values) => number | undefined;
  /** A line under the field worked out from the values: "3 runs per interval". */
  describe?: (values: Values) => Child;
}

/** What a rule says about its field for the values the form holds now. */
export interface FieldRuleState {
  isShown: boolean;
  isDisabled: boolean;
  /** Why it is disabled. */
  reason?: string;
  min?: number;
  max?: number;
  /** The reason when disabled, else the computed line. */
  description?: Child;
}

/** The rules for a form, by field name. A dotted name reaches into a group: `"retry.delay"`. */
export type FieldRuleMap<Values> = Readonly<Record<string, FieldRule<Values>>>;

/** Values with what a rule hid left out, at any depth. */
export type PrunedValues<Values> = {
  [Key in keyof Values]?: Values[Key] extends readonly unknown[]
    ? Values[Key]
    : Values[Key] extends object
      ? PrunedValues<Values[Key]>
      : Values[Key];
};

export interface FieldRules<Values> {
  readonly rules: FieldRuleMap<Values>;
  /** What the rule for `name` says for `values`. */
  stateOf: (name: string, values: Values) => FieldRuleState;
  /** `values` without the fields their rules hide, for the submission: what is not shown is not sent. */
  prune: (values: Values) => PrunedValues<Values>;
}

const SHOWN: FieldRuleState = { isShown: true, isDisabled: false };

interface Branch {
  [key: string]: unknown;
}

/** `values` with the value at a dotted path taken out, copying only the objects on the way. */
function without(values: unknown, path: readonly string[]): unknown {
  if (values === null || typeof values !== "object") return values;
  const [head, ...rest] = path;
  if (head === undefined || !(head in values)) return values;
  if (Array.isArray(values)) {
    const index = Number(head);
    if (rest.length === 0) return values.filter((_, at) => at !== index);
    return values.map((item: unknown, at) => (at === index ? without(item, rest) : item));
  }
  const copy: Branch = { ...(values as Branch) };
  if (rest.length === 0) delete copy[head];
  else copy[head] = without(copy[head], rest);
  return copy;
}

/**
 * Fields that show, disable themselves or take their bounds from other
 * fields, written once beside the form:
 *
 * ```tsx
 * const rules = fieldRules<CheckValues>({
 *   quorum: { show: (v) => v.locations.length > 1, max: (v) => v.locations.length },
 *   retryDelay: { disable: (v) => (v.retries === 0 ? "Set a retry first." : undefined) },
 * });
 * const form = useArcForm(() => ({ defaultValues, onSubmit: ({ value }) => save(rules.prune(value)) }));
 * ```
 *
 * `<FieldRule>` reads a rule against the form in scope and hands the field
 * its state; `prune` drops what the rules hide, so a value nobody can see
 * is never saved.
 */
export function fieldRules<Values>(rules: FieldRuleMap<Values>): FieldRules<Values> {
  function stateOf(name: string, values: Values): FieldRuleState {
    const rule = rules[name];
    if (rule === undefined) return SHOWN;
    const reason = rule.disable?.(values);
    return {
      isShown: rule.show?.(values) ?? true,
      isDisabled: reason !== undefined,
      reason,
      min: rule.min?.(values),
      max: rule.max?.(values),
      description: reason ?? rule.describe?.(values),
    };
  }
  function prune(values: Values): PrunedValues<Values> {
    let kept: unknown = values;
    for (const name of Object.keys(rules)) {
      if (!stateOf(name, values).isShown) kept = without(kept, name.split("."));
    }
    return kept as PrunedValues<Values>;
  }
  return { rules, stateOf, prune };
}

/**
 * The state of `name`'s rule against the values of the form in scope, or of
 * `values` when given, kept current as they change.
 */
export function useFieldRule<Values>(
  rules: FieldRules<Values>,
  name: string,
  values?: Accessor<Values>,
): Accessor<FieldRuleState> {
  const read: Accessor<Values> =
    values ?? useArcFormContext().useSelector((state) => state.values as Values);
  return createMemo(() => rules.stateOf(name, read()));
}

export interface FieldRuleProps<Values> {
  rules: FieldRules<Values>;
  name: string;
  /** The values to judge by, for fields that are not a form's. @default the form in scope's */
  values?: Values;
  /** The field, handed its rule's state: `disabled`, `max`, `description`. */
  children: (rule: Accessor<FieldRuleState>) => Child;
}

/**
 * A field under its rule: left out while the rule hides it, and handed the
 * rule's state to read its disabled reason and its bounds from.
 *
 * ```tsx
 * <FieldRule rules={rules} name="quorum">
 *   {(rule) => (
 *     <form.AppField name="quorum">
 *       {(field) => <field.NumberField label="Quorum" max={rule().max} isDisabled={rule().isDisabled} description={rule().description} />}
 *     </form.AppField>
 *   )}
 * </FieldRule>
 * ```
 */
export function FieldRule<Values>(props: FieldRuleProps<Values>) {
  const given = untrack(() => props.values) !== undefined;
  const state = useFieldRule(
    untrack(() => props.rules),
    untrack(() => props.name),
    given ? () => props.values as Values : undefined,
  );
  return <Show when={state().isShown}>{props.children(state)}</Show>;
}
