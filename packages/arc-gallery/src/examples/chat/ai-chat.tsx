import { createSignal } from "@barqjs/core";
import { type AIMessage, type AIToolCall, AIChatPanel } from "@barqjs/arc/chat";
import { layout, surface } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";

const demo = layer("demo");
const frame = demo(surface.card, layout.column, { height: "32rem" });

const ANSWER = `Acme's **error budget** for checkout is 0.1% of requests a month. This month used **62%** of it, almost all in the incident on the 14th.

Three things would bring it down:

1. Roll back automatically when the error rate passes 2% for five minutes.
2. Add a canary stage in eu-west-1 before the full rollout.
3. Alert on the card processor's latency, not only on errors.

I've drafted the rollback rule for you to approve.`;

const SOURCES = [
  {
    title: "Checkout SLO",
    href: "https://example.com/slo/checkout",
    snippet: "99.9% of requests succeed, measured monthly.",
  },
  { title: "Incident 2041 postmortem", href: "https://example.com/incidents/2041" },
];

/** A reply as a model streams it: a tool call, then the text a few characters at a time. */
function stream(onUpdate: (message: AIMessage) => void, isStopped: () => boolean): void {
  const id = `assistant-${Date.now()}`;
  const call: AIToolCall = {
    id: `${id}-tool`,
    name: "query_metrics",
    state: "running",
    input: { service: "checkout", window: "30d" },
  };
  onUpdate({ id, role: "assistant", parts: [{ type: "tool", call }], status: "streaming" });
  setTimeout(() => {
    const done: AIToolCall = {
      ...call,
      state: "done",
      output: "errors: 41,208 of 66.4M requests (0.062%)",
    };
    let shown = 0;
    function tick(): void {
      if (isStopped()) {
        onUpdate({
          id,
          role: "assistant",
          parts: [
            { type: "tool", call: done },
            { type: "text", text: ANSWER.slice(0, shown) },
          ],
          status: "stopped",
        });
        return;
      }
      shown = Math.min(ANSWER.length, shown + 6);
      const finished = shown === ANSWER.length;
      onUpdate({
        id,
        role: "assistant",
        parts: [
          { type: "tool", call: done },
          { type: "text", text: ANSWER.slice(0, shown) },
          ...(finished
            ? [
                {
                  type: "tool" as const,
                  call: {
                    id: `${id}-rule`,
                    name: "create_rollback_rule",
                    state: "awaiting-approval" as const,
                    input: { threshold: "2%", window: "5m" },
                  },
                },
              ]
            : []),
        ],
        status: finished ? "done" : "streaming",
        citations: finished ? SOURCES : undefined,
      });
      if (!finished) setTimeout(tick, 30);
    }
    tick();
  }, 900);
}

export default function AIChat() {
  const [messages, setMessages] = createSignal<readonly AIMessage[]>([]);
  let stopped = false;

  function put(message: AIMessage): void {
    const others = messages().filter((one) => one.id !== message.id);
    setMessages(
      others.length === messages().length
        ? [...messages(), message]
        : messages().map((one) => (one.id === message.id ? message : one)),
    );
  }
  function ask(text: string): void {
    stopped = false;
    put({ id: `user-${Date.now()}`, role: "user", parts: [{ type: "text", text }] });
    stream(put, () => stopped);
  }
  function settleTool(call: AIToolCall, message: AIMessage, state: "approved" | "rejected"): void {
    put({
      ...message,
      parts: message.parts.map((part) =>
        part.type === "tool" && part.call.id === call.id
          ? { type: "tool", call: { ...call, state } }
          : part,
      ),
    });
  }

  return (
    <div class={frame}>
      <AIChatPanel
        aria-label="Acme assistant"
        messages={messages()}
        placeholder="Ask about Acme's services"
        suggestions={[
          "How much of the checkout error budget is left?",
          "Summarise yesterday's deploys",
        ]}
        onSend={ask}
        onStop={() => {
          stopped = true;
        }}
        onRegenerate={(message) => {
          setMessages(messages().filter((one) => one.id !== message.id));
          stopped = false;
          stream(put, () => stopped);
        }}
        onApprove={(call, message) => settleTool(call, message, "approved")}
        onReject={(call, message) => settleTool(call, message, "rejected")}
      />
    </div>
  );
}
