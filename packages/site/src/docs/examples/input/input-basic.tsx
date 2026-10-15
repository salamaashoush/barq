import { css } from "@barqjs/css";
import { Input } from "@barqjs/ui";

const input = css`
  max-width: 20rem;
`;

export default function InputBasic() {
  return <Input placeholder="Enter text" class={input} />;
}
