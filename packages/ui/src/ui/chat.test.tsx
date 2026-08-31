import { describe, expect, test } from "bun:test";
import { render } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "./attachment.tsx";
import { Bubble, BubbleContent, BubbleGroup, BubbleReactions } from "./bubble.tsx";
import { Marker, MarkerContent, MarkerIcon } from "./marker.tsx";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from "./message.tsx";

const slot = (name: string): HTMLElement =>
  document.querySelector(`[data-slot="${name}"]`) as HTMLElement;

describe("Marker", () => {
  test("the separator draws its rules with pseudo-elements, not with elements", () => {
    // The label stays centred whatever its length, and no measurement is
    // involved.
    render(() => (
      <Marker variant="separator">
        <MarkerContent>Yesterday</MarkerContent>
      </Marker>
    ));
    const rules = rulesFor(slot("marker").className);
    expect(rules).toContain("::before");
    expect(rules).toContain("::after");
    expect(rules).toContain("background-color: var(--border)");
  });

  test("the variant is an attribute, because the content reads it", () => {
    render(() => (
      <Marker variant="separator">
        <MarkerContent>Yesterday</MarkerContent>
      </Marker>
    ));
    expect(slot("marker").getAttribute("data-variant")).toBe("separator");
    expect(rulesFor(slot("marker-content").className)).toContain(
      '[data-slot="marker"][data-variant="separator"]',
    );
  });

  test("the icon is decoration, so it is hidden from a screen reader", () => {
    render(() => (
      <Marker>
        <MarkerIcon>*</MarkerIcon>
        <MarkerContent>Unread</MarkerContent>
      </Marker>
    ));
    expect(slot("marker-icon").getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Bubble", () => {
  test("the variant paints the CONTENT, not the bubble", () => {
    // A bubble is a column: the content, and whatever sits under it. Painting
    // the bubble would paint the timestamp and the reactions too.
    render(() => (
      <Bubble>
        <BubbleContent>Hello</BubbleContent>
      </Bubble>
    ));
    const rules = rulesFor(slot("bubble").className);
    expect(rules).toContain('[data-slot="bubble-content"]');
    expect(rules).toContain("background-color: var(--primary)");
    expect(rulesFor(slot("bubble-content").className)).not.toContain(
      "background-color: var(--primary)",
    );
  });

  test("align is an attribute both the bubble and its content read", () => {
    render(() => (
      <Bubble align="end">
        <BubbleContent>Hello</BubbleContent>
      </Bubble>
    ));
    expect(slot("bubble").getAttribute("data-align")).toBe("end");
    expect(rulesFor(slot("bubble-content").className)).toContain(
      '[data-slot="bubble"][data-align="end"]',
    );
  });

  test("each variant is a different rule, not the same one twice", () => {
    render(() => (
      <BubbleGroup>
        <Bubble variant="outline">
          <BubbleContent>A</BubbleContent>
        </Bubble>
      </BubbleGroup>
    ));
    const outline = slot("bubble").className;
    render(() => (
      <Bubble variant="destructive">
        <BubbleContent>B</BubbleContent>
      </Bubble>
    ));
    const destructive = [...document.querySelectorAll('[data-slot="bubble"]')].at(-1)?.className;
    expect(outline).not.toBe(destructive);
  });

  test("the reactions strip takes a side and an alignment", () => {
    render(() => (
      <Bubble>
        <BubbleContent>Hello</BubbleContent>
        <BubbleReactions side="top" align="start">
          +1
        </BubbleReactions>
      </Bubble>
    ));
    const strip = slot("bubble-reactions");
    expect(strip.getAttribute("data-side")).toBe("top");
    expect(strip.getAttribute("data-align")).toBe("start");
    const rules = rulesFor(strip.className);
    expect(rules).toContain("top: 0px");
    expect(rules).toContain("position: absolute");
  });
});

describe("Message", () => {
  test("the whole row turns over, rather than each part being placed twice", () => {
    render(() => (
      <MessageGroup>
        <Message align="end">
          <MessageContent>
            <Bubble align="end">
              <BubbleContent>On my way</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      </MessageGroup>
    ));
    expect(slot("message").getAttribute("data-align")).toBe("end");
    expect(rulesFor(slot("message").className)).toContain("flex-direction: row-reverse");
  });

  test("a footer lifts the avatar, so it sits beside the bubble and not the timestamp", () => {
    render(() => (
      <Message>
        <MessageAvatar>SA</MessageAvatar>
        <MessageContent>
          <Bubble>
            <BubbleContent>Hi</BubbleContent>
          </Bubble>
          <MessageFooter>Sent</MessageFooter>
        </MessageContent>
      </Message>
    ));
    expect(rulesFor(slot("message-avatar").className)).toContain(
      '[data-slot="message"]:has([data-slot="message-footer"])',
    );
  });

  test("the header and the footer read the same band", () => {
    render(() => (
      <Message>
        <MessageContent>
          <MessageHeader>Ada</MessageHeader>
          <MessageFooter>Sent</MessageFooter>
        </MessageContent>
      </Message>
    ));
    expect(rulesFor(slot("message-header").className)).toContain("color: var(--muted-foreground)");
    expect(rulesFor(slot("message-footer").className)).toContain("justify-content: flex-end");
  });
});

describe("Attachment", () => {
  test("the state and the size are attributes the parts read", () => {
    // One write on the card changes the icon, the title and the description.
    render(() => (
      <Attachment state="error" size="sm">
        <AttachmentMedia>!</AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>report.pdf</AttachmentTitle>
          <AttachmentDescription>Upload failed</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
    ));
    const card = slot("attachment");
    expect(card.getAttribute("data-state")).toBe("error");
    expect(card.getAttribute("data-size")).toBe("sm");
    expect(rulesFor(slot("attachment-media").className)).toContain(
      '[data-slot="attachment"][data-state="error"]',
    );
    expect(rulesFor(slot("attachment-description").className)).toContain(
      '[data-slot="attachment"][data-state="error"]',
    );
  });

  test("idle is dashed, because the card is a drop target rather than a file", () => {
    render(() => <Attachment state="idle" />);
    // Four longhands, because that is what a border-style atom is.
    expect(rulesFor(slot("attachment").className)).toContain("border-top-style: dashed");
  });

  test("the trigger is a sibling under the actions, not a button around them", () => {
    // A button around the card would put the remove button inside a button.
    render(() => (
      <Attachment>
        <AttachmentTrigger />
        <AttachmentActions>x</AttachmentActions>
      </Attachment>
    ));
    const press = slot("attachment-trigger");
    expect(press.tagName.toLowerCase()).toBe("button");
    expect(press.getAttribute("type")).toBe("button");
    expect(rulesFor(press.className)).toContain("z-index: 10");
    expect(rulesFor(slot("attachment-actions").className)).toContain("z-index: 20");
  });

  test("a group scrolls sideways and snaps, with no scrollbar of its own", () => {
    render(() => (
      <AttachmentGroup>
        <Attachment />
      </AttachmentGroup>
    ));
    const rules = rulesFor(slot("attachment-group").className);
    expect(rules).toContain("overflow-x: auto");
    expect(rules).toContain("scroll-snap-align: start");
    expect(rules).toContain("scrollbar-width: none");
  });
});
