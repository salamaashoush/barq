import { For, Loading, Show, createSignal, onSettled } from "@barqjs/core";
import { css } from "@barqjs/css";
import { createFileRoute } from "@barqjs/router";
import { Canvas, type RootState } from "@barqjs/three";

import { getSystem, reseed, type Planet } from "../data/system.ts";
import { Belt } from "../scene/Belt.tsx";
import { Controls } from "../scene/Controls.tsx";
import { Motion } from "../scene/Motion.tsx";
import { createOrrery, MAX_ASTEROIDS, OrreryContext } from "../scene/orrery.ts";
import { Planets } from "../scene/Planets.tsx";
import { Stars } from "../scene/Stars.tsx";
import { Sun } from "../scene/Sun.tsx";

const page = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  min-height: 0;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    grid-template-rows: 60vh auto;
  }
`;

const stage = css`
  position: relative;
  min-height: 0;
`;

const panel = css`
  overflow-y: auto;
  padding: 1rem 1.1rem 2rem;
  border-left: 1px solid rgb(255 255 255 / 0.08);
  background: rgb(9 11 26 / 0.92);

  h1 {
    margin: 0;
    font-size: 18px;
    color: #fff;
  }

  h2 {
    margin: 1.4rem 0 0.5rem;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #7c86a8;
  }

  label {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.15rem 0.5rem;
    margin-bottom: 0.7rem;
  }

  label input[type="range"] {
    grid-column: 1 / -1;
    width: 100%;
    accent-color: #ffd27a;
  }

  output {
    font-variant-numeric: tabular-nums;
    color: #fff;
  }
`;

const muted = css`
  margin: 0.2rem 0 0;
  color: #7c86a8;
  font-size: 12px;
`;

const buttons = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.8rem;

  button {
    flex: 1;
    padding: 0.4rem 0.6rem;
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 6px;
    color: #dbe4ff;
    background: rgb(255 255 255 / 0.05);
    cursor: pointer;
  }

  button[aria-pressed="true"] {
    color: #0b1020;
    background: #ffd27a;
    border-color: transparent;
  }
`;

const bodies = css`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;

  button {
    width: 100%;
    padding: 0.3rem 0;
    border: 1px solid transparent;
    border-radius: 6px;
    color: #c3cbe6;
    background: rgb(255 255 255 / 0.04);
    cursor: pointer;
  }

  button[aria-pressed="true"] {
    border-color: var(--planet);
    color: #fff;
  }
`;

const details = css`
  padding: 0.7rem 0.8rem;
  border-radius: 8px;
  background: rgb(255 255 255 / 0.04);
  border-left: 3px solid var(--planet, #ffd27a);

  h3 {
    margin: 0 0 0.3rem;
    font-size: 16px;
    color: #fff;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.1rem 0.8rem;
    margin: 0.4rem 0;
  }

  dt {
    color: #7c86a8;
  }

  dd {
    margin: 0;
  }
`;

const meter = css`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.1rem 0.8rem;
  margin: 0;
  font-variant-numeric: tabular-nums;

  dt {
    color: #7c86a8;
  }

  dd {
    margin: 0;
    text-align: right;
  }
`;

interface Meter {
  readonly frames: number;
  readonly fps: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
}

interface Selection {
  readonly name: string;
  readonly color: string;
  readonly kind: string;
  readonly fact: string;
  readonly lines: readonly (readonly [string, string])[];
}

const IDLE: Meter = { frames: 0, fps: 0, geometries: 0, textures: 0, programs: 0 };

