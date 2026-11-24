import { type Child, Show, createUniqueId } from "@barqjs/core";
import { X } from "@barqjs/lucide/icons/x";
import {
  bg,
  edge,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  rounded,
  space,
  type,
} from "@barqjs/arc/style";

import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { absolute, bare, cover, labelPadding, noPointer, pinned, takesPointer } from "./styles.ts";

/**
 * Excalidraw's `viewportStatusFrame`: a coloured frame around the canvas and
 * a badge saying why, as an app shows that it follows a collaborator.
 */
export type ViewportStatusFrame = {
  /** The badge, at the bottom centre; at the top on a phone. */
  label?: {
    label: Child;
    icon?: Child;
    /** The badge's background. @default the frame's colour, or the brand's */
    background?: string;
    /** The badge's text colour. @default the brand's ink */
    color?: string;
    /** Makes the badge a button. */
    onClick?: () => void;
    /** Adds a close button. */
    onClose?: () => void;
  };
  /** The frame's colour, or `false` for none. */
  border: false | string;
};

const border = d(pinned, cover, {
  boxSizing: "border-box",
  borderWidth: "4px",
  borderStyle: "solid",
  zIndex: "1",
});

const badge = d(type.meta, rounded.md, layout.row, layout.relative, takesPointer, {
  overflow: "hidden",
  backgroundColor: "var(--viewport-status-badge-background)",
  color: "var(--brand-ink, var(--primary-foreground))",
  lineHeight: "1",
  "&[data-clickable]": { cursor: "pointer" },
  "&[data-clickable]:active": { transform: "scale(0.96)" },
});

const badgeAction = d(focus.visible, absolute, cover, layout.flush, edge.none, bg.transparent, {
  padding: "0",
  cursor: "inherit",
});

const badgeLabel = d(layout.row, layout.relative, noPointer, gap[1], glyph.md, labelPadding, {
  whiteSpace: "pre-wrap",
});

const badgeClose = d(
  rounded.sm,
  focus.visible,
  layout.inlineCentre,
  layout.relative,
  bare,
  interaction.pressable,
  glyph.md,
  {
    marginInlineEnd: space.x2,
    padding: "0",
    "&:hover": { backgroundColor: "color-mix(in srgb, currentColor 20%, transparent)" },
    "& > svg": { display: "block" },
  },
);

export function ViewportStatusBorder(props: { border: string }) {
  return (
    <div
      class={border}
      style={{ borderColor: props.border }}
      data-testid="viewport-status-border"
    />
  );
}

export function ViewportStatusBadge(props: {
  label: NonNullable<ViewportStatusFrame["label"]>;
  border?: ViewportStatusFrame["border"];
}) {
  const ui = useDiagramUI();
  const labelId = createUniqueId();
  return (
    <div
      class={badge}
      role="status"
      data-clickable={props.label.onClick ? "" : undefined}
      style={{
        "--viewport-status-badge-background":
          props.label.background || props.border || "var(--brand, var(--primary))",
        color: props.label.color,
      }}
      data-testid="viewport-status-badge"
    >
      <Show when={props.label.onClick}>
        <button
          type="button"
          class={badgeAction}
          aria-labelledby={labelId}
          onClick={() => props.label.onClick?.()}
        />
      </Show>
      <div class={badgeLabel} id={props.label.onClick ? labelId : undefined}>
        {props.label.icon}
        {props.label.label}
      </div>
      <Show when={props.label.onClose}>
        <button
          type="button"
          class={badgeClose}
          aria-label={ui.t("buttons.close")}
          onClick={() => props.label.onClose?.()}
          data-testid="viewport-status-close"
        >
          <X aria-hidden="true" />
        </button>
      </Show>
    </div>
  );
}
