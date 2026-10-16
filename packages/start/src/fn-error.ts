/**
 * How a server function's failure reaches its caller in the browser. Its own
 * module, so every module that answers a call can raise it and none of them
 * has to import the stub to do so.
 */

/** What a handler threw, as a development server tells its caller. */
export interface ServerFnThrown {
  readonly name: string;
  readonly message: string;
  /** Mapped to the source files by the development server. */
  readonly stack?: string;
}

/** One thing wrong with a call's input, and the path to the field it is about. */
export interface ServerFnIssue {
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

/** What a failed call's JSON body may carry. */
export interface FailedAnswer {
  readonly message?: string;
  readonly issues?: readonly ServerFnIssue[];
  readonly thrown?: ServerFnThrown;
}

/**
 * A server function answered with a failure.
 *
 * THE MESSAGE IS NOT THE HANDLER'S, and that is deliberate rather than
 * unfinished. `server.ts` refuses to put a handler's error text on the wire
 * because it can name a table, a column or a filesystem path, and none of that
 * is the caller's business — TanStack serialises the whole error object to the
 * client instead. What a caller legitimately needs is the STATUS, so it is here
 * as a field rather than something to parse back out of a string.
 */
export class ServerFnError extends Error {
  readonly status: number;
  /**
   * What was wrong with the input, for a 400 the validator refused: one entry
   * per issue, with the path to the field it is about. Sent in every build,
   * because it describes the caller's own input.
   */
  readonly issues?: readonly ServerFnIssue[];
  /**
   * What the handler threw: its name, message and source-mapped stack. Only a
   * development server sends it; in production this is `undefined`, so handle
   * a failure by its `status` rather than by this.
   */
  readonly thrown?: ServerFnThrown;
  /**
   * The answer itself, unread.
   *
   * The server's own refusals land here: a 400 for input, a 403 for an origin,
   * a 404, a 405, a 413. A `Response` a middleware or a handler THREW is not
   * wrapped at all; the call rejects with it. A handler's own failure has
   * nothing here worth reading: the server answers those with one fixed line,
   * for the reason above.
   */
  readonly response?: Response;
  constructor(id: string, status: number, response?: Response, answer?: FailedAnswer) {
    super(failureMessage(id, status, answer));
    this.name = "ServerFnError";
    this.status = status;
    this.response = response;
    if (answer?.issues !== undefined) this.issues = answer.issues;
    if (answer?.thrown !== undefined) this.thrown = answer.thrown;
  }
}

function failureMessage(id: string, status: number, answer: FailedAnswer | undefined): string {
  const issues = answer?.issues;
  if (issues !== undefined && issues.length > 0) {
    const listed = issues
      .map((issue) =>
        issue.path === undefined ? issue.message : `\`${issue.path.join(".")}\`: ${issue.message}`,
      )
      .join("; ");
    return (
      `The server function \`${id}\` refused its input (${status}): ${listed}. ` +
      "`error.issues` holds each issue with the path to its field."
    );
  }
  const thrown = answer?.thrown;
  if (thrown !== undefined) {
    return (
      `The server function \`${id}\` threw \`${thrown.name}: ${thrown.message}\` and answered ${status}. ` +
      "The server's stack is in `error.thrown.stack` and in the development overlay. A production " +
      "server sends only the status, so handle a failure by `error.status`."
    );
  }
  return (
    `The server function \`${id}\` answered ${status}. A handler's own error text is never sent to the browser, so read it in the server's log. ` +
    "`error.response` holds the server's answer."
  );
}
