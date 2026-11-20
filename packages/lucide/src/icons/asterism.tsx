import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Asterism(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 2v8" />
      <path d="m14.5 15 7 4" />
      <path d="m14.5 19 7-4" />
      <path d="M18 13v8" />
      <path d="m2.5 15 7 4" />
      <path d="m2.5 19 7-4" />
      <path d="M6 13v8" />
      <path d="m8.5 4 7 4" />
      <path d="m8.5 8 7-4" />
    </svg>
  );
}
