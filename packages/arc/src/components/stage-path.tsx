import { For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  fg,
  gap,
  glyph,
  layout,
  plainList,
  space,
  tone as tones,
  type,
} from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

/** One stage of a path, in the order a record moves through them. */
export interface PathStage {
  key: string;
  label: string;
}

/** How a record left the path: lost at a stage, or won early. */
export interface PathOutcome {
  /** Said in place of the path's end: `"Lost: chose another school"`. */
  label: string;
  /** The stage it left at, ticked with those before it. `null` when it left before the first. */
  at: string | null;
  /** @default "danger" */
  tone?: "danger" | "success" | "neutral";
}

const NOTCH = space.x2_5;

const chevron = `polygon(0 0, calc(100% - ${NOTCH}) 0, 100% 50%, calc(100% - ${NOTCH}) 100%, 0 100%, ${NOTCH} 50%)`;
const chevronRtl = `polygon(${NOTCH} 0, 100% 0, calc(100% - ${NOTCH}) 50%, 100% 100%, ${NOTCH} 100%, 0 50%)`;
const firstChevron = `polygon(0 0, calc(100% - ${NOTCH}) 0, 100% 50%, calc(100% - ${NOTCH}) 100%, 0 100%)`;
const firstChevronRtl = `polygon(${NOTCH} 0, 100% 0, 100% 100%, ${NOTCH} 100%, 0 50%)`;
const lastChevron = `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${NOTCH} 50%)`;
const lastChevronRtl = `polygon(0 0, 100% 0, calc(100% - ${NOTCH}) 50%, 100% 100%, 0 100%)`;

export const stagePathStyles = variants({
  slots: {
    root: arc(layout.minZero, layout.scrollInline),
    list: arc(plainList, layout.row, { gap: "2px", minInlineSize: "100%" }),
    stage: arc(
      layout.centre,
      layout.grow,
      layout.nowrap,
      type.label,
      gap[1.5],
      glyph.sm,
      bg.muted,
      fg.muted,
      {
        minInlineSize: "7rem",
        blockSize: space.x9,
        paddingInline: space.x5,
        clipPath: chevron,
        ":dir(rtl)": { clipPath: chevronRtl },
        ":first-child": { clipPath: firstChevron },
        ":first-child:dir(rtl)": { clipPath: firstChevronRtl },
        ":last-child": { clipPath: lastChevron },
        ":last-child:dir(rtl)": { clipPath: lastChevronRtl },
        ":only-child": { clipPath: "none" },
      },
    ),
  },
});

type StageState = "done" | "current" | "ahead";

/** Each state's fill and text, on top of the stage's own muted ones. */
const STATE_LOOK: Record<StageState | "outcome", string | undefined> = {
  done: arc(bg.primarySubtle, fg.primary),
  current: arc(bg.primary, fg.onPrimary),
  ahead: undefined,
  outcome: arc(bg.tone, fg.tone),
};

export type StagePathSlots = ReturnType<typeof stagePathStyles>;

export interface StagePathProps extends Customisable<StagePathSlots> {
  /** Names the path: `"Pipeline"`. */
  label: string;
  stages: readonly PathStage[];
  /** Where the record stands, or `null` once it has left the path or before it starts. */
  current: string | null;
  /** How it left the path, in place of its end. */
  outcome?: PathOutcome;
  id?: string;
}

/**
 * Where a record stands along the stages it moves through: an applicant, a
 * lead, an order. The stages behind it are ticked, its own filled, those
 * ahead plain; one that left the path early shows where it left and how.
 *
 * ```tsx
 * <StagePath label="Admission" current="interview" stages={[
 *   { key: "applied", label: "Applied" },
 *   { key: "interview", label: "Interview" },
 *   { key: "offer", label: "Offer" },
 * ]} />
 * ```
 *
 * It only reads: moving the record is an action elsewhere (`Stepper` is the
 * path a person walks). An ordered list, its current stage `aria-current`,
 * each stage behind said "completed", the chevrons pointing the reading
 * direction's way. It scrolls sideways where the stages do not fit.
 */
export function StagePath(props: StagePathProps) {
  const messages = useArcMessages();
  function cls(): StagePathSlots {
    return parts(stagePathStyles(), props.classes);
  }
  function reached(): number {
    const key = props.current ?? props.outcome?.at ?? null;
    return key === null ? -1 : props.stages.findIndex((stage) => stage.key === key);
  }
  function stateOf(at: number): StageState {
    const index = reached();
    if (at < index) return "done";
    if (at === index) return props.current === null ? "done" : "current";
    return "ahead";
  }
  return (
    <div class={arc(cls().root, props.class, props.className)} id={props.id} data-slot="stage-path">
      <ol class={cls().list} data-slot="stage-path-list" aria-label={props.label}>
        <For each={() => props.stages}>
          {(stage: PathStage, at: () => number) => (
            <li
              class={arc(cls().stage, STATE_LOOK[stateOf(at())])}
              data-slot="stage-path-stage"
              data-state={stateOf(at())}
              aria-current={stateOf(at()) === "current" ? "step" : undefined}
            >
              <Show when={stateOf(at()) === "done"}>
                <Check aria-hidden="true" />
              </Show>
              {stage.label}
              <Show when={stateOf(at()) === "done"}>
                <span class={srOnly}>{messages().stageDone}</span>
              </Show>
            </li>
          )}
        </For>
        <Show when={props.outcome}>
          {(outcome: () => PathOutcome) => (
            <li
              class={arc(cls().stage, STATE_LOOK.outcome, tones[outcome().tone ?? "danger"])}
              data-slot="stage-path-stage"
              data-state="outcome"
              aria-current="step"
            >
              {outcome().label}
            </li>
          )}
        </Show>
      </ol>
    </div>
  );
}
