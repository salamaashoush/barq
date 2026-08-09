export default function StaticOnly() {
  return (
    <section class="card" data-kind="static">
      <h2 class="title">Barq</h2>
      <p>Nothing here ever changes.</p>
      <ul>
        <li>one</li>
        <li>two</li>
        <li>three</li>
      </ul>
    </section>
  )
}

export const optimality = {
  target: 2,
  milestone: 2,
  effects: 0,
  templates: 1,
  patchCalls: 0,
  absent: ["=>"],
}
