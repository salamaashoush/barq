import { css } from "@barqjs/css";

const h1 = css`
  margin: 0;
  scroll-margin: calc(var(--spacing) * 20);
  font-size: 2.25rem;
  line-height: 2.5rem;
  font-weight: 800;
  letter-spacing: -0.025em;
  text-wrap: balance;
`;

const lead = css`
  margin: calc(var(--spacing) * 6) 0 0;
  font-size: 1.25rem;
  line-height: 1.75rem;
  color: var(--muted-foreground);
`;

const h2 = css`
  margin: calc(var(--spacing) * 10) 0 0;
  scroll-margin: calc(var(--spacing) * 20);
  border-bottom: 1px solid var(--border);
  padding-bottom: calc(var(--spacing) * 2);
  font-size: 1.875rem;
  line-height: 2.25rem;
  font-weight: 600;
  letter-spacing: -0.025em;
`;

const h3 = css`
  margin: calc(var(--spacing) * 8) 0 0;
  scroll-margin: calc(var(--spacing) * 20);
  font-size: 1.5rem;
  line-height: 2rem;
  font-weight: 600;
  letter-spacing: -0.025em;
`;

const p = css`
  margin: 0;
  line-height: 1.75rem;

  &:not(:first-child) {
    margin-top: calc(var(--spacing) * 6);
  }
`;

const link = css`
  font-weight: 500;
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 4px;
`;

const blockquote = css`
  margin: calc(var(--spacing) * 6) 0 0;
  border-inline-start: 2px solid var(--border);
  padding-inline-start: calc(var(--spacing) * 6);
  font-style: italic;
`;

const list = css`
  margin-block: calc(var(--spacing) * 6);
  margin-inline-start: calc(var(--spacing) * 6);
  padding: 0;
  list-style-type: disc;

  & > li {
    margin-top: calc(var(--spacing) * 2);
  }
`;

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

export default function TypographyDemo() {
  return (
    <div>
      <h1 class={h1}>Taxing Laughter: The Joke Tax Chronicles</h1>
      <p class={lead}>
        Once upon a time, in a far-off land, there was a very lazy king who spent all day lounging
        on his throne. One day, his advisors came to him with a problem: the kingdom was running out
        of money.
      </p>
      <h2 class={h2}>The King's Plan</h2>
      <p class={p}>
        The king thought long and hard, and finally came up with{" "}
        <a href="#" class={link}>
          a brilliant plan
        </a>
        : he would tax the jokes in the kingdom.
      </p>
      <blockquote class={blockquote}>
        "After all," he said, "everyone enjoys a good joke, so it's only fair that they should pay
        for the privilege."
      </blockquote>
      <h3 class={h3}>The Joke Tax</h3>
      <p class={p}>
        The king's subjects were not amused. They grumbled and complained, but the king was firm:
      </p>
      <ul class={list}>
        <li>1st level of puns: 5 gold coins</li>
        <li>2nd level of jokes: 10 gold coins</li>
        <li>3rd level of one-liners : 20 gold coins</li>
      </ul>
      <p class={p}>
        As a result, people stopped telling jokes, and the kingdom fell into a gloom. But there was
        one person who refused to let the king's foolishness get him down: a court jester named
        Jokester.
      </p>
      <h3 class={h3}>Jokester's Revolt</h3>
      <p class={p}>
        Jokester began sneaking into the castle in the middle of the night and leaving jokes all
        over the place: under the king's pillow, in his soup, even in the royal toilet. The king was
        furious, but he couldn't seem to stop Jokester.
      </p>
      <p class={p}>
        And then, one day, the people of the kingdom discovered that the jokes left by Jokester were
        so funny that they couldn't help but laugh. And once they started laughing, they couldn't
        stop.
      </p>
      <h3 class={h3}>The People's Rebellion</h3>
      <p class={p}>
        The people of the kingdom, feeling uplifted by the laughter, started to tell jokes and puns
        again, and soon the entire kingdom was in on the joke.
      </p>
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
      <p class={p}>
        The king, seeing how much happier his subjects were, realized the error of his ways and
        repealed the joke tax. Jokester was declared a hero, and the kingdom lived happily ever
        after.
      </p>
      <p class={p}>
        The moral of the story is: never underestimate the power of a good laugh and always be
        careful of bad ideas.
      </p>
    </div>
  );
}
