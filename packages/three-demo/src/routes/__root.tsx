import type { Child } from "@barqjs/core";
import { css, globalCss } from "@barqjs/css";
import { HeadContent, NavLink, Outlet, Scripts, createRootRoute } from "@barqjs/router";

globalCss`
  *, *::before, *::after { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font: 14px/1.55 system-ui, -apple-system, sans-serif;
    color: #dbe4ff;
    background: #05060f;
  }
  #app { height: 100%; }
  a { color: #9db8ff; }
  button, input { font: inherit; }
`;

const frame = css`
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
`;

const bar = css`
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 0.6rem 1.25rem;
  border-bottom: 1px solid rgb(255 255 255 / 0.08);
  background: rgb(8 10 24 / 0.9);

  strong {
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 12px;
    color: #ffd27a;
  }

  a {
    text-decoration: none;
    color: #8c96b8;
  }

  a.active {
    color: #fff;
  }
`;

const shellComponent = (props: { children: Child }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <HeadContent />
    </head>
    <body>
      <div id="app">{props.children}</div>
      <Scripts />
    </body>
  </html>
);

const head = {
  meta: [
    { title: "Orrery: barq and three.js" },
    {
      name: "description",
      content: "A solar system in @barqjs/three, rendered by @barqjs/start.",
    },
  ],
};

function Layout() {
  return (
    <div class={frame}>
      <nav class={bar}>
        <strong>barq orrery</strong>
        <NavLink to="/" activeClass="active" activeOptions={{ exact: true }}>
          Orrery
        </NavLink>
        <NavLink to="/catalogue" activeClass="active">
          Catalogue
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}

export const Route = createRootRoute({ shellComponent, head, component: Layout });
