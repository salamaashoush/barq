import { css } from "@barqjs/css";

const list = css`
  margin-block: calc(var(--spacing) * 6);
  margin-inline-start: calc(var(--spacing) * 6);
  padding: 0;
  list-style-type: disc;

  & > li {
    margin-top: calc(var(--spacing) * 2);
  }
`;

export default function TypographyList() {
  return (
    <ul class={list}>
      <li>1st level of puns: 5 gold coins</li>
      <li>2nd level of jokes: 10 gold coins</li>
      <li>3rd level of one-liners : 20 gold coins</li>
    </ul>
  );
}
