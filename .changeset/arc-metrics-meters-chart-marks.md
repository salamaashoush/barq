---
"@barqjs/arc": minor
"@barqjs/ui": patch
---

arc gains the metrics, meters and chart marks products kept drawing by hand.

- arc `Meter` and `UsageList`: a linear meter with thresholds, and usage against limits that says near, at or over the limit, or no limit, in words.
- arc `SegmentedBar` and `TallyProgress`: a whole split into toned shares with a legend, and a batch's progress split by outcome.
- arc `UptimeBar`, `SignalMeter`, `MetricRating` with `rateMetric`, `StagePath` and `CountUp`.
- arc `StatCard` takes a limit `meter`, a toned description, `valueTone`, `rating`, an `aside`, a whole-card `href` or `onPress` and `loading`; `StatGroup` fills a short last row and loads every card at once.
- arc `ComboChart` draws dashed lines, `references`, `bands`, point `statuses`, numbered `annotations`, round ticks (`niceTicks`, `useAxisFormat`) and a filtering legend (`LegendFilter`).
- arc `ProfileCard`, `LinkPreview`, `TemplateGallery` and `SaveTemplateDialog`; the chat entry's `QuotedMessageCard` and `CustomStatusDialog`.
- arc's style gains `control.stretched`, `interaction.hoverEdge`, `gap.line`, `layout.scrollInline`, `square.x2`, `place.media` and the primary colour roles, which `Tile`, `Status`, the choice cards and others now compose.
- ui's chart legend draws a dashed series as a dashed stroke and wraps its entries.
