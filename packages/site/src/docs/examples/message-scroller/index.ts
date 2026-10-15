import type { Demo } from "../../registry.ts";
import MessageScrollerDemo from "./message-scroller-demo.tsx";
import messageScrollerDemo from "./message-scroller-demo.tsx?raw";
import MessageScrollerAnchoring from "./message-scroller-anchoring.tsx";
import messageScrollerAnchoring from "./message-scroller-anchoring.tsx?raw";
import MessageScrollerGroupChat from "./message-scroller-group-chat.tsx";
import messageScrollerGroupChat from "./message-scroller-group-chat.tsx?raw";
import MessageScrollerPreviousContext from "./message-scroller-previous-context.tsx";
import messageScrollerPreviousContext from "./message-scroller-previous-context.tsx?raw";
import MessageScrollerStreaming from "./message-scroller-streaming.tsx";
import messageScrollerStreaming from "./message-scroller-streaming.tsx?raw";
import MessageScrollerOpeningPosition from "./message-scroller-opening-position.tsx";
import messageScrollerOpeningPosition from "./message-scroller-opening-position.tsx?raw";
import MessageScrollerLoadHistory from "./message-scroller-load-history.tsx";
import messageScrollerLoadHistory from "./message-scroller-load-history.tsx?raw";
import MessageScrollerCommands from "./message-scroller-commands.tsx";
import messageScrollerCommands from "./message-scroller-commands.tsx?raw";
import MessageScrollerVisibility from "./message-scroller-visibility.tsx";
import messageScrollerVisibility from "./message-scroller-visibility.tsx?raw";
import MessageScrollerScrollable from "./message-scroller-scrollable.tsx";
import messageScrollerScrollable from "./message-scroller-scrollable.tsx?raw";
import MessageScrollerAnimation from "./message-scroller-animation.tsx";
import messageScrollerAnimation from "./message-scroller-animation.tsx?raw";

export const demos: readonly Demo[] = [
  {
    size: "auto",
    code: messageScrollerDemo,
    component: MessageScrollerDemo,
  },
  {
    title: "Anchoring Turns",
    note: "Mark the item that starts a turn with `scrollAnchor`. When it arrives, it settles near the top and what follows streams in below it.",
    size: "auto",
    code: messageScrollerAnchoring,
    component: MessageScrollerAnchoring,
  },
  {
    title: "Group Chat",
    note: "Any row can be a turn: here a marker announcing a new participant is the anchor.",
    size: "auto",
    code: messageScrollerGroupChat,
    component: MessageScrollerGroupChat,
  },
  {
    title: "Keeping Context Visible",
    note: "`scrollPreviousItemPeek` keeps part of the previous reply in view above an anchored turn.",
    size: "auto",
    code: messageScrollerPreviousContext,
    component: MessageScrollerPreviousContext,
  },
  {
    title: "Following the Live Edge",
    note: "With `autoScroll` the view follows streamed content while the reader is at the end, and stops when they scroll up.",
    size: "auto",
    code: messageScrollerStreaming,
    component: MessageScrollerStreaming,
  },
  {
    title: "Opening Saved Threads",
    note: "Choose where a saved transcript opens: the start, the end, or the last anchored turn.",
    size: "auto",
    code: messageScrollerOpeningPosition,
    component: MessageScrollerOpeningPosition,
  },
  {
    title: "Loading Earlier Messages",
    note: "Prepending older messages keeps the row being read where it is.",
    size: "auto",
    code: messageScrollerLoadHistory,
    component: MessageScrollerLoadHistory,
  },
  {
    title: "Commands",
    note: "`useMessageScroller` drives the transcript from outside it: `scrollToMessage`, `scrollToStart` and `scrollToEnd`.",
    size: "auto",
    code: messageScrollerCommands,
    component: MessageScrollerCommands,
  },
  {
    title: "Visibility",
    note: "`useMessageScrollerVisibility` reports the turn being read, here as a transcript outline.",
    size: "auto",
    code: messageScrollerVisibility,
    component: MessageScrollerVisibility,
  },
  {
    title: "Scrollable",
    note: "`useMessageScrollerScrollable` says which ways there is still somewhere to scroll.",
    size: "auto",
    code: messageScrollerScrollable,
    component: MessageScrollerScrollable,
  },
  {
    title: "Animation",
    note: "Animate a newly sent row with transform and opacity only, so its measured height never changes.",
    size: "auto",
    code: messageScrollerAnimation,
    component: MessageScrollerAnimation,
  },
];
