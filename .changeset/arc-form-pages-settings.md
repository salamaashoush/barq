---
"@barqjs/arc": minor
---

arc gains the settings and form page pieces product settings kept building by hand.

- arc `SettingRow`, `FeatureToggles` and `PlanGate`: settings that apply at once and roll back with the reason, features locked by plan that turn on and off with what they need, and a notice in place of a gated editor.
- arc `PreferenceMatrix`: notification kinds by channel, with group rows, unavailable channels, locked kinds and per-cell choices.
- arc `CalendarFeed`: a private feed to copy, open in a calendar app and replace.
- arc `SettingsSection` takes `values`, `readOnly` and `list`; `SettingsLayout` asks once for all its sections and takes `narrow="row"`.
- arc `FormDialog`, `RecordFormPage`, `FormActionBar` and `ErrorSummary`: a guarded modal form with loading and result states, and a record page with an error summary, a sticky bar and a second submit intent. `FormSheet` takes `status`, `loading` and `loadError`.
- arc `useAutosave` and `SaveStatus`: drafts saved after a pause, one at a time, with Mod+S, offline and held states.
- arc `ArcProvider` `clock`, `ClockPreference` and `provideReaderClock`: the reader's zone, hour cycle and week start reach every date, time and calendar. `FormattedDate` keeps a date-only day, `FormattedNumber` takes `truncate`, and `Interval` words a period.
- arc `useThemeAccountSync`: the theme saved to and restored from the reader's account.
