import type { Demo } from "../../registry.ts";
import AttachmentDemo from "./attachment-demo.tsx";
import attachmentDemo from "./attachment-demo.tsx?raw";
import AttachmentGroupDemo from "./attachment-group.tsx";
import attachmentGroup from "./attachment-group.tsx?raw";
import AttachmentImage from "./attachment-image.tsx";
import attachmentImage from "./attachment-image.tsx?raw";
import AttachmentSizes from "./attachment-sizes.tsx";
import attachmentSizes from "./attachment-sizes.tsx?raw";
import AttachmentStates from "./attachment-states.tsx";
import attachmentStates from "./attachment-states.tsx?raw";
import AttachmentTriggerDemo from "./attachment-trigger.tsx";
import attachmentTrigger from "./attachment-trigger.tsx?raw";

export const demos: readonly Demo[] = [
  { size: "auto", code: attachmentDemo, component: AttachmentDemo },
  {
    title: "Image",
    note: 'Set `variant="image"` on `AttachmentMedia` and render the picture inside it. Use `orientation="vertical"` to stack the media above the content.',
    size: "auto",
    code: attachmentImage,
    component: AttachmentImage,
  },
  {
    title: "States",
    note: "Set `state` to reflect the upload lifecycle. `idle` draws a dashed border, and `error` switches to a destructive treatment.",
    size: "auto",
    code: attachmentStates,
    component: AttachmentStates,
  },
  {
    title: "Sizes",
    note: "Use `size` to switch between `default`, `sm`, and `xs`.",
    size: "auto",
    code: attachmentSizes,
    component: AttachmentSizes,
  },
  {
    title: "Group",
    note: "Wrap attachments in `AttachmentGroup` to lay them out in a horizontally scrollable, snapping row.",
    size: "auto",
    code: attachmentGroup,
    component: AttachmentGroupDemo,
  },
  {
    title: "Trigger",
    note: "Add an `AttachmentTrigger` to make the whole card one press target, and open a dialog from its `onPress`. It fills the card behind the actions, so the actions stay clickable.",
    size: "auto",
    code: attachmentTrigger,
    component: AttachmentTriggerDemo,
  },
];
