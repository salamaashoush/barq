/**
 * Type-safe assertion and guard utilities
 * Use these instead of raw `as` assertions throughout the codebase
 */

// ============================================================================
// Type Guards
// ============================================================================

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

export function isRefCallback(value: unknown): value is (el: Element) => void {
  return typeof value === "function";
}

export function isSignalGetter<T = unknown>(value: unknown): value is () => T {
  return typeof value === "function";
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isArray<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function isNode(value: unknown): value is Node {
  return value instanceof Node;
}

export function isElement(value: unknown): value is Element {
  return value instanceof Element;
}

export function isHTMLElement(value: unknown): value is HTMLElement {
  return value instanceof HTMLElement;
}

// ============================================================================
// Safe Casts (with runtime checks)
// ============================================================================

/**
 * Safely cast a value to string, returning undefined if not a string
 */
export function asString(value: unknown): string | undefined {
  return isString(value) ? value : undefined;
}

/**
 * Safely cast a value to number, returning undefined if not a number
 */
export function asNumber(value: unknown): number | undefined {
  return isNumber(value) ? value : undefined;
}

/**
 * Safely convert a value to string (for DOM attributes)
 * Handles string, number, and stringifiable values
 */
export function toString(value: unknown): string {
  if (isString(value)) return value;
  if (isNumber(value)) return String(value);
  if (isBoolean(value)) return value ? "true" : "false";
  return String(value);
}

/**
 * Safely cast to HTMLElement with runtime check
 */
export function asHTMLElement(value: unknown): HTMLElement | null {
  return isHTMLElement(value) ? value : null;
}

/**
 * Safely cast to Element with runtime check
 */
export function asElement(value: unknown): Element | null {
  return isElement(value) ? value : null;
}

/**
 * Safely cast to Node with runtime check
 */
export function asNode(value: unknown): Node | null {
  return isNode(value) ? value : null;
}

// ============================================================================
// Object Property Access
// ============================================================================

/**
 * Safely get a property from an object
 */
export function getProperty<T>(obj: unknown, key: string | number | symbol): T | undefined {
  if (isObject(obj) && key in obj) {
    return obj[key as string] as T;
  }
  return undefined;
}

/**
 * Safely set a property on an object
 */
export function setProperty(obj: unknown, key: string | number | symbol, value: unknown): boolean {
  if (isObject(obj)) {
    obj[key as string] = value;
    return true;
  }
  return false;
}

// ============================================================================
// Event Handling
// ============================================================================

/**
 * Type guard for EventListener
 */
export function isEventListener(value: unknown): value is EventListener {
  return typeof value === "function";
}

/**
 * Safely cast to EventListener
 */
export function asEventListener(value: unknown): EventListener | null {
  return isEventListener(value) ? value : null;
}

// ============================================================================
// Generic Assertion (use sparingly - prefer type guards)
// ============================================================================

/**
 * Assert a value is of type T
 * Use this only when you've already done runtime checks
 * Prefer type guards where possible
 */
export function assert<T>(value: unknown): T {
  return value as T;
}

/**
 * Assert a value is of type T with a runtime predicate
 */
export function assertWith<T>(value: unknown, predicate: (v: unknown) => v is T): T {
  if (!predicate(value)) {
    throw new TypeError(`Assertion failed: value does not satisfy predicate`);
  }
  return value;
}
