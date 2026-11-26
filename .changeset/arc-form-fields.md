---
"@barqjs/arc": minor
"@barqjs/aria": minor
"@barqjs/ui": minor
---

arc gains the form fields product forms kept building by hand.

- arc `IdentifierField`, `SlugField` (with `slugify` and `freeSlug`), `SuggestionField`, and `TagInput` `line`: names typed to a convention, slugs followed from a name past taken ones with an availability check, free text over suggestions, and a list typed as one line.
- arc `TextField` and `TextareaField` take the direction of what is typed; `textDirection` is exported.
- arc `InlineEdit` and `InlineSelect`: values edited where they are read, pending and refused states included.
- arc `SelectField` options take a `hint`, a `group`, a `noneLabel` option and keep a saved value no longer listed.
- arc `CheckboxGroupField`, `RadioGroupField`, `ChecklistField` and `ThemePicker`; `RadioCards` and `CheckboxCards` take `media`.
- arc `OptionalLimitField`, `PairedNumberField`, and `contrastWith` on `ColorField` and `ColorPicker` with `contrastRatio`.
- arc `OptionGroup`, `fieldRules` with `FieldRule`, `RepeaterField`, `CollectionField`, `AddressFields` and `FileField`.
- arc's style gains `control.quiet`, `layout.scrollBlock` and `bg.primary`.
- aria's parts `ComboboxRoot` takes `allowsCustomValue`, keeping typed text through a close, a blur and Escape.
- ui's `SelectItem` takes `detail`, a faint line the trigger leaves out; `RadioGroup` puts its `class` on the grid of items only.
