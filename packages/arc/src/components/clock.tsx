import { type Child, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { dateFormatter, useLocale } from "@barqjs/aria/i18n";
import { controllable } from "@barqjs/aria/utils";
import { Clock3 } from "@barqjs/lucide/icons/clock-3";
import { Clock9 } from "@barqjs/lucide/icons/clock-9";
import { Globe } from "@barqjs/lucide/icons/globe";
import { MapPin } from "@barqjs/lucide/icons/map-pin";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { type ReaderClock, useReaderClock } from "../lib/reader-clock.ts";
import { gap, layout } from "../style/index.ts";
import { type ChoiceOption, RadioCards } from "./choice-cards.tsx";
import { hydrated } from "./format.tsx";
import { type ArcMessages, useArcMessages } from "./messages.ts";

// --- the preference control ----------------------------------------------------------

export const clockPreferenceStyles = variants({
  slots: { root: arc(layout.column, gap[6], layout.minZero) },
});

type Slots = ReturnType<typeof clockPreferenceStyles>;

export type ClockPart = "zone" | "hours" | "weekStart";

export interface ClockPreferenceProps extends Customisable<Slots> {
  value?: ReaderClock;
  defaultValue?: ReaderClock;
  onChange?: (clock: ReaderClock) => void;
  /** Which choices it offers. @default ["zone", "hours"] */
  parts?: readonly ClockPart[];
  isDisabled?: boolean;
}

/** 13:35 on a fixed day, so each choice's example reads the same everywhere. */
const SAMPLE = new Date(Date.UTC(2026, 0, 5, 13, 35));

interface Choice {
  value: string;
  label: (words: ArcMessages) => string;
  description?: (example: (options: Intl.DateTimeFormatOptions) => string) => Child;
  icon?: Child;
}

/**
 * The reader's choice of clock: their own zone or UTC, a 12- or 24-hour
 * clock, and the day a week starts, each a card with an example in the
 * reader's locale.
 *
 * ```tsx
 * const [clock, setClock] = createSignal(parseReaderClock(cookie("clock")));
 * <ArcProvider clock={clock()}>
 *   <ClockPreference value={clock()} onChange={(next) => { setClock(next); saveCookie(next); }} />
 * </ArcProvider>
 * ```
 *
 * Handed to `<ArcProvider clock>`, every time arc writes follows the choice
 * at once. `serializeReaderClock` and `parseReaderClock` keep it in a cookie
 * the server reads, so the first paint is already in it.
 */
export function ClockPreference(props: ClockPreferenceProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const local = hydrated();
  const reader = useReaderClock();
  function ownZone(): string {
    if (local()) return Intl.DateTimeFormat().resolvedOptions().timeZone;
    return reader()?.localZone ?? "";
  }
  const [current, setCurrent] = controllable<ReaderClock>(
    () => props.value,
    () => props.defaultValue ?? {},
    (next) => props.onChange?.(next),
  );
  function change(part: Partial<ReaderClock>): void {
    setCurrent({ ...current(), ...part });
  }
  function cls(): Slots {
    return parts(clockPreferenceStyles(), props.classes);
  }
  function shows(part: ClockPart): boolean {
    return (props.parts ?? ["zone", "hours"]).includes(part);
  }
  function example(format: Intl.DateTimeFormatOptions): string {
    return dateFormatter({ timeZone: "UTC", ...format }, locale)().format(SAMPLE);
  }
  // Built once, each word read where it is drawn: a new array would rebuild
  // every card, and the reader's own zone is only known once hydrated.
  function options(choices: readonly Choice[]): ChoiceOption[] {
    return choices.map((choice) => ({
      value: choice.value,
      label: () => choice.label(messages()),
      description:
        choice.description === undefined ? undefined : () => choice.description?.(example),
      icon: choice.icon,
    }));
  }
  const zones: readonly Choice[] = [
    {
      value: "local",
      label: (words) => words.clockLocalZone,
      description: () => ownZone(),
      icon: <MapPin />,
    },
    {
      value: "utc",
      label: () => "UTC",
      description: () => messages().clockUtcHint,
      icon: <Globe />,
    },
  ];
  const hours: readonly Choice[] = [
    {
      value: "12",
      label: (words) => words.clockTwelve,
      description: (format) => format({ hour: "numeric", minute: "2-digit", hourCycle: "h12" }),
      icon: <Clock3 />,
    },
    {
      value: "24",
      label: (words) => words.clockTwentyFour,
      description: (format) => format({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
      icon: <Clock9 />,
    },
  ];
  const weeks: readonly Choice[] = [
    { value: "auto", label: (words) => words.weekStartLocale },
    ...(["mon", "sun", "sat"] as const).map((day): Choice => ({
      value: day,
      label: () =>
        dateFormatter({ weekday: "long", timeZone: "UTC" }, locale)().format(
          new Date(Date.UTC(2026, 0, { mon: 5, sun: 4, sat: 3 }[day])),
        ),
    })),
  ];
  const zoneOptions = options(zones);
  const hourOptions = options(hours);
  const weekOptions = options(weeks);
  function zoneValue(): string {
    const chosen = current().zone ?? "local";
    return chosen === "utc" ? "utc" : "local";
  }
  function hoursValue(): string | null {
    const chosen = current().hours ?? "auto";
    return chosen === "auto" ? null : String(chosen);
  }
  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="clock-preference">
      <Show when={shows("zone")}>
        <RadioCards
          label={messages().clockZone}
          options={zoneOptions}
          value={zoneValue()}
          onChange={(value: string | null) => change({ zone: value === "utc" ? "utc" : "local" })}
          isDisabled={props.isDisabled}
        />
      </Show>
      <Show when={shows("hours")}>
        <RadioCards
          label={messages().clockHours}
          options={hourOptions}
          value={hoursValue()}
          onChange={(value: string | null) => change({ hours: value === "12" ? 12 : 24 })}
          isDisabled={props.isDisabled}
        />
      </Show>
      <Show when={shows("weekStart")}>
        <RadioCards
          label={messages().weekStart}
          options={weekOptions}
          value={current().weekStart ?? "auto"}
          onChange={(value: string | null) =>
            change({ weekStart: (value ?? "auto") as ReaderClock["weekStart"] })
          }
          isDisabled={props.isDisabled}
          minCardWidth="9rem"
        />
      </Show>
    </div>
  );
}
