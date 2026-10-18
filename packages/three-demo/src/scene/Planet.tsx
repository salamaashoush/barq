import { Loading, Show, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Html, useLoader, type ThreeEvent } from "@barqjs/three";
import { DoubleSide, TextureLoader } from "three";

import type { Planet as Body } from "../data/system.ts";
import { useOrrery } from "./orrery.ts";

const DEGREES = Math.PI / 180;

// The label's anchor is the planet's centre, so the element `Html` moves sits
// exactly where the planet projects; the text is lifted above it here, and
// takes no pointer events so a click on it still reaches the canvas.
const label = css`
  display: inline-block;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
  transform: translate3d(-50%, calc(-100% - 18px), 0);
  padding: 2px 8px;
  border-radius: 999px;
  font:
    600 11px/1.6 system-ui,
    sans-serif;
  letter-spacing: 0.04em;
  color: #dbe4ff;
  background: rgb(10 14 32 / 0.55);
  border: 1px solid rgb(255 255 255 / 0.12);
  transition:
    background 120ms,
    border-color 120ms;

  &[data-lit] {
    color: #0b1020;
    background: var(--planet);
    border-color: transparent;
  }
`;

export function Planet(props: Incoming<{ planet: Body }>) {
  const orrery = useOrrery();
  const bands = useLoader(TextureLoader, "/textures/bands.svg");
  const planet = props.planet;
  const phase = planet().distance * 1.7;
  const angle = () => phase + (orrery.days() / planet().period) * Math.PI * 2;
  const lit = () => orrery.hovered() === planet().id || orrery.selected() === planet().id;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[planet().distance - 0.012, planet().distance + 0.012, 192]} />
        <meshBasicMaterial
          color={planet().color}
          transparent
          opacity={lit() ? 0.75 : 0.16}
          side={DoubleSide}
        />
      </mesh>
      <group rotation-y={angle()}>
        <group position-x={planet().distance} rotation-z={planet().tilt * DEGREES}>
          <Loading fallback={null}>
            <mesh
              name={planet().id}
              castShadow
              receiveShadow
              rotation-y={orrery.days() * 0.15}
              scale={lit() ? 1.18 : 1}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                event.stopPropagation();
                orrery.setSelected(planet().id);
              }}
              onPointerOver={(event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation();
                orrery.setHovered(planet().id);
              }}
              onPointerOut={() => orrery.setHovered(null)}
            >
              <sphereGeometry args={[planet().radius, 48, 32]} />
              <meshStandardMaterial
                map={bands()}
                color={planet().color}
                roughness={0.8}
                emissive={planet().color}
                emissiveIntensity={lit() ? 0.45 : 0.04}
              />
            </mesh>
            <Show when={planet().ring}>
              <mesh rotation-x={-Math.PI / 2} castShadow receiveShadow>
                <ringGeometry args={[planet().radius * 1.35, planet().radius * 2.3, 96]} />
                <meshStandardMaterial
                  map={bands()}
                  color={planet().color}
                  transparent
                  opacity={0.8}
                  side={DoubleSide}
                />
              </mesh>
            </Show>
          </Loading>
        </group>
        <Html position={[planet().distance, 0, 0]}>
          <span
            class={label}
            data-planet={planet().id}
            data-lit={lit() ? "" : undefined}
            style={{ "--planet": planet().color }}
          >
            {planet().name}
          </span>
        </Html>
      </group>
    </group>
  );
}
