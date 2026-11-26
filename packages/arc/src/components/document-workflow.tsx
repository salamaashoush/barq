import { type Accessor, type Child, For, Show, createSignal, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Lock } from "@barqjs/lucide/icons/lock";
import { Send } from "@barqjs/lucide/icons/send";
import { Button } from "@barqjs/ui/button";
import { NativeSelect, NativeSelectOption } from "@barqjs/ui/native-select";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, glyph, layout, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

/** Where a document stands: not started, a draft, in review, or completed and locked. */
export type DocumentStage = "none" | "draft" | "review" | "completed";

/** A stage a document can be saved in. */
export type SavedStage = Exclude<DocumentStage, "none">;

const STAGES: readonly SavedStage[] = ["draft", "review", "completed"];

export interface DocumentWorkflowOptions {
  /** The stage it was last saved in. */
  stage: Accessor<DocumentStage>;
  /** Whether its content has changes not saved yet. */
  dirty?: Accessor<boolean>;
}

/** A document's stage as the reader is choosing it, and what follows from it. */
export interface DocumentWorkflow {
  /** The stage it was last saved in. */
  saved: Accessor<DocumentStage>;
  /** The stage picked, to be saved; a draft until one is picked. */
  selected: Accessor<SavedStage>;
  select: (stage: SavedStage) => void;
  /** Completed and still meant to be: its content is read-only. */
  locked: Accessor<boolean>;
  /** Something to save: the content, or the stage picked. */
  changed: Accessor<boolean>;
}

/**
 * A document's review stage, kept for `DocumentWorkflowBar` and for the
 * editor it governs, which reads `locked()` for its `readOnly`.
 *
 * ```tsx
 * const workflow = useDocumentWorkflow({ stage: () => postmortem().state, dirty: edited });
 * <DocumentWorkflowBar workflow={workflow} onSave={save} onPublish={publish} />
 * <TextareaField readOnly={workflow.locked()} />
 * ```
 */
export function useDocumentWorkflow(options: DocumentWorkflowOptions): DocumentWorkflow {
  const [picked, setPicked] = createSignal<SavedStage | undefined>(undefined, {
    ownedWrite: true,
  });
  function selected(): SavedStage {
    const saved = options.stage();
    return picked() ?? (saved === "none" ? "draft" : saved);
  }
  return {
    saved: options.stage,
    selected,
    select: (stage) => setPicked(stage),
    locked: () => options.stage() === "completed" && selected() === "completed",
    changed: () =>
      options.dirty?.() === true || (options.stage() !== "none" && selected() !== options.stage()),
  };
}

export const documentWorkflowStyles = variants({
  slots: {
    root: arc(layout.column, gap[2]),
    bar: arc(layout.row, layout.wrap, gap[2], { alignItems: "center" }),
    stage: arc({ width: "auto" }),
    note: arc(layout.row, gap[1.5], type.meta, fg.muted, { alignItems: "center" }),
    icon: arc(glyph.sm, layout.noShrink),
  },
});

type Slots = ReturnType<typeof documentWorkflowStyles>;

export interface DocumentWorkflowBarProps extends Customisable<Slots> {
  workflow: DocumentWorkflow;
  /** Saves the content in the stage picked; its promise holds the button pending. */
  onSave: (stage: SavedStage) => unknown;
  /** Publishes the saved document; held while there are changes not saved. */
  onPublish?: () => unknown;
  /** A reason publishing is held of the caller's own: an empty public summary. */
  canPublish?: boolean;
  /** @default the provider's `publish`, "Publish" */
  publishLabel?: Child;
  /** @default the provider's `startDocument`, "Start" */
  startLabel?: Child;
  /** Hides the controls for a reader who may only read; the lock line still shows. @default true */
  canEdit?: boolean;
}

/**
 * The controls of a document reviewed in stages, a postmortem or a policy:
 * Start while there is none, then the stage to save it in (draft, in
 * review, completed) beside Save, and Publish, held while anything is not
 * saved. Completed locks the document until it is set back, which a line
 * under the controls says.
 *
 * ```tsx
 * <DocumentWorkflowBar workflow={workflow} onSave={(stage) => api.save(body(), stage)} />
 * ```
 */
export function DocumentWorkflowBar(props: DocumentWorkflowBarProps) {
  const messages = useArcMessages();
  const stageId = createUniqueId();
  const heldId = createUniqueId();
  const [saving, setSaving] = createSignal(false, { ownedWrite: true });
  const [publishing, setPublishing] = createSignal(false, { ownedWrite: true });
  function cls(): Slots {
    return parts(documentWorkflowStyles(), props.classes);
  }
  function started(): boolean {
    return props.workflow.saved() !== "none";
  }
  function held(): boolean {
    return props.workflow.changed();
  }
  async function save(): Promise<void> {
    setSaving(true);
    try {
      await props.onSave(props.workflow.selected());
    } finally {
      setSaving(false);
    }
  }
  async function publish(): Promise<void> {
    setPublishing(true);
    try {
      await props.onPublish?.();
    } finally {
      setPublishing(false);
    }
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="document-workflow"
      data-stage={props.workflow.saved()}
    >
      <Show when={props.canEdit !== false}>
        <div class={cls().bar} data-slot="document-workflow-bar">
          <Show when={started()}>
            <NativeSelect
              id={stageId}
              class={cls().stage}
              size="sm"
              aria-label={messages().reviewStage}
              value={props.workflow.selected()}
              disabled={saving()}
              onChange={(event: Event) =>
                props.workflow.select((event.target as HTMLSelectElement).value as SavedStage)
              }
            >
              <For each={STAGES}>
                {(stage: SavedStage) => (
                  <NativeSelectOption value={stage}>
                    {messages().stageName(stage)}
                  </NativeSelectOption>
                )}
              </For>
            </NativeSelect>
          </Show>
          <Button
            size="sm"
            isPending={saving()}
            isDisabled={started() && (!props.workflow.changed() || props.workflow.locked())}
            onPress={() => void save()}
          >
            {started() ? messages().save : (props.startLabel ?? messages().startDocument)}
          </Button>
          <Show when={props.onPublish !== undefined && started()}>
            <Button
              size="sm"
              variant="outline"
              isPending={publishing()}
              isDisabled={held() || props.canPublish === false}
              aria-describedby={held() ? heldId : undefined}
              onPress={() => void publish()}
            >
              <Send aria-hidden="true" />
              {props.publishLabel ?? messages().publish}
            </Button>
          </Show>
        </div>
      </Show>
      <Show when={props.workflow.locked()}>
        <p class={cls().note} data-slot="document-workflow-locked">
          <Lock aria-hidden="true" class={cls().icon} />
          {messages().documentLocked}
        </p>
      </Show>
      <Show when={props.canEdit !== false && props.onPublish !== undefined && started() && held()}>
        <p class={cls().note} id={heldId} data-slot="document-workflow-held">
          {messages().saveBeforePublishing}
        </p>
      </Show>
    </div>
  );
}
