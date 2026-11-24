import { For, createSignal } from "@barqjs/core";
import { Grid, Stack } from "@barqjs/arc";
import {
  bg,
  control,
  edge,
  elevation,
  fg,
  focus,
  gap,
  interaction,
  layout,
  motion,
  place,
  rounded,
  space,
  surface,
  target,
  tone,
  truncate,
  type,
} from "@barqjs/arc/style";
import { layer } from "@barqjs/css";
import { on } from "@barqjs/ui/conditions";

const demo = layer("demo");

const stat = demo(surface.card, layout.column, gap[1], { padding: space.x4 });
const delta = demo(layout.inlineRow, rounded.full, type.caption, bg.tone, fg.tone, {
  alignSelf: "flex-start",
  paddingInline: space.x2,
  paddingBlock: space.x0_5,
});

const list = demo(surface.bordered, layout.column, { overflow: "clip" });
const row = demo(
  control.bare,
  layout.row,
  layout.fill,
  gap[3],
  edge.bottom,
  target.size,
  interaction.selected,
  motion.colours,
  focus.inset,
  {
    paddingInline: space.x4,
    paddingBlock: space.x3,
    textAlign: "start",
    ":last-child": { borderBlockEndWidth: "0px" },
  },
);
const rowName = demo(layout.grow, layout.minZero, truncate, type.label);
const rowMeta = demo(type.meta, type.numeric);

const tile = demo(layout.relative, rounded.lg, bg.muted, {
  overflow: "clip",
  aspectRatio: "16 / 9",
});
const caption = demo(place.passive, surface.onMedia, type.caption, {
  insetInline: "0",
  insetBlockStart: "0",
  paddingInline: space.x3,
  paddingBlock: space.x2,
});
const badge = demo(
  place.passive,
  place.endCorner,
  rounded.full,
  tone.info,
  bg.toneSolid,
  type.caption,
  {
    color: "var(--background)",
    paddingInline: space.x2,
  },
);
const centred = demo(place.cover, layout.centre, type.meta);

const floating = demo(surface.elevated, layout.column, gap[2], { padding: space.x4 });
const raised = demo(edge.all, rounded.xl, elevation.raised, { padding: space.x4 });
const well = demo(surface.sunken, rounded.md, type.mono, type.sm, { padding: space.x3 });

const responsive = demo(layout.row, layout.wrap, gap[2], type.body, {
  padding: { default: space.x2, [on.cqMd]: space.x4 },
  borderInlineStartWidth: "3px",
  borderInlineStartStyle: "solid",
  borderInlineStartColor: "var(--arc-tone)",
});

const INVOICES = [
  { id: "1042", customer: "Acme Logistics", amount: "$4,200.00", due: "Due Dec 1" },
  {
    id: "1043",
    customer: "Northwind Traders, annual renewal",
    amount: "$18,400.00",
    due: "Due Dec 8",
  },
  { id: "1044", customer: "Example Labs", amount: "$960.00", due: "Paid" },
];

export default function Treatments() {
  const [selected, setSelected] = createSignal("1043");
  return (
    <Stack gap={6}>
      <Grid columns={{ base: 1, cqMd: 3 }} gap={3}>
        <div class={demo(stat, tone.success)}>
          <span class={type.meta}>Revenue</span>
          <span class={type.stat}>$128,400</span>
          <span class={delta}>+12.4%</span>
        </div>
        <div class={demo(stat, tone.warning)}>
          <span class={type.meta}>Open invoices</span>
          <span class={type.stat}>23</span>
          <span class={delta}>5 overdue</span>
        </div>
        <div class={demo(stat, tone.danger)}>
          <span class={type.meta}>Failed payments</span>
          <span class={type.stat}>3</span>
          <span class={delta}>Needs attention</span>
        </div>
      </Grid>

      <div class={list} role="group" aria-label="Invoices">
        <For each={INVOICES}>
          {(invoice) => (
            <button
              type="button"
              class={row}
              aria-pressed={selected() === invoice.id}
              data-selected={selected() === invoice.id ? "" : undefined}
              onClick={() => setSelected(invoice.id)}
            >
              <span class={rowMeta}>#{invoice.id}</span>
              <span class={rowName}>{invoice.customer}</span>
              <span class={demo(rowMeta, fg.default)}>{invoice.amount}</span>
              <span class={rowMeta}>{invoice.due}</span>
            </button>
          )}
        </For>
      </div>

      <Grid columns={{ base: 1, cqMd: 3 }} gap={3}>
        <div class={tile}>
          <span class={centred}>Cover image</span>
          <span class={badge}>Live</span>
          <span class={caption}>Acme launch keynote, 42 min</span>
        </div>
        <div class={floating}>
          <span class={type.heading}>Elevated</span>
          <span class={type.body}>A popover's fill, an edge and a shadow.</span>
        </div>
        <div class={raised}>
          <span class={type.subheading}>Raised, extra-large corner</span>
          <p class={demo(type.body, fg.muted)}>Composed from edge, rounded and elevation.</p>
        </div>
      </Grid>

      <div class={layout.container}>
        <div class={demo(responsive, tone.info, bg.tone, fg.tone)}>
          <strong class={type.strong}>Tip</strong>
          <span>Padding steps up from the container's md step, and the edge takes the tone.</span>
        </div>
      </div>

      <div class={well}>
        {"const row = demo(layout.row, gap[3], edge.bottom, interaction.selected);"}
      </div>
    </Stack>
  );
}
