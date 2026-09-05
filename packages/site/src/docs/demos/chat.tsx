/**
 * The conversation parts, which shadcn added after the rest and which have no
 * equivalent anywhere else in the library: a bubble, a turn, a scroller that
 * anchors to the bottom, and an attachment row.
 */

import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { FileText } from "@barqjs/lucide/icons/file-text";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  Bubble,
  BubbleContent,
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
} from "@barqjs/ui";

import { wide } from "./shared.ts";

const CHAT = [
  { who: "MK", name: "Mira", body: "Did the build go out?", at: "09:41", mine: false },
  { who: "SA", name: "You", body: "Just now, yes.", at: "09:42", mine: true },
  { who: "MK", name: "Mira", body: "Any regressions in the report?", at: "09:43", mine: false },
  { who: "SA", name: "You", body: "None the suite caught.", at: "09:43", mine: true },
  { who: "MK", name: "Mira", body: "Good. I will look this afternoon.", at: "09:44", mine: false },
  { who: "SA", name: "You", body: "Thanks.", at: "09:45", mine: true },
];

const bubbles = css`
  display: flex;
  width: 100%;
  max-width: 26rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

export function BubbleDemo() {
  return (
    <div class={bubbles}>
      <Bubble align="start" variant="muted">
        <BubbleContent>Did the build go out?</BubbleContent>
      </Bubble>
      <Bubble align="end">
        <BubbleContent>Just now, yes.</BubbleContent>
      </Bubble>
    </div>
  );
}

export function MessageDemo() {
  return (
    <div class={bubbles}>
      <Message align="start">
        <MessageAvatar>MK</MessageAvatar>
        <MessageContent>
          <MessageHeader>Mira</MessageHeader>
          <Bubble align="start" variant="muted">
            <BubbleContent>Any regressions in the report?</BubbleContent>
          </Bubble>
          <MessageFooter>09:43</MessageFooter>
        </MessageContent>
      </Message>
      <Message align="end">
        <MessageAvatar>SA</MessageAvatar>
        <MessageContent>
          <MessageHeader>You</MessageHeader>
          <Bubble align="end">
            <BubbleContent>None the suite caught.</BubbleContent>
          </Bubble>
          <MessageFooter>09:43</MessageFooter>
        </MessageContent>
      </Message>
    </div>
  );
}

const scrollerFrame = css`
  height: 18rem;
  width: 100%;
  max-width: 28rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem;
`;

export function MessageScrollerDemo() {
  return (
    <div class={scrollerFrame}>
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent>
            <For each={() => CHAT}>
              {(turn: (typeof CHAT)[number]) => (
                <MessageScrollerItem>
                  <Message align={turn.mine ? "end" : "start"}>
                    <MessageAvatar>{turn.who}</MessageAvatar>
                    <MessageContent>
                      <MessageHeader>{turn.name}</MessageHeader>
                      <Bubble
                        align={turn.mine ? "end" : "start"}
                        variant={turn.mine ? "default" : "muted"}
                      >
                        <BubbleContent>{turn.body}</BubbleContent>
                      </Bubble>
                      <MessageFooter>{turn.at}</MessageFooter>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              )}
            </For>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </div>
  );
}

export function AttachmentDemo() {
  return (
    <div class={wide}>
      <AttachmentGroup>
        <Attachment>
          <AttachmentMedia>
            <FileText />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>report.pdf</AttachmentTitle>
            <AttachmentDescription>2.4 MB</AttachmentDescription>
          </AttachmentContent>
        </Attachment>
        <Attachment state="error">
          <AttachmentMedia>
            <FileText />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>notes.txt</AttachmentTitle>
            <AttachmentDescription>Upload failed</AttachmentDescription>
          </AttachmentContent>
        </Attachment>
      </AttachmentGroup>
    </div>
  );
}
