import { extend, useThree, type ThreeElement } from "@barqjs/three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

extend({ OrbitControls });

declare module "@barqjs/three" {
  interface ThreeElements {
    orbitControls: ThreeElement<typeof OrbitControls>;
  }
}

/** A tag three does not have, claimed for the scene because `@barqjs/three` claims unknown tags. */
export function Controls() {
  const three = useThree();
  return (
    <orbitControls
      args={[three.camera, three.gl.domElement]}
      minDistance={5}
      maxDistance={80}
      maxPolarAngle={Math.PI * 0.48}
      ref={(controls: OrbitControls) => {
        // Under the demand frameloop a camera move draws only when asked for.
        controls.addEventListener("change", () => three.invalidate());
      }}
    />
  );
}
