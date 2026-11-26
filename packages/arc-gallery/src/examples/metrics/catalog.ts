import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "metrics",
  title: "Metrics and meters",
  description: "Numbers, meters and chart marks, each read in words as well as drawn.",
  examples: [
    {
      id: "stat-cards",
      title: "Stat cards",
      description:
        "A limit meter, a toned detail line, ratings, whole-card links and loading, in strips whose last row fills.",
      covers: ["StatCard", "StatGroup", "rateMetric"],
    },
    {
      id: "meters",
      title: "Meters and usage",
      description:
        "A linear meter that changes tone at its thresholds, and usage against limits with no limit said in words.",
      covers: ["Meter", "UsageList", "usageState"],
    },
    {
      id: "segmented-bars",
      title: "Segmented bars and tallies",
      description: "Request phases and storage by kind, and a run's tests finishing by outcome.",
      covers: ["SegmentedBar", "TallyProgress"],
    },
    {
      id: "uptime",
      title: "Uptime strips",
      description:
        "Ninety days a cell, walked by the arrow keys with a tip for each, and recent runs compact.",
      covers: ["UptimeBar", "uptimeState"],
    },
    {
      id: "signals",
      title: "Signal and ratings",
      description:
        "A connection's quality in bars and words, and a measure rated good, fair or poor.",
      covers: ["SignalMeter", "MetricRating"],
    },
    {
      id: "stage-path",
      title: "Stage path",
      description: "Where an applicant stands, and a lead that left the path.",
      covers: ["StagePath"],
    },
    {
      id: "count-up",
      title: "Count-up figures",
      description: "Figures that count up as they scroll into view, still under reduced motion.",
      covers: ["CountUp"],
    },
    {
      id: "chart-marks",
      title: "Chart marks",
      description:
        "A dashed p95 with failed-run dots and a budget line on round duration ticks, stacked runs filtered by their legend, and a trend against a norm with a band and notes.",
      covers: ["ComboChart", "niceTicks", "useAxisFormat"],
    },
    {
      id: "legend-filter",
      title: "Legend filter",
      description: "Kinds of event shown or hidden by chip, folded into a menu in a narrow box.",
      covers: ["LegendFilter"],
    },
    {
      id: "profile-card",
      title: "Profile cards",
      description:
        "A person with presence, status, contacts and their local time, as a card or a side panel.",
      covers: ["ProfileCard"],
    },
    {
      id: "link-preview",
      title: "Link previews",
      description:
        "An unfurled link with its site, title and picture, removable, stacked or still loading.",
      covers: ["LinkPreview"],
    },
    {
      id: "template-gallery",
      title: "Template gallery",
      description:
        "Templates by category with the chosen one previewed, a blank start, and saving as a template.",
      covers: ["TemplateGallery", "SaveTemplateDialog"],
    },
    {
      id: "quoted-messages",
      title: "Quoted messages",
      description: "Pinned and saved messages quoted out of their conversation.",
      covers: ["QuotedMessageCard"],
    },
    {
      id: "custom-status",
      title: "Custom status",
      description: "Setting a status with an emoji, presets and when it clears.",
      covers: ["CustomStatusDialog"],
    },
  ],
};
