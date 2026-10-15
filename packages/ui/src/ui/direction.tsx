import {
  provideDirection,
  useDirection as useScopeDirection,
  type ReadingDirection,
} from "@barqjs/aria/i18n";
import { access, type MaybeAccessor } from "@barqjs/aria/utils";
import type { Accessor, Child, Incoming } from "@barqjs/core";

export type Direction = ReadingDirection;

export interface DirectionProviderProps {
  dir?: Direction;
  /** The same as `dir`, and the one that wins when both are given. */
  direction?: Direction;
  children?: Child;
}

/**
 * Which way everything under it runs.
 *
 * ```tsx
 * <DirectionProvider dir="rtl">
 *   <App />
 * </DirectionProvider>
 * ```
 *
 * It renders no element, so it does not write `dir` anywhere: put that on
 * `<html>` or on a wrapper you own, which is what makes the browser lay the
 * text and every logical property out that way. This is the half CSS cannot
 * reach, the arrow keys, the side a submenu opens on and the end a slider
 * starts from.
 */
export function DirectionProvider(props: Incoming<DirectionProviderProps>) {
  const inherited = useScopeDirection();
  provideDirection(() => props.direction?.() ?? props.dir?.() ?? inherited());

  return <>{props.children}</>;
}

/**
 * The direction in scope, or the component's own when it was given one.
 *
 * ```tsx
 * const direction = useDirection(props.dir);
 * const back = () => (direction() === "rtl" ? "ArrowRight" : "ArrowLeft");
 * ```
 */
export function useDirection(local?: MaybeAccessor<Direction | undefined>): Accessor<Direction> {
  const scoped = useScopeDirection();
  return () => access(local) ?? scoped();
}
