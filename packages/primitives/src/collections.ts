import { type Signal, isTracking, signal } from "@barqjs/core";

/**
 * A `Map` whose reads are reactive, one key at a time.
 *
 * `get(id)` subscribes to that key and nothing else, so writing an unrelated
 * key wakes nobody. Iteration and `size` subscribe to the whole map, because
 * they depend on it.
 *
 * Two things keep the bookkeeping from outgrowing the map itself: a key gets a
 * dependency only when something reads it inside a tracked scope, and that
 * dependency is dropped again the moment its last reader goes away. A million
 * untracked `get`s allocate nothing.
 */
export class ReactiveMap<K, V> extends Map<K, V> {
  #keys = new Map<K, Signal<number>>();
  #structure = signal(0, { equals: false });
  #contents = signal(0, { equals: false });

  /**
   * Entries are filled in here rather than handed to `super`.
   *
   * `new Map(entries)` populates itself by calling `this.set`, which lands in
   * the override below before the field initialisers above have run: the
   * dependency maps do not exist yet, and touching a private field that has
   * not been installed is a TypeError, not an undefined.
   */
  constructor(entries?: Iterable<readonly [K, V]> | null) {
    super();
    if (entries === null || entries === undefined) return;
    for (const [key, value] of entries) super.set(key, value);
  }

  #track(key: K): void {
    if (!isTracking()) return;
    let cell = this.#keys.get(key);
    if (cell === undefined) {
      const created: Signal<number> = signal(0, {
        equals: false,
        unobserved: () => {
          if (this.#keys.get(key) === created) this.#keys.delete(key);
        },
      });
      this.#keys.set(key, created);
      cell = created;
    }
    cell();
  }

  #dirty(key: K): void {
    this.#keys.get(key)?.set(0);
  }

  override get size(): number {
    this.#structure();
    return super.size;
  }

  override get(key: K): V | undefined {
    this.#track(key);
    return super.get(key);
  }

  override has(key: K): boolean {
    this.#track(key);
    return super.has(key);
  }

  override set(key: K, value: V): this {
    const had = super.has(key);
    const previous = super.get(key);
    super.set(key, value);
    if (!had) {
      this.#dirty(key);
      this.#structure.set(0);
      this.#contents.set(0);
    } else if (!Object.is(previous, value)) {
      this.#dirty(key);
      this.#contents.set(0);
    }
    return this;
  }

  override delete(key: K): boolean {
    if (!super.delete(key)) return false;
    this.#dirty(key);
    this.#structure.set(0);
    this.#contents.set(0);
    return true;
  }

  override clear(): void {
    if (super.size === 0) return;
    for (const key of super.keys()) this.#dirty(key);
    super.clear();
    this.#structure.set(0);
    this.#contents.set(0);
  }

  override keys(): MapIterator<K> {
    this.#structure();
    return super.keys();
  }

  override values(): MapIterator<V> {
    this.#contents();
    return super.values();
  }

  override entries(): MapIterator<[K, V]> {
    this.#contents();
    return super.entries();
  }

  override [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }

  override forEach(fn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    this.#contents();
    super.forEach(fn, thisArg);
  }
}

/**
 * A `Set` whose reads are reactive, one member at a time.
 *
 * The membership test is the fine-grained one: `has(id)` in a thousand rows
 * costs a thousand dependencies on one value each, and adding an id wakes the
 * row that gained it rather than all thousand.
 */
export class ReactiveSet<T> extends Set<T> {
  #members = new Map<T, Signal<number>>();
  #structure = signal(0, { equals: false });

  /** See {@link ReactiveMap}'s constructor: `super(values)` would call the override. */
  constructor(values?: Iterable<T> | null) {
    super();
    if (values === null || values === undefined) return;
    for (const value of values) super.add(value);
  }

  #track(value: T): void {
    if (!isTracking()) return;
    let cell = this.#members.get(value);
    if (cell === undefined) {
      const created: Signal<number> = signal(0, {
        equals: false,
        unobserved: () => {
          if (this.#members.get(value) === created) this.#members.delete(value);
        },
      });
      this.#members.set(value, created);
      cell = created;
    }
    cell();
  }

  #dirty(value: T): void {
    this.#members.get(value)?.set(0);
  }

  override get size(): number {
    this.#structure();
    return super.size;
  }

  override has(value: T): boolean {
    this.#track(value);
    return super.has(value);
  }

  override add(value: T): this {
    if (super.has(value)) return this;
    super.add(value);
    this.#dirty(value);
    this.#structure.set(0);
    return this;
  }

  override delete(value: T): boolean {
    if (!super.delete(value)) return false;
    this.#dirty(value);
    this.#structure.set(0);
    return true;
  }

  override clear(): void {
    if (super.size === 0) return;
    for (const value of super.values()) this.#dirty(value);
    super.clear();
    this.#structure.set(0);
  }

  override values(): SetIterator<T> {
    this.#structure();
    return super.values();
  }

  override keys(): SetIterator<T> {
    return this.values();
  }

  override entries(): SetIterator<[T, T]> {
    this.#structure();
    return super.entries();
  }

  override [Symbol.iterator](): SetIterator<T> {
    return this.values();
  }

  override forEach(fn: (value: T, key: T, set: Set<T>) => void, thisArg?: unknown): void {
    this.#structure();
    super.forEach(fn, thisArg);
  }
}
