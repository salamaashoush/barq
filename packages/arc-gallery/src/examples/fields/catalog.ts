import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "fields",
  title: "Form fields",
  description:
    "Fields past the basic inputs: names typed to a rule, slugs, inline edits, choice groups, checklists, limits, pairs, repeaters, sub-records, addresses, files and fields that depend on each other.",
  examples: [
    {
      id: "text-fields",
      title: "Names, slugs and suggestions",
      description:
        "A slug following its name past taken ones with an availability check, a collapsed address with Change, identifiers rewritten to a convention, free text over suggestions, a host list typed as one line, and text that takes its own direction.",
      covers: [
        "SlugField",
        "IdentifierField",
        "SuggestionField",
        "TagInput",
        "TextField",
        "TextareaField",
        "slugify",
        "textDirection",
      ],
    },
    {
      id: "inline-edit",
      title: "Editing in place",
      description:
        "A title saved after a pause, notes over several lines, a save the server refuses, and selects in a facts list with Nobody, a value that left the list and a read-only one.",
      covers: ["InlineEdit", "InlineSelect"],
    },
    {
      id: "choice-groups",
      title: "Checkbox and radio groups",
      description:
        "Severities in a row with shortcuts and an at-least-one rule, permissions in a grid with a caveat and a retired value kept, audits as switches, radios with lines, and both read only.",
      covers: ["CheckboxGroupField", "RadioGroupField"],
    },
    {
      id: "checklist",
      title: "Checklists",
      description:
        "Projects with counts and a badge, searched once the list is long, with a summary, a warning and hidden ones counted; hosts added by hand; and a read-only list.",
      covers: ["ChecklistField"],
    },
    {
      id: "select-detail",
      title: "Select options with detail",
      description:
        "Network presets with a hint the trigger leaves out and a none option, record types under groups, and a removed tunnel that keeps its place.",
      covers: ["SelectField", "FieldOption"],
    },
    {
      id: "theme-and-media",
      title: "Theme cards and media",
      description:
        "Light, dark and system drawn small, the same choice as a row of buttons, and choice cards with a picture across the top.",
      covers: ["ThemePicker", "ThemePreview", "RadioCards", "CheckboxCards"],
    },
    {
      id: "limits",
      title: "Limits, pairs and contrast",
      description:
        "Limits inside a sentence that switch off or go blank, a disabled one, a viewport and a location held as pairs, and brand colours checked against the text drawn on them.",
      covers: [
        "OptionalLimitField",
        "PairedNumberField",
        "ColorField",
        "ColorPicker",
        "contrastRatio",
      ],
    },
    {
      id: "option-rules",
      title: "Dependent fields and option groups",
      description:
        "A quorum shown only for several locations and bounded by them, a retry delay disabled with its reason, and network options folded under a summary that opens on a server error. The saved values leave out what the rules hide.",
      covers: ["fieldRules", "FieldRule", "useFieldRule", "OptionGroup"],
    },
    {
      id: "repeaters",
      title: "Repeated rows and sub-records",
      description:
        "Request headers on a form array, moved and removed with focus following; answer options with a minimum and a maximum; an empty list; and fees as a table, cards on a phone, each edited in its own sheet.",
      covers: ["RepeaterField", "CollectionField"],
    },
    {
      id: "address-files",
      title: "Addresses and files",
      description:
        "Addresses laid out as the United States, Japan and Egypt write them, with autofill tokens per section, and files sent as they are picked, the form waiting for them before it submits.",
      covers: ["AddressFields", "addressFormat", "FileField"],
    },
  ],
};
