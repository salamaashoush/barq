import { anchor, type DocsSection } from "../../docs.tsx";
import { CodeBlock } from "../code.tsx";
import declarations from "./snippets/server-rendering/declarations.tsx?raw";
import frame from "./snippets/server-rendering/frame.tsx?raw";
import handler from "./snippets/server-rendering/handler.tsx?raw";
import memoOptions from "./snippets/server-rendering/memo-options.tsx?raw";
import trace from "./snippets/server-rendering/trace.ts?raw";

export const sections: readonly DocsSection[] = [
  { id: "request", label: "The request" },
  { id: "handler", label: "A handler of your own" },
  { id: "memos", label: "Where a memo's value comes from" },
  { id: "trace", label: "The trace" },
  { id: "frames", label: "Frames" },
];

export function Body() {
  return (
    <>
      <p>
        A page is rendered on the server by <code>@barqjs/server</code>, and the router and{" "}
        <code>@barqjs/start</code> drive it for you. This page is about what they drive: the event a
        request runs under, the response head it builds, the options that decide where an async
        value comes from, and frames, regions the server renders on their own. The names are Solid
        2.0's, whose engine barq runs on.
      </p>

      <h2 class={anchor} id="request">
        The request
      </h2>
      <p>
        Everything a request runs sees one event: <code>getRequestEvent()</code> returns its{" "}
        <code>request</code>, a <code>locals</code> bag middleware fills, and the{" "}
        <code>response</code> head. A component declares the status and headers it needs for as long
        as it is rendered, and takes them back when it goes: an error boundary that recovers
        un-declares its 500 without touching the 404 the page around it declared.
      </p>
      <CodeBlock code={declarations} />
      <p>
        The head is committed when it leaves for the wire. After that a declaration, a{" "}
        <code>setCookie</code> or a write to the head's own <code>headers</code> changes nothing,
        and a development build reports it as <code>LATE_HEADER_WRITE</code>.
      </p>

      <h2 class={anchor} id="handler">
        A handler of your own
      </h2>
      <p>
        Without the router, a server runs the same lifecycle by hand.{" "}
        <code>createRequestEvent</code> builds the event and <code>provideRequestEvent</code> enters
        it. A page leaves through <code>createSSRResponse</code>, which answers when the shell
        flushes and turns a <code>Location</code> set before then into a real redirect. Anything
        else leaves through <code>commitEventResponse</code>, which folds the head onto a new
        response: the cookies are added, a missing header filled in, the status kept.
      </p>
      <CodeBlock code={handler} />
      <p>
        <code>composeMiddleware</code> composes <code>(request, next)</code> functions, and{" "}
        <code>next(request)</code> hands a different request down. The router's page handler commits
        at its own edge instead, once its request middleware has unwound, so a middleware may still
        set a cookie after <code>next()</code>.
      </p>

      <h2 class={anchor} id="memos">
        Where a memo's value comes from
      </h2>
      <p>
        By default the server's value of an async memo is sent with the page and the browser adopts
        it without running the compute. <code>ssrSource</code> changes that per memo, and{" "}
        <code>deferStream</code> changes when the shell may flush.
      </p>
      <CodeBlock code={memoOptions} />
      <ul>
        <li>
          <code>deferStream: true</code> holds a streamed shell until the memo's first value, so the
          boundary around it ships content instead of a fallback.
        </li>
        <li>
          <code>ssrSource: "hybrid"</code> also continues a compute that returned an async iterable:
          the browser runs it again once the page is claimed and picks up from the server's value.
        </li>
        <li>
          <code>ssrSource: "client"</code> never runs on the server. With a{" "}
          <code>loadingValue</code> the server renders that value; without one the{" "}
          <code>Loading</code> around it ships its fallback and the browser renders the content.
        </li>
      </ul>

      <h2 class={anchor} id="trace">
        The trace
      </h2>
      <p>
        <code>getTraceContext()</code> is the W3C trace the request belongs to: continued from an
        incoming <code>traceparent</code>, or started here, and one object for the whole request. A
        server function forwards it to the service it calls.
      </p>
      <CodeBlock code={trace} />
      <p>
        When the incoming trace was sampled, the browser is told too: a <code>Server-Timing</code>{" "}
        entry on the response and a <code>{'<meta name="traceparent">'}</code> in the document's
        head, which is what a browser tracing library reads.
      </p>

      <h2 class={anchor} id="frames">
        Frames
      </h2>
      <p>
        A server function whose handler returns a component answers with a frame: a region of markup
        the server rendered, which the page can ask for again and apply where it stands. The
        component never reaches the browser. Its props are slots, positions it marks for the page to
        fill: <code>props.children</code>, and a call such as <code>props.comment(...)</code> whose
        arguments cross as data and whose children cross as server markup.
      </p>
      <CodeBlock code={frame} />
      <p>
        A route renders the frame its loader answered with. On the first request the server writes
        it into the page, and the browser claims it without asking for anything, the slots' content
        with it, as hydration claims the rest of the page. Asking for the same story again hands
        back the same component, so nothing remounts: the new markup is morphed into the region, and
        a comment the reader collapsed stays collapsed. A stylesheet the region names is loaded
        before the update is shown.
      </p>
      <p>
        A slot the component calls and reads rather than places is a binding slot:{" "}
        <code>{"const like = props.like({ cid })"}</code>, then{" "}
        <code>{"<button class={{ liked: like.liked }} onClick={like.toggle}>"}</code>. The markup is
        the server's and the behaviour is the page's: the page's fill returns the object each
        position reads, an attribute, a class name, a style property, a handler, a ref or a text
        child, and owns those positions from then on. The server never has the values to compute
        with, so anything decided from one is decided in the fill.
      </p>
      <p>
        A mutation that calls <code>invalidateFrames(getStory)</code> answers with the story's
        region beside its value, in one request, applied where the region stands before the caller
        sees the value. A frame read through <code>live(getBoard)()</code> stays current over one
        connection: the server renders it again each time a source it reads moves, and each
        rendering is applied in place.
      </p>
    </>
  );
}
