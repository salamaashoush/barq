---
"@barqjs/arc": minor
"@barqjs/ui": minor
"@barqjs/aria": minor
---

arc gains the standard inputs, pickers, actions and overlays it lacked, and ui and aria the parts they needed.

- arc inputs: `Chip`, `TagGroup`, `TagInput`, `TimeField`, `TimePicker`, `DateRangeField`, `ColorPicker`, `ColorField`, `ColorSwatches`, `ColorEditor`, `ColorArea`, `ColorSlider`, `CurrencyField`, `PercentField`, `UnitField`, `PhoneField`, `Rating`, `RangeSlider`, `RadioCards` and `CheckboxCards`. Each is a field in `form.AppField` and stands alone with `value` or `defaultValue`.
- arc files: `FileDropZone`, `useUploadQueue`, `UploadQueue` and `FileUpload`.
- arc actions: `IconButton`, `SplitButton`, `ActionBar` (collapsing into More by priority) and `Toolbar`.
- arc overlays: `Tearsheet`, `ResponsiveOverlay`, `Tour`, `Coachmark`, `Spotlight`, `useTourProgress`, `InlineAlert` and `Banner`.
- ui: `DateRangePicker` takes presets and a field's label; `Slider` names each thumb and takes track and thumb classes; `inputVariants` and `dropdownMenuVariants` export those looks; an overlay's trigger now controls an element that exists.
- aria: classes, slots and icons for the parts of `Tag`, `NumberField`, the colour thumbs and a collapsed `ActionGroup`; `ActionGroup` collapses by `getPriority` and names its More button by `moreLabel`; slider thumbs keep their own labels; a number field is described by its description; `ColorSwatch` forwards its attributes.
