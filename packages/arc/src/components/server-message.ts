import { notFound } from "@barqjs/router";

import type { ServerErrors } from "./form.tsx";

/** What a failed call to a server says, read off whatever it threw. */
export interface ServerProblem {
  /** The HTTP status, when the error carries one. */
  status: number | undefined;
  /** The API's stable code: `"mfa_required"`, `"conflict"`. */
  code: string | undefined;
  /** The input field at fault, as the API names it. */
  field: string | undefined;
  /** The server's own words, as it wrote them. */
  message: string | undefined;
}

/**
 * What a failure means to the reader, which decides what a status page
 * offers: a way out, signing in, or trying again.
 */
export type ServerErrorKind =
  | "not-found"
  | "forbidden"
  | "gone"
  | "signed-out"
  | "offline"
  | "unreachable"
  | "failed";

interface Fields {
  readonly [key: string]: unknown;
}

function record(value: unknown): Fields | undefined {
  return typeof value === "object" && value !== null ? (value as Fields) : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * The status, code, field and message of a failure, from an error class of
 * the app's own (`status`, `code`, `field`, `message`), an API body
 * (`{ error: { code, message, field } }`), a plain `Error` or a string.
 * What it does not carry is `undefined`.
 */
export function serverProblem(error: unknown): ServerProblem {
  if (typeof error === "string") {
    return { status: undefined, code: undefined, field: undefined, message: text(error) };
  }
  const outer = record(error);
  const body = record(outer?.error) ?? record(record(outer?.body)?.error) ?? record(outer?.body);
  return {
    status: number(outer?.status) ?? number(outer?.statusCode) ?? number(body?.status),
    code: text(outer?.code) ?? text(body?.code),
    field: text(outer?.field) ?? text(body?.field),
    message: text(body?.message) ?? text(outer?.message),
  };
}

/**
 * A server's message as a sentence to read. An API writes its messages as
 * logs want them, lower case and unpunctuated ("webhook URLs must use
 * https"); under a field or after an alert's title they start with a
 * capital and end with a full stop.
 */
export function serverSentence(message: string): string {
  const trimmed = message.trim();
  if (trimmed === "") return trimmed;
  const capital = `${trimmed.charAt(0).toLocaleUpperCase()}${trimmed.slice(1)}`;
  return /[.!?…:)؟۔]$/u.test(capital) ? capital : `${capital}.`;
}

/** What a failure says, as a sentence, or `fallback` when it says nothing. */
export function serverMessage(error: unknown, fallback: string): string {
  const message = serverProblem(error).message;
  return message === undefined ? fallback : serverSentence(message);
}

/**
 * A failure as `setServerErrors` takes it: on the field it names, or on
 * the form when it names none.
 *
 * ```ts
 * catch (error) {
 *   setServerErrors(formApi, serverErrors(error, messages().somethingWentWrong));
 * }
 * ```
 */
export function serverErrors(error: unknown, fallback: string): ServerErrors {
  const field = serverProblem(error).field;
  const message = serverMessage(error, fallback);
  return field === undefined ? { form: message } : { fields: { [field]: message } };
}

// A server-rendered page hands its error to the browser as a plain `Error`
// with the message alone, so a gateway or network failure is also known by
// its words.
const UNREACHABLE =
  /bad gateway|service unavailable|gateway timeout|fetch failed|failed to fetch|networkerror|load failed/i;

/** What a failure means for the page it stopped. */
export function serverErrorKind(error: unknown): ServerErrorKind {
  const problem = serverProblem(error);
  const status = problem.status;
  if (status === 404) return "not-found";
  if (status === 403) return "forbidden";
  if (status === 410) return "gone";
  if (status === 401) return "signed-out";
  if (status !== undefined && status >= 502 && status <= 504) return "unreachable";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  if (UNREACHABLE.test(problem.message ?? "")) return "unreachable";
  return "failed";
}

/**
 * Rethrows a loader's failure for the router: a 404 as the router's
 * not-found, which a server render carries to the browser where an error
 * class of the app's own would arrive as a plain `Error`, and anything else
 * as it was.
 *
 * ```ts
 * loader: async ({ params }) => {
 *   try {
 *     return await api.check(params.id);
 *   } catch (error) {
 *     routeError(error);
 *   }
 * },
 * ```
 */
export function routeError(error: unknown): never {
  if (serverProblem(error).status === 404) notFound();
  throw error;
}
