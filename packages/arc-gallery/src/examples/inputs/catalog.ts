import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "inputs",
  title: "Inputs and pickers",
  description:
    "Fields for every kind of value: text, numbers in units, phones, dates, times, colours, ratings, tags and files.",
  examples: [
    {
      id: "base-inputs",
      title: "Text, select, combobox, checkbox, switch and slider",
      description:
        "ui's base inputs, which arc re-exports, inside ui's Field with a label, a description or an error.",
      covers: ["Input", "Select", "Combobox", "Checkbox", "Switch", "Slider", "Field"],
    },
    {
      id: "tags",
      title: "Tags",
      description:
        "A group of tags to select, remove or clear, and an input that turns typed text into checked tags.",
      covers: ["TagGroup", "TagInput"],
    },
    {
      id: "number-fields",
      title: "Money, percentages and units",
      description:
        "Number fields that read and write in the locale's currency, percent and unit formats.",
      covers: ["CurrencyField", "PercentField", "UnitField"],
    },
    {
      id: "phone",
      title: "Phone numbers",
      description:
        "A country with its calling code and a number formatted as it is typed, stored as E.164.",
      covers: ["PhoneField"],
    },
    {
      id: "time",
      title: "Times",
      description: "Typed time segments, and a picker of times at a step or from a list.",
      covers: ["TimeField", "TimePicker"],
    },
    {
      id: "date-range",
      title: "Date ranges",
      description:
        "A start and an end from a two-month calendar, with arc's common presets or your own.",
      covers: ["DateRangeField", "commonRangePresets"],
    },
    {
      id: "otp-date",
      title: "One-time codes and dates",
      description: "ui's one-time code boxes and its date picker with presets.",
      covers: ["InputOTP", "DatePicker"],
    },
    {
      id: "color",
      title: "Colours",
      description:
        "A picker on a button, a hex field, swatches, and the area, sliders and editor they are built from.",
      covers: [
        "ColorPicker",
        "ColorField",
        "ColorSwatches",
        "ColorArea",
        "ColorSlider",
        "ColorEditor",
      ],
    },
    {
      id: "range-rating",
      title: "Ranges and ratings",
      description: "Two thumbs on one track, and stars to give or to show.",
      covers: ["RangeSlider", "Rating"],
    },
    {
      id: "choice-cards",
      title: "Choice cards",
      description:
        "One of a few or several of a few, each option a card with a title and a line about it.",
      covers: ["RadioCards", "CheckboxCards"],
    },
    {
      id: "upload",
      title: "File upload",
      description:
        "Files dropped or picked, checked against limits and sent to the server with progress, retry and cancel.",
      covers: ["FileUpload", "FileDropZone", "UploadQueue", "useUploadQueue"],
    },
  ],
};
