/** @jsxImportSource @barqjs/three */
export function Box() {
  return (
    <mesh rotation={[0.4, 0.6, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="orange" />
    </mesh>
  )
}
