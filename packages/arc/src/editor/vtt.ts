/**
 * The words that go with a recording, as files and as lines a person writes:
 * WebVTT captions, and an audio description of `m:ss words` lines.
 */

/** One line of captions: what is said, and when, in seconds. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

const RLM = "‏";
const STRONG_RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/u;
const STRONG = /\p{L}/u;

/** The direction a text reads in, from its first letter; `null` for one with no letters. */
export function textDirection(text: string): "ltr" | "rtl" | null {
  for (const character of text) {
    if (STRONG_RTL.test(character)) return "rtl";
    if (STRONG.test(character)) return "ltr";
  }
  return null;
}

function pad(part: number, size = 2): string {
  return String(part).padStart(size, "0");
}

function stamp(value: number): string {
  const total = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor(total / 60_000) % 60;
  const secs = Math.floor(total / 1000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(total % 1000, 3)}`;
}

/** Seconds from a WebVTT timestamp such as `00:01:02.500` or `01:02.500`. */
function seconds(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})$/.exec(value.trim());
  if (match === null) return null;
  const [, hours = "0", minutes = "0", secs = "0", millis = "0"] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(secs) + Number(millis) / 1000;
}

/**
 * Captions as a WebVTT file, in time order, empty lines left out. A line that
 * reads right to left starts with a right-to-left mark, so a player lays it
 * out that way even when it opens with a number or a Latin word.
 */
export function vttOf(cues: readonly Cue[]): string {
  const lines = ["WEBVTT", ""];
  for (const cue of cues.toSorted((a, b) => a.start - b.start)) {
    const text = cue.text.trim();
    if (text === "" || cue.end <= cue.start) continue;
    lines.push(`${stamp(cue.start)} --> ${stamp(cue.end)}`);
    for (const line of text.split("\n")) {
      lines.push(textDirection(line) === "rtl" ? `${RLM}${line}` : line);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** The cues of a WebVTT file, without the marks added for direction. */
export function parseVtt(source: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of source.replaceAll("\r\n", "\n").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((line) => line.includes("-->"));
    if (at < 0) continue;
    const [from = "", rest = ""] = lines[at]?.split("-->") ?? [];
    const start = seconds(from);
    const end = seconds(rest.trim().split(/\s+/)[0] ?? "");
    if (start === null || end === null) continue;
    cues.push({
      start,
      end,
      text: lines
        .slice(at + 1)
        .map((line) => line.replaceAll(RLM, ""))
        .join("\n")
        .trim(),
    });
  }
  return cues;
}

/** A time as a person reads and types it: `1:02.5`. */
export function formatCueTime(value: number): string {
  const tenths = Math.max(0, Math.round(value * 10));
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${String(minutes)}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** Seconds from a time a person typed, `1:02.5` or `62.5`; `null` when it reads as none. */
export function parseCueTime(value: string): number | null {
  const match = /^\s*(?:(\d+):)?(\d+(?:[.,]\d+)?)\s*$/.exec(westernDigits(value));
  if (match === null) return null;
  const [, minutes = "0", secs = "0"] = match;
  return Number(minutes) * 60 + Number(secs.replace(",", "."));
}

/** A moment as a player's clock shows it: `1:05`, `1:02:05`. */
export function mediaClock(value: number): string {
  const whole = Math.max(0, Math.floor(value));
  const minutes = Math.floor(whole / 60);
  const hours = Math.floor(minutes / 60);
  const ss = pad(whole % 60);
  return hours > 0 ? `${String(hours)}:${pad(minutes % 60)}:${ss}` : `${String(minutes)}:${ss}`;
}

/** Digits of any script written as 0 to 9. */
function westernDigits(text: string): string {
  return text.replaceAll(/\p{Nd}/gu, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    // Each script's digits run from its zero in Unicode order.
    for (const zero of [0x0660, 0x06f0, 0x0966, 0x09e6]) {
      if (code >= zero && code <= zero + 9) return String(code - zero);
    }
    return digit;
  });
}

export const MAX_DESCRIPTIONS = 200;
export const MAX_DESCRIPTION = 500;
/** As long as the description's lines may run, together. */
export const MAX_DESCRIPTION_TEXT = 40_000;

/** A line of an audio description: from when, and what the picture shows. */
export interface Description {
  at: number;
  text: string;
}

const LINE = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\s+(.+)$/;

/**
 * A video's audio description, a time and what the picture shows from then a
 * line (`1:30 A map of the river`). Lines that are not such a line are left
 * out, the rest run in time order, and a time written twice keeps its first
 * words.
 */
export function parseDescriptions(text: string): Description[] {
  const found = new Map<number, string>();
  for (const line of westernDigits(text).split("\n")) {
    const match = LINE.exec(line.trim());
    if (match === null) continue;
    const [, hours = "0", minutes = "0", secs = "0", words = ""] = match;
    if (Number(secs) > 59 || (match[1] !== undefined && Number(minutes) > 59)) continue;
    const at = Number(hours) * 3600 + Number(minutes) * 60 + Number(secs);
    const kept = words.trim().slice(0, MAX_DESCRIPTION);
    if (kept !== "" && !found.has(at)) found.set(at, kept);
  }
  return [...found]
    .map(([at, kept]) => ({ at, text: kept }))
    .toSorted((a, b) => a.at - b.at)
    .slice(0, MAX_DESCRIPTIONS);
}
