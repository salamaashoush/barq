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
    {
      id: "reader-clock",
      title: "The reader's clock",
      description:
        "Their own zone or UTC, a 12- or 24-hour clock and the first day of a week, followed by every date, relative time and calendar below; a calendar day that no zone shifts, a percent cut rather than rounded, and intervals in words.",
      covers: [
        "ClockPreference",
        "provideReaderClock",
        "Interval",
        "FormattedNumber",
        "FormattedDate",
      ],
    },
  ],
};
