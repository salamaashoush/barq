import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterM(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M8 16.001v-7.5a.5.5 0 0 1 .9-.3l2.7 3.599a.5.5 0 0 0 .8 0l2.7-3.6a.5.5 0 0 1 .9.3v7.501" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