function Orrery() {
  const system = Route.useLoaderData();
  const planets = (): readonly Planet[] => system()?.planets ?? [];
  const orrery = createOrrery(planets, () => system()?.seed ?? 0);
  const [stats, setStats] = createSignal<Meter>(IDLE);
  const [reseeding, setReseeding] = createSignal(false);

  let scene: RootState | null = null;
  onSettled(() => {
    let lastFrames = 0;
    let lastAt = performance.now();
    const timer = setInterval(() => {
      if (scene === null) return;
      const info = scene.gl.info;
      const now = performance.now();
      const frames = info.render.frame;
      setStats({
        frames,
        fps: Math.round(((frames - lastFrames) * 1000) / (now - lastAt)),
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
      });
      lastFrames = frames;
      lastAt = now;
    }, 250);
    return () => clearInterval(timer);
  });

  const chosen = (): Selection | null => {
    const id = orrery.selected();
    if (id === null) return null;
    if (id === "sun") {
      const star = system()?.star;
      return star === undefined
        ? null
        : {
            name: star.name,
            color: star.color,
            kind: "G-type star",
            fact: "Holds 99.8% of the solar system's mass.",
            lines: [["Planets", String(planets().length)]],
          };
    }
    const planet = planets().find((candidate) => candidate.id === id);
    if (planet === undefined) return null;
    return {
      name: planet.name,
      color: planet.color,
      kind: planet.kind,
      fact: planet.fact,
      lines: [
        ["Year", `${planet.period.toLocaleString("en")} days`],
        ["Moons", String(planet.moons)],
        ["Axial tilt", `${planet.tilt}°`],
      ],
    };
  };

  const randomise = async (): Promise<void> => {
    setReseeding(true);
    try {
      const next = await reseed();
      orrery.setSeed(next.seed);
    } finally {
      setReseeding(false);
    }
  };

  return (
    <OrreryContext value={orrery}>
      <div class={page}>
        <div class={stage}>
          <Canvas
            shadows
            dpr={[1, 2]}
            frameloop={orrery.frameloop()}
            camera={{ position: [0, 21, 34], fov: 45, near: 0.1, far: 500 }}
            onCreated={(state: RootState) => {
              scene = state;
            }}
            onPointerMissed={() => orrery.setSelected(null)}
          >
            <color attach="background" args={["#05060f"]} />
            <ambientLight intensity={0.14} />
            <directionalLight
              castShadow
              position={[4, 26, 6]}
              intensity={0.7}
              shadow-mapSize={[2048, 2048]}
              shadow-camera-left={-24}
              shadow-camera-right={24}
              shadow-camera-top={24}
              shadow-camera-bottom={-24}
              shadow-camera-far={60}
            />
            <mesh rotation-x={-Math.PI / 2} position-y={-2.2} receiveShadow>
              <circleGeometry args={[23, 128]} />
              <meshStandardMaterial
                color="#1a2142"
                transparent
                opacity={0.6}
                roughness={1}
                depthWrite={false}
              />
            </mesh>
            <Loading fallback={null}>
              <Show when={system()}>
                {(loaded) => <Sun color={loaded().star.color} radius={loaded().star.radius} />}
              </Show>
              <Stars />
            </Loading>
            <Planets />
            <Belt />
            <Motion />
            <Controls />
          </Canvas>
        </div>
        <aside class={panel}>
          <h1>The solar system</h1>
          <p class={muted} id="seed">
            seed {orrery.seed()} · rendered {system()?.renderedAt.slice(11, 19) ?? ""} UTC
          </p>

          <h2>Bodies</h2>
          <ul class={bodies} id="bodies">
            <For each={planets()}>
              {(planet) => (
                <li>
                  <button
                    type="button"
                    data-body={planet.id}
                    aria-pressed={orrery.selected() === planet.id}
                    style={{ "--planet": planet.color }}
                    onClick={() =>
                      orrery.setSelected(orrery.selected() === planet.id ? null : planet.id)
                    }
                  >
                    {planet.name}
                  </button>
                </li>
              )}
            </For>
          </ul>

          <h2>Selected</h2>
          <Show
            when={chosen()}
            fallback={<p class={muted}>Click a planet or the Sun, or pick one above.</p>}
          >
            {(body) => (
              <section class={details} id="selected" style={{ "--planet": body().color }}>
                <h3>{body().name}</h3>
                <p class={muted}>{body().kind}</p>
                <dl>
                  <For each={body().lines}>
                    {(line) => (
                      <>
                        <dt>{line[0]}</dt>
                        <dd>{line[1]}</dd>
                      </>
                    )}
                  </For>
                </dl>
                <p>{body().fact}</p>
              </section>
            )}
          </Show>

          <h2>Motion</h2>
          <div class={buttons}>
            <button
              type="button"
              id="play"
              aria-pressed={orrery.playing()}
              onClick={() => orrery.setPlaying(!orrery.playing())}
            >
              {orrery.playing() ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              id="reseed"
              disabled={reseeding()}
              onClick={() => void randomise()}
            >
              Randomise seed
            </button>
          </div>
          <label>
            Speed <output id="speed">{orrery.speed()} days/s</output>
            <input
              type="range"
              min="1"
              max="200"
              value={orrery.speed()}
              onInput={(event) => orrery.setSpeed(Number(event.currentTarget.value))}
            />
          </label>
          <label>
            Asteroids <output id="asteroids">{orrery.asteroids()}</output>
            <input
              type="range"
              min="0"
              max={MAX_ASTEROIDS}
              step="100"
              value={orrery.asteroids()}
              onInput={(event) => orrery.setAsteroids(Number(event.currentTarget.value))}
            />
          </label>
          <label>
            Belt colour
            <input
              type="color"
              value={orrery.beltColor()}
              onInput={(event) => orrery.setBeltColor(event.currentTarget.value)}
            />
          </label>

          <h2>Frames</h2>
          <div class={buttons}>
            <button
              type="button"
              id="demand"
              aria-pressed={orrery.frameloop() === "demand"}
              onClick={() => orrery.setFrameloop("demand")}
            >
              On demand
            </button>
            <button
              type="button"
              id="always"
              aria-pressed={orrery.frameloop() === "always"}
              onClick={() => orrery.setFrameloop("always")}
            >
              Always
            </button>
          </div>
          <dl class={meter}>
            <dt>Frames rendered</dt>
            <dd id="frames">{stats().frames}</dd>
            <dt>Frames per second</dt>
            <dd id="fps">{stats().fps}</dd>
            <dt>Geometries</dt>
            <dd>{stats().geometries}</dd>
            <dt>Textures</dt>
            <dd>{stats().textures}</dd>
            <dt>Shader programs</dt>
            <dd>{stats().programs}</dd>
          </dl>
          <p class={muted}>
            Paused under the demand frameloop, the count holds still until something changes.
          </p>
        </aside>
      </div>
    </OrreryContext>
  );
}

export const Route = createFileRoute("/")({
  loader: () => getSystem(),
  component: Orrery,
  head: { meta: [{ title: "Orrery: barq and three.js" }] },
});
