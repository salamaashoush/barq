/**
 * A Y.Doc room without a server: each client's replica relayed to the
 * others as a provider's server relays updates, and an awareness per client
 * relaying its state, the shape y-protocols' has.
 */

import * as Y from "yjs";

import type { AwarenessChanges, YjsAwareness } from "./yjs.ts";

type Listener = (changes: AwarenessChanges, origin: unknown) => void;

/** One document's replicas and their awareness, relayed as a provider's server does. */
export class Room {
  readonly docs = new Set<Y.Doc>();
  readonly awareness = new Set<Awareness>();

  add(doc: Y.Doc): Awareness {
    for (const other of this.docs) {
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(other), this);
    }
    this.docs.add(doc);
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      for (const other of this.docs) {
        if (other !== doc) Y.applyUpdate(other, update, this);
      }
    });
    const awareness = new Awareness(this, doc.clientID);
    for (const other of this.awareness) {
      const state = other.getStates().get(other.clientID);
      if (state) awareness.receive(other.clientID, state);
    }
    this.awareness.add(awareness);
    return awareness;
  }

  relay(from: Awareness, state: Record<string, unknown> | null): void {
    for (const other of this.awareness) {
      if (other !== from) other.receive(from.clientID, state);
    }
  }
}

export class Awareness implements YjsAwareness {
  private readonly states = new Map<number, Record<string, unknown>>();
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly room: Room,
    readonly clientID: number,
  ) {
    this.states.set(clientID, {});
  }

  getStates(): Map<number, Record<string, unknown>> {
    return this.states;
  }

  setLocalStateField(field: string, value: unknown): void {
    const state = { ...this.states.get(this.clientID), [field]: value };
    this.states.set(this.clientID, state);
    this.emit({ added: [], updated: [this.clientID], removed: [] });
    this.room.relay(this, state);
  }

  receive(clientID: number, state: Record<string, unknown> | null): void {
    const known = this.states.has(clientID);
    if (state === null) {
      this.states.delete(clientID);
      if (known) this.emit({ added: [], updated: [], removed: [clientID] });
      return;
    }
    this.states.set(clientID, state);
    this.emit(
      known
        ? { added: [], updated: [clientID], removed: [] }
        : { added: [clientID], updated: [], removed: [] },
    );
  }

  /** The client going away, as a provider's timeout or disconnect does. */
  leave(): void {
    this.room.awareness.delete(this);
    this.room.relay(this, null);
  }

  on(_event: "change", listener: Listener): void {
    this.listeners.add(listener);
  }

  off(_event: "change", listener: Listener): void {
    this.listeners.delete(listener);
  }

  private emit(changes: AwarenessChanges): void {
    for (const listener of this.listeners) listener(changes, "local");
  }
}
