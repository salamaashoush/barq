---
"@barqjs/arc": minor
"@barqjs/ui": minor
"@barqjs/aria": minor
---

arc gains the type, navigation, data display, formatting, media and chart components it lacked, and ui and aria the parts they needed.

- arc type: `Heading` (level apart from size), `Text`, `Code`, `Prose` (long-form markup styled logically), `Link` (an external link says so), `Truncate` (Show more once measured as cut) and `Shortcut` (`Mod+K` as the reader's keyboard writes it).
- arc navigation: `ResponsiveTabs` (folding into More or scrolling), `BottomNavigation`, `Stepper`, `SideNav`, `Pager` (with `pageWindow`) and `TableOfContents` with scroll-spy. `DataTable` pages with `Pager`.
- arc data display: `TreeView` (lazy children, load more, drag), tree rows in `DataTable` through `getSubRows`, `DescriptionList`, `Timeline`, `AvatarStack`, `Indicator`, `Tile`, `List` and `ListItem` (virtual, load more) and `StatGroup`.
- arc formatting: `RelativeTime`, `FormattedDate`, `FormattedNumber`, `Currency`, `Bytes` and `Duration`, each agreeing between the server and the hydrating page. The number fields' shared props are now `FormattedFieldProps`.
- arc media: `Image`, `Gallery` and `Lightbox`.
- arc charts: `DonutChart`, `ComboChart`, `ScatterChart`, `FunnelChart`, `Gauge`, `Heatmap`, `Sparkline` and `ChartDataTable`, each with a table of its numbers; `StatCard` draws its trend with `Sparkline`.
- ui: `CarouselDots`, and the carousel's selected snap and snap count; `useChart` and the chart scope exported for a plot of an app's own.
- aria: `relativeTimeFormatter` and `relativeUnit`; `overflowItems` and `overflowingKeys`, the overflow measurement `ActionGroup` used, with an item that never folds; a tooltip trigger no longer stops the keys it does not use, so Escape reaches the dialog around it.
