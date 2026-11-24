import { isServer } from "@barqjs/web";

const BUS = "__TANSTACK_EVENT_TARGET__";

/**
 * A devtools bus for the server, where no devtools panel ever answers.
 *
 * form-core announces every form to TanStack's devtools through an event
 * client that, finding no bus, polls for one every second for five seconds.
 * On the server that interval holds the process open: a prerender or a
 * one-off render that drew a form waited five seconds before it could exit.
 * A bus that answers the client's connect request at once lets it connect on
 * the spot, so the poll never starts; the events it then sends reach no one.
 * A bus already there, set up by the host, is left alone.
 */
export function installServerDevtoolsBus(): void {
  if (!isServer || typeof EventTarget === "undefined" || typeof CustomEvent === "undefined") {
    return;
  }
  const scope = globalThis as { [BUS]?: EventTarget };
  if (scope[BUS] !== undefined) return;
  const bus = new EventTarget();
  bus.addEventListener("tanstack-connect", () => {
    bus.dispatchEvent(new CustomEvent("tanstack-connect-success"));
  });
  scope[BUS] = bus;
}
