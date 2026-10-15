import { createSignal, hydrate } from "@barqjs/core";

function Row(props: { label: string }) {
  return <li>{props.label}</li>;
}

function Greeting() {
  const [name] = createSignal("salama");
  return (
    <ul>
      <Row label={name()} />
    </ul>
  );
}

hydrate(() => <Greeting />, document.getElementById("app")!);
