import { type Accessor, isServer, signal } from "@barqjs/core";
import { type Clear, tryCleanup } from "./utils.ts";

export interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface Geolocation {
  /** The last fix, or `undefined` before the first. */
  position: Accessor<Position | undefined>;
  /** The last failure. A denial is an answer, not an absence. */
  error: Accessor<GeolocationPositionError | undefined>;
  /** Whether a watch is running. */
  watching: Accessor<boolean>;
  /** Ask once. Resolves with the fix, or rejects with the reason. */
  locate: () => Promise<Position>;
  /** Follow the device until `stop` or the owning scope disposes. */
  start: Clear;
  stop: Clear;
}

function toPosition(reading: GeolocationPosition): Position {
  const { coords } = reading;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    altitude: coords.altitude,
    heading: coords.heading,
    speed: coords.speed,
    timestamp: reading.timestamp,
  };
}

/**
 * Where the device is.
 *
 * Nothing is requested until `locate` or `start` is called. That is deliberate:
 * asking on creation puts a permission prompt on the screen because a component
 * mounted, which is the pattern users learn to deny — and a denial is
 * remembered by the browser long after the page is closed.
 */
export function geolocation(options?: PositionOptions): Geolocation {
  const position = signal<Position | undefined>(undefined);
  const error = signal<GeolocationPositionError | undefined>(undefined);
  const watching = signal(false);
  let id: number | undefined;

  const available = (): boolean =>
    !isServer && typeof navigator !== "undefined" && navigator.geolocation !== undefined;

  const stop = (): void => {
    if (id === undefined) return;
    navigator.geolocation.clearWatch(id);
    id = undefined;
    watching.set(false);
  };

  tryCleanup(stop);

  return {
    position,
    error,
    watching,

    locate: () =>
      new Promise<Position>((resolve, reject) => {
        if (!available()) {
          reject(new Error("[barq] geolocation is unavailable here"));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (reading) => {
            const found = toPosition(reading);
            error.set(undefined);
            position.set(found);
            resolve(found);
          },
          (failure) => {
            error.set(failure);
            reject(failure);
          },
          options,
        );
      }),

    start() {
      if (id !== undefined || !available()) return;
      watching.set(true);
      id = navigator.geolocation.watchPosition(
        (reading) => {
          error.set(undefined);
          position.set(toPosition(reading));
        },
        (failure) => error.set(failure),
        options,
      );
    },

    stop,
  };
}
