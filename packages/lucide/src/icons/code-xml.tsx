import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CodeXml(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m18 16 4-4-4-4" />
      <path d="m6 8-4 4 4 4" />
      <path d="m14.5 4-5 16" />
    </svg>
  );
}
