import { createContext, createSignal, useContext, type Accessor, type Setter } from "@barqjs/core";

import type { Planet } from "../data/system.ts";

export type Frameloop = "demand" | "always";

/**
 * Everything the page's controls and the scene share. One per page rather than
 * module signals, because the server renders every visitor from the same
 * module instance.
 */
export interface Orrery {
  readonly planets: Accessor<readonly Planet[]>;
  readonly seed: Accessor<number>;
  readonly setSeed: Setter<number>;
  readonly asteroids: Accessor<number>;
  readonly setAsteroids: Setter<number>;
  readonly speed: Accessor<number>;
  readonly setSpeed: Setter<number>;
  readonly beltColor: Accessor<string>;
  readonly setBeltColor: Setter<string>;
  readonly playing: Accessor<boolean>;
  readonly setPlaying: Setter<boolean>;
  readonly frameloop: Accessor<Frameloop>;
  readonly setFrameloop: Setter<Frameloop>;
  readonly selected: Accessor<string | null>;
  readonly setSelected: Setter<string | null>;
  readonly hovered: Accessor<string | null>;
  readonly setHovered: Setter<string | null>;
  /** Simulated days since the page opened. */
  readonly days: Accessor<number>;
  readonly setDays: Setter<number>;
}

export const MAX_ASTEROIDS = 6000;

export function createOrrery(planets: Accessor<readonly Planet[]>, seed: Accessor<number>): Orrery {
  const [currentSeed, setSeed] = createSignal(seed);
  const [asteroids, setAsteroids] = createSignal(2500);
  const [speed, setSpeed] = createSignal(40);
  const [beltColor, setBeltColor] = createSignal("#a89f91");
  const [playing, setPlaying] = createSignal(true);
  const [frameloop, setFrameloop] = createSignal<Frameloop>("demand");
  const [selected, setSelected] = createSignal<string | null>(null);
  const [hovered, setHovered] = createSignal<string | null>(null);
  const [days, setDays] = createSignal(0);
  return {
    planets,
    seed: currentSeed,
    setSeed,
    asteroids,
    setAsteroids,
    speed,
    setSpeed,
    beltColor,
    setBeltColor,
    playing,
    setPlaying,
    frameloop,
    setFrameloop,
    selected,
    setSelected,
    hovered,
    setHovered,
    days,
    setDays,
  };
}

export const OrreryContext = createContext<Orrery>(undefined, "Orrery");

export function useOrrery(): Orrery {
  return useContext(OrreryContext)();
}

/** A small seeded generator, so the server's seed draws the same belt in every browser. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
