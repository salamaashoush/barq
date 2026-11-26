---
"@barqjs/arc": minor
"@barqjs/ui": patch
---

arc gains the page and record layouts product pages kept building by hand.

- arc `PageHeader` takes a record's `media`, `mark`, `badges`, `facts` and `alerts`, and `align="start"`.
- arc `PanelToolbar`: the heading, line and actions that open a tab panel or a section.
- arc `RecordLayout` and `RecordSection`: a main column beside a rail of facts, and titled sections with Edit.
- arc `RecordPager`: the previous and next record as handlers or links, its position, and K and J. `DetailSheet` takes `steps`.
- arc `ResponsiveTabs` takes `param`, tabs that are routes with each tab's search kept, `shared`, `hidden` and `keepMounted`.
- arc `ListDetailLayout`: a list beside the open record, resizable, one pane at a time on a phone with Back.
- arc `MasterDetailList`: a list whose arrows open each row in a viewer beside it, with bulk checkboxes. `List` takes `selectionBehavior` and `disallowEmptySelection`.
- arc `ConversationLayout`: a conversation's header, messages, docked composer and side panels.
- ui `Checkbox` no longer shows its tick inside a selected row it is not itself ticked in.
