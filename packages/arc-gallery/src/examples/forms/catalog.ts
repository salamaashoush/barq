import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "forms",
  title: "Forms",
  description: "Validated forms with arc's fields, a wizard and a form in a sheet.",
  examples: [
    {
      id: "arc-form",
      title: "A form with every field",
      description:
        "Text, password, number, select, combobox, time zone, date and date-time, textarea, switch and checkbox, validated as you go, pending while it submits, and refused by the server on a field and on the whole form.",
      covers: [
        "useArcForm",
        "TextField",
        "PasswordField",
        "NumberField",
        "SelectField",
        "ComboboxField",
        "TimeZoneField",
        "DateField",
        "DateTimeField",
        "TextareaField",
        "SwitchField",
        "CheckboxField",
        "SubmitButton",
        "FormError",
        "setServerErrors",
      ],
    },
    {
      id: "with-arc-form",
      title: "A section written once",
      description:
        "withArcForm draws the same address fields for billing and for shipping, each bound to its half of one form.",
      covers: ["withArcForm"],
    },
    {
      id: "create-arc-form",
      title: "A field of your own",
      description:
        "createArcForm adds an app's own field beside arc's: a preview of the workspace's address.",
      covers: ["createArcForm", "useArcField"],
    },
    {
      id: "wizard",
      title: "Wizard",
      description:
        "Steps checked before Next, an optional step to skip, a summary with a way back to each, and a pending Finish.",
      covers: ["Wizard"],
    },
    {
      id: "form-sheet",
      title: "Form in a sheet",
      description:
        "Edit a record in a sheet that asks before discarding changes and stays open when the server refuses.",
      covers: ["FormSheet"],
    },
  ],
};
