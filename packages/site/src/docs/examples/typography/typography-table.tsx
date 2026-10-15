import { css } from "@barqjs/css";

const scroller = css`
  margin-block: calc(var(--spacing) * 6);
  width: 100%;
  overflow-y: auto;
`;

const table = css`
  width: 100%;
  border-collapse: collapse;

  & tr {
    margin: 0;
    border-top: 1px solid var(--border);
    padding: 0;
  }

  & tr:nth-child(even) {
    background-color: var(--muted);
  }

  & th,
  & td {
    border: 1px solid var(--border);
    padding: calc(var(--spacing) * 2) calc(var(--spacing) * 4);
    text-align: start;
  }

  & th {
    font-weight: 700;
  }
`;

export default function TypographyTable() {
  return (
    <div class={scroller}>
      <table class={table}>
        <thead>
          <tr>
            <th>King's Treasury</th>
            <th>People's happiness</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Empty</td>
            <td>Overflowing</td>
          </tr>
          <tr>
            <td>Modest</td>
            <td>Satisfied</td>
          </tr>
          <tr>
            <td>Full</td>
            <td>Ecstatic</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
