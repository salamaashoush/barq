import { createSignal } from "@barqjs/core";
import { useFrame, type ThreeEvent } from "@barqjs/three";

export default function Box(props: { x: () => number }) {
  const [hovered, setHovered] = createSignal(false);
  const [clicked, setClicked] = createSignal(false);
  const [angle, setAngle] = createSignal(0);
  useFrame((_, delta) => setAngle(angle() + delta));
  return (
    <mesh
      position-x={props.x()}
      rotation={[angle(), angle(), 0]}
      scale={clicked() ? 1.5 : 1}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        setClicked(!clicked());
      }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered() ? "hotpink" : "orange"} />
    </mesh>
  );
}
