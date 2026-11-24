import { $dfs } from "@lexical/utils";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";

import type { CommentComposerProps, CommentPerson, Mentionables } from "../components/comments.tsx";
import { useArcMessages } from "../components/messages.ts";
import { ChatComposer } from "./chat-composer.tsx";
import { $createMentionNode, $isMentionNode } from "./mention-node.ts";
import { commentPreset } from "./presets.ts";
import type { MentionCandidate, MentionSource } from "./typeahead.tsx";

function candidate(person: CommentPerson): MentionCandidate {
  return { id: person.id, name: person.name, avatar: person.src };
}

/** A comment's `mentionables` as the mention typeahead's source. */
function mentionSource(mentionables: Mentionables): MentionSource {
  if (typeof mentionables !== "function") return mentionables.map(candidate);
  return async (query) => (await mentionables(query)).map(candidate);
}

/** The text of a stored comment, its `@Name`s turned back into mentions. */
function fill(body: string, mentions: readonly CommentPerson[]): () => void {
  const names = mentions
    .toSorted((one, other) => other.name.length - one.name.length)
    .map((person) => ({ person, token: `@${person.name}` }));
  return () => {
    const root = $getRoot();
    for (const line of body.split("\n")) {
      const paragraph = $createParagraphNode();
      let rest = line;
      while (rest !== "") {
        let at = -1;
        let found: (typeof names)[number] | undefined;
        for (const one of names) {
          const index = rest.indexOf(one.token);
          if (index !== -1 && (at === -1 || index < at)) {
            at = index;
            found = one;
          }
        }
        if (found === undefined) {
          paragraph.append($createTextNode(rest));
          break;
        }
        if (at > 0) paragraph.append($createTextNode(rest.slice(0, at)));
        paragraph.append($createMentionNode({ id: found.person.id, name: found.person.name }));
        rest = rest.slice(at + found.token.length);
      }
      root.append(paragraph);
    }
  };
}

interface MentionMatch {
  node: LexicalNode;
}

/** The people the document still mentions, once each, in order. */
function mentioned(editor: LexicalEditor, known: readonly CommentPerson[]): CommentPerson[] {
  const people = new Map<string, CommentPerson>();
  editor.read(() => {
    for (const { node } of $dfs() as MentionMatch[]) {
      if (!$isMentionNode(node) || people.has(node.getMentionId())) continue;
      const id = node.getMentionId();
      people.set(id, known.find((one) => one.id === id) ?? { id, name: node.getMentionName() });
    }
  });
  return [...people.values()];
}

/**
 * `CommentComposer` on the rich editor: what `CommentThreadList` and
 * `CommentThread` write comments in when handed it as `composer`.
 *
 * ```tsx
 * import { RichCommentComposer } from "@barqjs/arc/editor";
 *
 * <CommentThreadList threads={threads()} composer={RichCommentComposer} mentionables={members()} … />
 * ```
 *
 * It takes the same props and hands over the same draft: the text, with each
 * mention written `@Name`, and the people it mentions, so threads store and
 * draw comments as they did. Mod+Enter sends and Enter starts a new
 * paragraph, `@` offers `mentionables` with their avatars as mention nodes,
 * Escape cancels, and a comment being edited opens with its mentions whole.
 */
export function RichCommentComposer(props: CommentComposerProps) {
  const messages = useArcMessages();
  let editor: LexicalEditor | undefined;
  function known(): readonly CommentPerson[] {
    return [
      ...(props.defaultMentions ?? []),
      ...(Array.isArray(props.mentionables)
        ? (props.mentionables as readonly CommentPerson[])
        : []),
    ];
  }
  return (
    <ChatComposer
      preset={commentPreset}
      class={props.class}
      className={props.className}
      label={props.label}
      placeholder={props.placeholder}
      sendOn="mod-enter"
      submitLabel={props.submitLabel ?? messages().comment}
      emojiButton={false}
      isDisabled={props.isDisabled}
      autoFocus={props.autoFocus}
      onCancel={props.onCancel}
      mentions={props.mentionables === undefined ? undefined : mentionSource(props.mentionables)}
      initialContent={
        props.defaultValue === undefined || props.defaultValue === ""
          ? undefined
          : fill(props.defaultValue, props.defaultMentions ?? [])
      }
      onEditor={(built) => {
        editor = built;
      }}
      onSend={(message) => {
        props.onSubmit({
          body: message.text.trim(),
          mentions: editor === undefined ? [] : mentioned(editor, known()),
        });
      }}
    />
  );
}
