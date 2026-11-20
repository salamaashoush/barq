import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Heading1(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <path d="m17 12 3-2v8" />
    </svg>
  );
}
