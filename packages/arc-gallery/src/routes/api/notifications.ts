import { createFileRoute } from "@barqjs/router";

const EVENTS = [
  {
    title: "Deploy finished",
    body: "api-gateway v2.4.1 is live in eu-west-1.",
    tone: "success",
    source: "Deploys",
    actor: "Lina",
  },
  {
    title: "Invoice paid",
    body: "Acme Logistics paid invoice #1043, $4,200.00.",
    tone: "info",
    source: "Billing",
    actor: "Omar",
  },
  {
    title: "Error rate above 2%",
    body: "checkout-service has failed 2.4% of requests for five minutes.",
    tone: "danger",
    source: "Monitoring",
  },
  {
    title: "Salama mentioned you",
    body: '"Can you review the onboarding copy before Friday?"',
    tone: "neutral",
    source: "Comments",
    actor: "Salama",
  },
  {
    title: "Certificate expires soon",
    body: "status.example.com renews in 7 days.",
    tone: "warning",
    source: "Security",
  },
  {
    title: "New member joined",
    body: "Maya joined the Design team.",
    tone: "info",
    source: "Workspace",
    actor: "Maya",
  },
] as const;

/**
 * A notification feed as server-sent events: one JSON notification per
 * message, a new one every few seconds, for as long as the page listens.
 */
export const Route = createFileRoute("/api/notifications")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const encoder = new TextEncoder();
        let timer: ReturnType<typeof setInterval> | undefined;
        let sent = 0;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (): void => {
              const event = EVENTS[sent % EVENTS.length]!;
              sent += 1;
              const item = {
                id: `live-${Date.now()}-${sent}`,
                title: event.title,
                body: event.body,
                tone: event.tone,
                source: event.source,
                createdAt: new Date().toISOString(),
                read: false,
                ...("actor" in event ? { actor: { name: event.actor } } : {}),
              };
              controller.enqueue(
                encoder.encode(`id: ${item.id}\ndata: ${JSON.stringify(item)}\n\n`),
              );
            };
            controller.enqueue(encoder.encode("retry: 3000\n\n"));
            timer = setInterval(send, 6000);
            request.signal.addEventListener("abort", () => {
              clearInterval(timer);
              controller.close();
            });
          },
          cancel() {
            clearInterval(timer);
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
            connection: "keep-alive",
          },
        });
      },
    },
  },
});
