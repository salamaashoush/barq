import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Languages(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}
