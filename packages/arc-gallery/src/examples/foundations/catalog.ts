import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "foundations",
  title: "Foundations",
  description:
    "The theme's tokens, the style treatments every arc component is composed from, and the layout components.",
  examples: [
    {
      id: "tokens",
      title: "Tokens",
      description:
        "The theme's colours, the five tones with their foreground and subtle fill, and the spacing, radius, motion and stacking scales.",
      covers: ["TONES", "tone", "arc", "space", "radius", "motionTokens", "zIndex"],
    },
    {
      id: "treatments",
      title: "Style treatments",
      description:
        "One-off patterns composed from arc's treatments: layout, gap, type, colour and tone, surfaces, focus, interaction, motion, place and target.",
      covers: [
        "layout",
        "gap",
        "type",
        "fg",
        "bg",
        "tone",
        "surface",
        "edge",
        "rounded",
        "elevation",
        "focus",
        "interaction",
        "motion",
        "place",
        "target",
      ],
    },
    {
      id: "layout",
      title: "Layout",
      description:
        "Stack, Inline, Grid, Container and Center, responsive by viewport and by container.",
      covers: ["Stack", "Inline", "Grid", "Container", "Center"],
    },
    {
      id: "typography",
      title: "Typography",
      description:
        "Headings by level and size, text by role and tone, inline code, links and long-form prose.",
      covers: ["Heading", "Text", "Code", "Link", "Prose"],
    },
    {
      id: "text-helpers",
      title: "Truncation, shortcuts and matches",
      description:
        "Text cut with a button for the rest, keyboard shortcuts in the platform's symbols, and search matches marked live.",
      covers: ["Truncate", "Shortcut", "HighlightMatches"],
    },
    {
      id: "status",
      title: "Status and indicators",
      description:
        "A state in a tone and in words, and a count or a dot pinned to an icon or an avatar.",
      covers: ["Status", "Indicator"],
    },
    {
      id: "chips",
      title: "Chips",
      description:
        "Filter chips held on or off, input chips with a remove button, action chips, every tone and size.",
      covers: ["Chip"],
    },
    {
      id: "empty-state",
      title: "Empty state",
      description:
        "What an empty area says and offers, framed on a plain page or plain inside a card.",
      covers: ["EmptyState"],
    },
  ],
};
