import type { Incoming } from "@barqjs/core";
import { useLoader, type ThreeEvent } from "@barqjs/three";
import { AdditiveBlending, TextureLoader } from "three";

import { useOrrery } from "./orrery.ts";

export function Sun(props: Incoming<{ color: string; radius: number }>) {
  const orrery = useOrrery();
  const glow = useLoader(TextureLoader, "/textures/glow.svg");
  const lit = () => orrery.hovered() === "sun" || orrery.selected() === "sun";
  return (
    <group>
      <mesh
        name="sun"
        scale={lit() ? 1.06 : 1}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          orrery.setSelected("sun");
        }}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          orrery.setHovered("sun");
        }}
        onPointerOut={() => orrery.setHovered(null)}
      >
        <sphereGeometry args={[props.radius(), 64, 48]} />
        <meshBasicMaterial color={props.color()} />
      </mesh>
      <sprite scale={props.radius() * (lit() ? 6.2 : 5.4)}>
        <spriteMaterial
          map={glow()}
          color={props.color()}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </sprite>
      <pointLight color="#fff1d6" intensity={2.6} decay={0} />
    </group>
  );
}
