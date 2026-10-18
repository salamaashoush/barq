import { createServerFn } from "@barqjs/start";

export type PlanetKind = "rocky" | "gas giant" | "ice giant";

export interface Planet {
  readonly id: string;
  readonly name: string;
  readonly kind: PlanetKind;
  /** Radius in scene units, not to scale. */
  readonly radius: number;
  /** Orbit radius in scene units, compressed so the outer planets fit. */
  readonly distance: number;
  /** Orbital period in Earth days. */
  readonly period: number;
  /** Axial tilt in degrees. */
  readonly tilt: number;
  readonly moons: number;
  readonly color: string;
  readonly ring: boolean;
  readonly fact: string;
}

export interface StarSystem {
  readonly star: { readonly name: string; readonly color: string; readonly radius: number };
  readonly planets: readonly Planet[];
  /** Seeds the asteroid belt and the star field, so both come out the same on every client. */
  readonly seed: number;
  readonly renderedAt: string;
}

const PLANETS: readonly Planet[] = [
  {
    id: "mercury",
    name: "Mercury",
    kind: "rocky",
    radius: 0.28,
    distance: 3.4,
    period: 88,
    tilt: 0.03,
    moons: 0,
    color: "#b5a89a",
    ring: false,
    fact: "A year is shorter than two of its days.",
  },
  {
    id: "venus",
    name: "Venus",
    kind: "rocky",
    radius: 0.46,
    distance: 4.6,
    period: 225,
    tilt: 177.4,
    moons: 0,
    color: "#e8c27a",
    ring: false,
    fact: "Spins backwards, under clouds of sulphuric acid.",
  },
  {
    id: "earth",
    name: "Earth",
    kind: "rocky",
    radius: 0.5,
    distance: 6,
    period: 365,
    tilt: 23.4,
    moons: 1,
    color: "#4f8fe6",
    ring: false,
    fact: "The only place known to host a three.js developer.",
  },
  {
    id: "mars",
    name: "Mars",
    kind: "rocky",
    radius: 0.36,
    distance: 7.4,
    period: 687,
    tilt: 25.2,
    moons: 2,
    color: "#d0613c",
    ring: false,
    fact: "Home to Olympus Mons, nearly three times the height of Everest.",
  },
  {
    id: "jupiter",
    name: "Jupiter",
    kind: "gas giant",
    radius: 1.1,
    distance: 11.2,
    period: 4333,
    tilt: 3.1,
    moons: 95,
    color: "#d9a066",
    ring: false,
    fact: "Its Great Red Spot is a storm wider than Earth.",
  },
  {
    id: "saturn",
    name: "Saturn",
    kind: "gas giant",
    radius: 0.95,
    distance: 14.4,
    period: 10759,
    tilt: 26.7,
    moons: 146,
    color: "#e3cf8d",
    ring: true,
    fact: "Light enough to float, if there were a bath big enough.",
  },
  {
    id: "uranus",
    name: "Uranus",
    kind: "ice giant",
    radius: 0.7,
    distance: 17.4,
    period: 30687,
    tilt: 97.8,
    moons: 28,
    color: "#8fd8e0",
    ring: false,
    fact: "Rolls around the Sun on its side.",
  },
  {
    id: "neptune",
    name: "Neptune",
    kind: "ice giant",
    radius: 0.68,
    distance: 20.2,
    period: 60190,
    tilt: 28.3,
    moons: 16,
    color: "#4b6fe0",
    ring: false,
    fact: "Has the fastest winds measured in the solar system.",
  },
];

function freshSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

export const getSystem = createServerFn().handler((): StarSystem => ({
  star: { name: "Sun", color: "#ffd27a", radius: 1.8 },
  planets: PLANETS,
  seed: freshSeed(),
  renderedAt: new Date().toISOString(),
}));

export const reseed = createServerFn({ method: "POST" }).handler(() => ({ seed: freshSeed() }));
