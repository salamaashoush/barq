/**
 * Type guards, and the coercion a text or attribute position applies.
 */
import { isBlock, jsxAsValue } from "./signals.ts";

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isRefCallback(value: unknown): value is (el: Element) => void {
  return typeof value === "function";
}

export function isSignalGetter(value: unknown): value is () => unknown {
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

/**
 * Safely convert a value to string (for DOM attributes)
 * Handles string, number, and stringifiable values
 */
export function toString(value: unknown): string {
  if (isString(value)) return value;
  if (isNumber(value)) return String(value);
  if (isBoolean(value)) return value ? "true" : "false";
  if (isBlock(value)) {
    throw jsxAsValue("A text or attribute position");
  }
  return String(value);
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
