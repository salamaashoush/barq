import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "formatting",
  title: "Formatting",
  description:
    "Numbers, money, dates, durations and sizes in the reader's locale, and the typography around them.",
  examples: [
    {
      id: "numbers",
      title: "Numbers, money and sizes",
      description:
        "Every Intl number style, currencies by symbol, code and name, compact and accounting, and byte sizes. Switch the direction to RTL to read them in Arabic.",
      covers: ["FormattedNumber", "Currency", "Bytes"],
    },
    {
      id: "dates",
      title: "Dates and relative time",
      description:
        "Dates and times in a zone, and relative times that keep themselves current. The server writes UTC and the browser rewrites in the reader's zone.",
      covers: ["FormattedDate", "RelativeTime"],
    },
    {
      id: "durations",
      title: "Durations",
      description:
        "How long something took, by name or as a clock, and durationText for a string of its own.",
      covers: ["Duration", "durationText"],
    },
  ],
};
