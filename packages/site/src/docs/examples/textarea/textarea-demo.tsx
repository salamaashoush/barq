import { css } from "@barqjs/css";
import { Textarea } from "@barqjs/ui";

const textarea = css`
  max-width: 20rem;
`;

export default function TextareaDemo() {
  return <Textarea placeholder="Type your message here." class={textarea} />;
}
