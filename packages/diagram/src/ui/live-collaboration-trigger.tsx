import { Show } from "@barqjs/core";
import { Share2 } from "@barqjs/lucide/icons/share-2";
import { Button } from "@barqjs/ui/button";
import { bg, fg, layout, tone, type } from "@barqjs/arc/style";
import { tokens } from "@barqjs/ui/theme/tokens";
import { MQ_MIN_WIDTH_DESKTOP } from "@excalidraw/common";

import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { absolute, takesPointer } from "./styles.ts";

// a session under way is green, as Excalidraw's, and so is the count
// the tone `tone.success` sets, which the active trigger fills and edges in
const TONE = "var(--arc-tone)";

const trigger = d(tone.success, layout.relative, layout.noShrink, takesPointer, {
  "&[data-active], &[data-active]:hover": {
    backgroundColor: TONE,
    borderColor: TONE,
    color: tokens.background,
  },
});

const count = d(type.meta, layout.inlineCentre, bg.tone, fg.tone, absolute, {
  insetInlineEnd: "-5px",
  bottom: "-5px",
  minWidth: "1em",
  minHeight: "1em",
  padding: "3px",
  borderRadius: "50%",
  lineHeight: "1",
  fontSize: "0.6rem",
});

export interface LiveCollaborationTriggerProps {
  /** Whether a session is under way: the button turns green. */
  isCollaborating: boolean;
  /** Pressed: the app opens its share dialog. */
  onSelect: () => void;
  "data-testid"?: string;
}

/**
 * Excalidraw's `LiveCollaborationTrigger`, for an app to render in
 * `renderTopRightUI`: "Share", or an icon short of a wide desktop, with the
 * number of collaborators in its corner.
 */
export function LiveCollaborationTrigger(props: LiveCollaborationTriggerProps) {
  const ui = useDiagramUI();
  const iconOnly = () =>
    ui.store.editorInterface().formFactor !== "desktop" ||
    ui.store.state("width") < MQ_MIN_WIDTH_DESKTOP;
  const collaborators = () => ui.store.state("collaborators").size;
  return (
    <Button
      size={iconOnly() ? "icon" : "default"}
      class={trigger}
      data-active={props.isCollaborating ? "" : undefined}
      aria-label={iconOnly() ? ui.t("labels.liveCollaboration") : undefined}
      title={ui.t("labels.liveCollaboration")}
      onPress={() => props.onSelect()}
      data-testid={props["data-testid"] ?? "collab-button"}
    >
      <Show when={iconOnly()} fallback={ui.t("labels.share")}>
        <Share2 aria-hidden="true" />
      </Show>
      <Show when={collaborators() > 0}>
        <span class={count} data-testid="collab-count">
          {collaborators()}
        </span>
      </Show>
    </Button>
  );
}
