import { type Child, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg } from "../style/index.ts";
import { type ArcMessages, useArcMessages } from "./messages.ts";

export const valueStyles = variants({
  slots: {
    root: arc({}),
    absent: arc(fg.muted),
    unrecorded: arc(fg.muted, { fontStyle: "italic" }),
  },
});

type Slots = ReturnType<typeof valueStyles>;

/** The words arc has for a value that is legitimately not there. */
export type Absence = "never" | "none" | "notSet" | "noLimit" | "nobody";

const ABSENCES: Record<Absence, (messages: ArcMessages) => string> = {
  never: (messages) => messages.never,
  none: (messages) => messages.none,
  notSet: (messages) => messages.notSet,
  noLimit: (messages) => messages.noLimit,
  nobody: (messages) => messages.nobody,
};

export interface ValueProps<T> extends Customisable<Slots> {
  /** The value; `null`, `undefined`, an empty or blank string and an empty list are absent. */
  value: T | null | undefined;
  /** How it is written when present. @default `String(value)` */
  format?: (value: T) => Child;
  /**
   * What its absence means here, in arc's words, when nothing is missing
   * from the record: there simply is none. Left out, with no `absentText`
   * either, absence reads "Not recorded", which says something should have
   * been there.
   */
  absent?: Absence;
  /** The absence in the caller's own words: "No guardian". */
  absentText?: Child;
  /**
   * The value cannot exist for this record, such as a grade for a student
   * with no class: a dash, read as "Not applicable".
   */
  notApplicable?: boolean;
}

function isAbsent(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return Array.isArray(value) && value.length === 0;
}

/**
 * A field's value that can legitimately be absent, with the absence said
 * in words rather than left blank, so a reader can tell "there is none"
 * from "something failed to show".
 *
 * ```tsx
 * <Value value={user.expiresAt} absent="never" format={(at) => <FormattedDate value={at} />} />
 * <Value value={plan.seats} absent="noLimit" />
 * <Value value={student.guardian?.name} absentText="No guardian" />
 * <Value value={undefined} notApplicable />
 * ```
 *
 * `absent` takes arc's words (`never`, `none`, `notSet`, `noLimit`,
 * `nobody`) and `absentText` the caller's own, drawn muted. With neither it
 * reads "Not recorded" in italics.
 */
export function Value<T>(props: ValueProps<T>) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(valueStyles(), props.classes);
  }
  function state(): "present" | "absent" | "unrecorded" | "notApplicable" {
    if (props.notApplicable === true) return "notApplicable";
    if (!isAbsent(props.value)) return "present";
    return props.absent === undefined && props.absentText === undefined ? "unrecorded" : "absent";
  }
  function absence(): Child {
    const word = props.absent;
    return word === undefined ? props.absentText : ABSENCES[word](messages());
  }
  function present(): Child {
    const value = props.value as T;
    return props.format === undefined ? String(value) : props.format(value);
  }
  return (
    <span
      class={arc(
        cls().root,
        state() === "absent" || state() === "notApplicable" ? cls().absent : undefined,
        state() === "unrecorded" ? cls().unrecorded : undefined,
        props.class,
        props.className,
      )}
      data-slot="value"
      data-state={state()}
    >
      <Show when={state() === "present"}>{present()}</Show>
      <Show when={state() === "absent"}>{absence()}</Show>
      <Show when={state() === "unrecorded"}>{messages().notRecorded}</Show>
      <Show when={state() === "notApplicable"}>
        <span aria-hidden="true">—</span>
        <span class={srOnly}>{messages().notApplicable}</span>
      </Show>
    </span>
  );
}
