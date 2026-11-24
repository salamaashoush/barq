import {
  type Child,
  For,
  Show,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { FileTrigger } from "@barqjs/aria/file-trigger";
import { useLocale } from "@barqjs/aria/i18n";
import { AudioLines } from "@barqjs/lucide/icons/audio-lines";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { Upload } from "@barqjs/lucide/icons/upload";
import { Button } from "@barqjs/ui/button";
import { Input } from "@barqjs/ui/input";
import { Label } from "@barqjs/ui/label";
import { NativeSelect, NativeSelectOption } from "@barqjs/ui/native-select";
import { Progress } from "@barqjs/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@barqjs/ui/tabs";
import { Textarea } from "@barqjs/ui/textarea";

import { IconButton } from "../components/icon-button.tsx";
import { MediaPlayer } from "../components/media-player.tsx";
import { useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, fg, gap, layout, place, plainList, rounded, surface, type } from "../style/index.ts";
import {
  type Cue,
  MAX_DESCRIPTION_TEXT,
  formatCueTime,
  mediaClock,
  parseCueTime,
  parseDescriptions,
  parseVtt,
  vttOf,
} from "./vtt.ts";

/** The languages captions are most often written in; any other is kept once chosen. */
const LANGUAGES = ["en", "ar", "fr", "de", "es", "it", "pt", "tr", "ru", "zh", "hi", "ur"] as const;

/** How often a draft under way is asked after, in milliseconds. */
const DRAFT_POLL_MS = 3000;

/** A draft of captions from the recording's speech, as a service reports it. */
export interface CaptionDraft {
  state: "queued" | "working" | "ready" | "failed";
  /** From 0 to 1 while working, where known. */
  progress?: number | null;
  vtt?: string | null;
}

/** A service that drafts captions from a recording's speech, for a person to check. */
export interface CaptionDrafts {
  /** The languages it drafts. */
  languages: readonly string[];
  /** Whether it drafts this recording, and the draft asked for, if any. */
  status: () => Promise<{ available: boolean; draft: CaptionDraft | null }>;
  /** Asks for a draft in a language. */
  request: (language: string) => Promise<void>;
}

export type TextTrack = "captions" | "descriptions" | "transcript";

export const textTracksStyles = variants({
  slots: {
    root: arc(layout.column, gap[4], layout.minZero),
    panel: arc(layout.column, gap[3]),
    hint: arc(type.caption, fg.muted),
    bar: arc(layout.row, layout.wrap, gap[2]),
    language: arc(layout.row, gap[2], layout.pushEnd, type.caption),
    lines: arc(plainList, layout.column, gap[3]),
    line: arc(surface.bordered, layout.column, gap[2], place.padded),
    times: arc(layout.row, gap[2]),
    time: arc(type.numeric, { width: "7rem" }),
    note: arc(rounded.md, place.padded, type.caption, fg.muted, edge.all),
    problem: arc(type.caption, fg.danger),
    footer: arc(layout.row, layout.wrap, gap[2], edge.top, { paddingBlockStart: "0.75rem" }),
    text: arc({ minBlockSize: "10rem" }),
  },
});

type Slots = ReturnType<typeof textTracksStyles>;

export interface TextTracksEditorProps extends Customisable<Slots> {
  /** Names the recording. */
  title: string;
  src: string;
  /** @default "video" */
  kind?: "video" | "audio";
  poster?: string;
  /** The captions it has now: a WebVTT file's address and its language. */
  captions?: { src?: string; language?: string };
  /** Stores the captions written, as a WebVTT file, in a language. */
  onSaveCaptions: (file: File, language: string) => Promise<void>;
  /** A video's audio description, as `m:ss words` lines. */
  descriptions?: string;
  onDescriptionsChange?: (text: string) => void;
  /** Everything the recording says, written out. */
  transcript?: string;
  onTranscriptChange?: (text: string) => void;
  /** Drafts captions from speech, where an app has such a service. */
  drafts?: CaptionDrafts;
  /** The tab it opens on. @default "captions" */
  defaultTab?: TextTrack;
  /** Told when the person is done: a Done button ends each tab. */
  onDone?: () => void;
}

/** A caption line as typed: its fields change in place, so typing never draws the list again. */
interface Line {
  key: number;
  start: string;
  end: string;
  text: string;
}

/**
 * The words that go with a recording, written beside it: its captions, its
 * audio description (a video's) and its transcript, a tab each, with the
 * recording playing above them.
 *
 * A caption line starts where the player stands when it is added, its times
 * typed as `1:02.5` and its start seeking the player when focused; saving
 * writes a WebVTT file, right-to-left lines marked so a player shows them
 * that way, and refuses a line whose end is not after its start. A WebVTT
 * file can be uploaded in place of the lines, and a service of the app's
 * drafts captions from the speech for a person to check. An audio
 * description line goes in at the player's time, in time order.
 */
export function TextTracksEditor(props: TextTracksEditorProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const cls = (): Slots => parts(textTracksStyles(), props.classes);
  const ids = {
    language: createUniqueId(),
    description: createUniqueId(),
    transcript: createUniqueId(),
  };
  let root: HTMLDivElement | undefined;
  let counter = 0;
  const [now, setNow] = createSignal(0, { ownedWrite: true });
  const [lines, setLines] = createSignal<Line[]>([], { ownedWrite: true });
  const [loading, setLoading] = createSignal(
    untrack(() => props.captions?.src !== undefined),
    {
      ownedWrite: true,
    },
  );
  const [language, setLanguage] = createSignal(
    untrack(() => props.captions?.language ?? locale().locale.split("-")[0] ?? "en"),
    { ownedWrite: true },
  );
  const [saving, setSaving] = createSignal(false, { ownedWrite: true });
  const [problem, setProblem] = createSignal<string | null>(null, { ownedWrite: true });
  const [described, setDescribed] = createSignal(
    untrack(() => props.descriptions ?? ""),
    {
      ownedWrite: true,
    },
  );
  const [transcript, setTranscript] = createSignal(
    untrack(() => props.transcript ?? ""),
    {
      ownedWrite: true,
    },
  );
  const [draft, setDraft] = createSignal<{ available: boolean; draft: CaptionDraft | null } | null>(
    null,
    { ownedWrite: true },
  );
  const [drafted, setDrafted] = createSignal(false, { ownedWrite: true });
  let asked = false;

  const lineOf = (cue: Cue): Line => ({
    key: (counter += 1),
    start: formatCueTime(cue.start),
    end: formatCueTime(cue.end),
    text: cue.text,
  });
  const take = (cues: readonly Cue[]): void => {
    setLines(cues.map(lineOf));
  };
  const player = (): HTMLMediaElement | null =>
    root?.querySelector<HTMLMediaElement>("video, audio") ?? null;

  const existing = untrack(() => props.captions?.src);
  if (existing !== undefined && typeof fetch === "function") {
    void fetch(existing)
      .then((response) => (response.ok ? response.text() : ""))
      .then((text) => take(parseVtt(text)))
      .catch(() => take([]))
      .finally(() => setLoading(false));
  }

  const drafts = untrack(() => props.drafts);
  const waiting = (): boolean => {
    const state = draft()?.draft?.state;
    return state === "queued" || state === "working";
  };
  if (drafts !== undefined) {
    const ask = (): void => {
      void drafts
        .status()
        .then((found) => {
          setDraft(found);
          const vtt = found.draft?.state === "ready" ? found.draft.vtt : null;
          if (asked && vtt !== null && vtt !== undefined) {
            take(parseVtt(vtt));
            setDrafted(true);
            asked = false;
          }
        })
        .catch(() => undefined);
    };
    ask();
    const timer = setInterval(() => {
      if (untrack(waiting)) ask();
    }, DRAFT_POLL_MS);
    onCleanup(() => clearInterval(timer));
  }
  const draftable = (): boolean =>
    draft()?.available === true && (drafts?.languages.includes(language()) ?? false);
  const requestDraft = (): void => {
    if (drafts === undefined) return;
    setProblem(null);
    drafts.request(language()).then(
      () => {
        asked = true;
        setDraft({ available: true, draft: { state: "queued", progress: null, vtt: null } });
      },
      () => setProblem(messages().draftFailed),
    );
  };
  const readyDraft = (): string | null => {
    const found = draft()?.draft;
    return found?.state === "ready" ? (found.vtt ?? null) : null;
  };

  const names = createMemo(() => new Intl.DisplayNames([locale().locale], { type: "language" }));
  const choices = (): readonly string[] =>
    (LANGUAGES as readonly string[]).includes(language()) ? LANGUAGES : [language(), ...LANGUAGES];

  const addLine = (): void => {
    const at = player()?.currentTime ?? now();
    const next = lines()
      .map((line) => parseCueTime(line.start))
      .filter((start): start is number => start !== null && start > at)
      .toSorted((a, b) => a - b)[0];
    const end = Math.min(at + 3, next ?? Number.POSITIVE_INFINITY);
    const line = lineOf({ start: at, end: end > at ? end : at + 3, text: "" });
    setLines(
      [...lines(), line].toSorted(
        (a, b) => (parseCueTime(a.start) ?? 0) - (parseCueTime(b.start) ?? 0),
      ),
    );
  };
  const change = (line: Line, patch: Partial<Line>): void => {
    Object.assign(line, patch);
  };

  const save = (): void => {
    const cues: Cue[] = [];
    for (const line of lines()) {
      const start = parseCueTime(line.start);
      const end = parseCueTime(line.end);
      if (line.text.trim() === "") continue;
      if (start === null || end === null || end <= start) {
        setProblem(messages().captionsTimeProblem);
        return;
      }
      cues.push({ start, end, text: line.text });
    }
    setSaving(true);
    setProblem(null);
    props
      .onSaveCaptions(new File([vttOf(cues)], "captions.vtt", { type: "text/vtt" }), language())
      .then(
        () => props.onDone?.(),
        () => setProblem(messages().captionsSaveFailed),
      )
      .finally(() => setSaving(false));
  };

  const skipped = (): number =>
    described()
      .split("\n")
      .filter((line) => line.trim() !== "" && parseDescriptions(line).length === 0).length;
  let descriptionField: HTMLTextAreaElement | undefined;
  const addDescription = (): void => {
    const at = Math.floor(player()?.currentTime ?? now());
    const text = described();
    const rows = text === "" ? [] : text.split("\n");
    const later = rows.findIndex((row) => (parseDescriptions(row)[0]?.at ?? -1) > at);
    const spot = later === -1 ? rows.length : later;
    const row = `${mediaClock(at)} `;
    const next = [...rows.slice(0, spot), row, ...rows.slice(spot)];
    const joined = next.join("\n");
    setDescribed(joined);
    props.onDescriptionsChange?.(joined);
    const caret = next.slice(0, spot).reduce((sum, item) => sum + item.length + 1, 0) + row.length;
    queueMicrotask(() => {
      descriptionField?.focus();
      descriptionField?.setSelectionRange(caret, caret);
    });
  };

  const video = (): boolean => (props.kind ?? "video") === "video";
  const done = (): Child => (
    <Show when={props.onDone !== undefined}>
      <Button class={layout.pushEnd} onPress={() => props.onDone?.()}>
        {messages().done}
      </Button>
    </Show>
  );

  return (
    <div
      ref={(element: HTMLDivElement) => {
        root = element;
      }}
      class={arc(cls().root, props.class, props.className)}
      data-slot="text-tracks"
    >
      <MediaPlayer
        title={props.title}
        src={props.src}
        kind={props.kind}
        poster={props.poster}
        tracks={
          props.captions?.src === undefined
            ? undefined
            : [
                {
                  src: props.captions.src,
                  srclang: language(),
                  label: names().of(language()) ?? language(),
                  default: true,
                },
              ]
        }
        onTimeUpdate={(seconds: number) => setNow(seconds)}
      />
      <Tabs defaultValue={untrack(() => props.defaultTab ?? "captions")}>
        <TabsList aria-label={messages().textTracks}>
          <TabsTrigger value="captions">{messages().captions}</TabsTrigger>
          <Show when={video()}>
            <TabsTrigger value="descriptions">{messages().audioDescription}</TabsTrigger>
          </Show>
          <TabsTrigger value="transcript">{messages().transcript}</TabsTrigger>
        </TabsList>
        <TabsContent value="captions">
          <div class={cls().panel} data-slot="text-tracks-captions">
            <p class={cls().hint}>{messages().captionsHint}</p>
            <div class={cls().bar}>
              <Button variant="outline" size="sm" onPress={addLine}>
                <Plus aria-hidden="true" />
                {messages().addCaptionLine}
              </Button>
              <Show when={draftable() && !waiting()}>
                <Button variant="outline" size="sm" onPress={requestDraft}>
                  <AudioLines aria-hidden="true" />
                  {messages().draftCaptions}
                </Button>
              </Show>
              <span class={cls().language}>
                <Label for={ids.language}>{messages().captionsLanguage}</Label>
                <NativeSelect
                  id={ids.language}
                  size="sm"
                  value={language()}
                  onChange={(event: Event) =>
                    setLanguage((event.currentTarget as HTMLSelectElement).value)
                  }
                >
                  <For each={choices()}>
                    {(code: string) => (
                      <NativeSelectOption value={code}>
                        {names().of(code) ?? code}
                      </NativeSelectOption>
                    )}
                  </For>
                </NativeSelect>
              </span>
            </div>
            <Show when={draftable() && waiting()}>
              <Progress
                label={(() => {
                  const progress = draft()?.draft?.progress;
                  return progress === null || progress === undefined
                    ? messages().draftWaiting
                    : messages().drafting(Math.round(progress * 100));
                })()}
                isIndeterminate={(draft()?.draft?.progress ?? null) === null}
                value={Math.round((draft()?.draft?.progress ?? 0) * 100)}
              />
            </Show>
            <Show when={readyDraft() !== null && !drafted() && lines().length === 0 && !loading()}>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  take(parseVtt(readyDraft() ?? ""));
                  setDrafted(true);
                }}
              >
                {messages().useDraft}
              </Button>
            </Show>
            <Show when={draft()?.draft?.state === "failed"}>
              <p class={cls().problem}>{messages().draftFailed}</p>
            </Show>
            <Show when={drafted()}>
              <p class={cls().note} role="note">
                {messages().draftNote}
              </p>
            </Show>
            <Show
              when={lines().length > 0}
              fallback={
                <p class={cls().hint} aria-busy={loading() ? "true" : undefined}>
                  {loading() ? "" : messages().captionsEmpty}
                </p>
              }
            >
              <ol class={cls().lines} data-slot="text-tracks-lines">
                <For each={lines()}>
                  {(line: Line, index: () => number) => (
                    <li class={cls().line}>
                      <div class={cls().times}>
                        <Input
                          class={cls().time}
                          aria-label={messages().captionStart(index() + 1)}
                          value={line.start}
                          inputMode="decimal"
                          dir="ltr"
                          onInput={(event: Event) =>
                            change(line, {
                              start: (event.currentTarget as HTMLInputElement).value,
                            })
                          }
                          onFocus={() => {
                            const at = parseCueTime(line.start);
                            const media = player();
                            if (media !== null && at !== null) media.currentTime = at;
                          }}
                        />
                        <span aria-hidden="true">–</span>
                        <Input
                          class={cls().time}
                          aria-label={messages().captionEnd(index() + 1)}
                          value={line.end}
                          inputMode="decimal"
                          dir="ltr"
                          onInput={(event: Event) =>
                            change(line, {
                              end: (event.currentTarget as HTMLInputElement).value,
                            })
                          }
                        />
                        <IconButton
                          class={layout.pushEnd}
                          label={messages().removeCaptionLine(index() + 1)}
                          size="sm"
                          onPress={() => setLines(lines().filter((one) => one.key !== line.key))}
                        >
                          <Trash2 />
                        </IconButton>
                      </div>
                      <Textarea
                        aria-label={messages().captionText(index() + 1)}
                        value={line.text}
                        dir="auto"
                        rows={2}
                        maxLength={500}
                        onInput={(event: Event) =>
                          change(line, {
                            text: (event.currentTarget as HTMLTextAreaElement).value,
                          })
                        }
                      />
                    </li>
                  )}
                </For>
              </ol>
            </Show>
            <div class={cls().footer}>
              <FileTrigger
                acceptedFileTypes={[".vtt", "text/vtt"]}
                onSelect={(files: FileList | null) => {
                  const file = files?.[0];
                  if (file !== undefined) void file.text().then((text) => take(parseVtt(text)));
                }}
              >
                <Button variant="ghost" size="sm" isDisabled={saving()}>
                  <Upload aria-hidden="true" />
                  {messages().uploadCaptions}
                </Button>
              </FileTrigger>
              <Show when={problem()}>
                <p class={cls().problem} role="alert">
                  {problem()}
                </p>
              </Show>
              <Button
                class={layout.pushEnd}
                isPending={saving()}
                isDisabled={loading()}
                onPress={save}
              >
                {messages().saveCaptions}
              </Button>
            </div>
          </div>
        </TabsContent>
        <Show when={video()}>
          <TabsContent value="descriptions">
            <div class={cls().panel} data-slot="text-tracks-descriptions">
              <div class={cls().bar}>
                <p class={cls().hint}>{messages().descriptionsHelp}</p>
                <Button variant="outline" size="sm" class={layout.pushEnd} onPress={addDescription}>
                  <Plus aria-hidden="true" />
                  {messages().descriptionAddAt(mediaClock(now()))}
                </Button>
              </div>
              <Label for={ids.description}>{messages().audioDescription}</Label>
              <Textarea
                ref={(element: HTMLTextAreaElement) => {
                  descriptionField = element;
                }}
                id={ids.description}
                class={cls().text}
                dir="auto"
                value={described()}
                maxLength={MAX_DESCRIPTION_TEXT}
                placeholder={messages().descriptionsHint}
                onInput={(event: Event) => {
                  const text = (event.currentTarget as HTMLTextAreaElement).value;
                  setDescribed(text);
                  props.onDescriptionsChange?.(text);
                }}
              />
              <Show when={skipped() > 0}>
                <p class={cls().problem}>{messages().descriptionsSkipped(skipped())}</p>
              </Show>
              <div class={cls().footer}>{done()}</div>
            </div>
          </TabsContent>
        </Show>
        <TabsContent value="transcript">
          <div class={cls().panel} data-slot="text-tracks-transcript">
            <Label for={ids.transcript}>{messages().transcript}</Label>
            <Textarea
              id={ids.transcript}
              class={cls().text}
              dir="auto"
              value={transcript()}
              maxLength={20_000}
              placeholder={messages().transcriptHint}
              onInput={(event: Event) => {
                const text = (event.currentTarget as HTMLTextAreaElement).value;
                setTranscript(text);
                props.onTranscriptChange?.(text);
              }}
            />
            <div class={cls().footer}>{done()}</div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
