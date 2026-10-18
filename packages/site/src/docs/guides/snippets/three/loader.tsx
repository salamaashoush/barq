import { Loading } from "@barqjs/core";
import { useLoader } from "@barqjs/three";
import { TextureLoader } from "three";

function Crate() {
  const texture = useLoader(TextureLoader, "/crate.png");
  return (
    <mesh>
      <boxGeometry />
      <meshStandardMaterial map={texture()} />
    </mesh>
  );
}

export default function Textured() {
  return (
    <Loading fallback={<mesh scale={0.5} />}>
      <Crate />
    </Loading>
  );
}
