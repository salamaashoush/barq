import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "forms",
  title: "Forms",
  description:
    "Validated forms with arc's fields, a wizard, forms in a sheet and a dialog, a record's page with its sticky bar, and autosave.",
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
        "Edit a record in a sheet that loads it first, says what saving does in its foot, asks before discarding changes and stays open when the server refuses.",
      covers: ["FormSheet"],
    },
    {
      id: "form-dialog",
      title: "Form in a dialog",
      description:
        "Opened by its trigger or a link, refused by the server on a field, an edit dialog that loads its record first or fails to, and a key shown once in place of the fields.",
      covers: ["FormDialog"],
    },
    {
      id: "record-form-page",
      title: "A record's page",
      description:
        "A long form whose failed save opens with a summary linking each field, a second submit that adds another, a sticky bar saying what is unsaved, and a danger zone.",
      covers: ["RecordFormPage", "FormActionBar", "ErrorSummary"],
    },
    {
      id: "autosave",
      title: "Autosave",
      description:
        "Saved after a pause, one save at a time, Ctrl or Cmd+S, held while the draft cannot be stored, and every state of the indicator.",
      covers: ["useAutosave", "SaveStatus"],
    },
  ],
};
