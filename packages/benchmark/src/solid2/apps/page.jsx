/**
 * A storefront page, the shared subject of the SSR and hydration rows: a
 * header with a nav list, a grid of product cards with conditional badges and
 * nested tag lists, live text, event handlers, and a footer. Written once in
 * Solid 2.0 and compiled unchanged for barq, as `jfb.jsx` is.
 */
import { createSignal, For, Show } from "solid-js"

function Header(props) {
  return (
    <header class="site-header">
      <a href="/" class="logo">
        {props.title}
      </a>
      <nav>
        <For each={props.links}>
          {(link) => (
            <a href={link.href} class={link.active ? "nav-link active" : "nav-link"}>
              {link.label}
            </a>
          )}
        </For>
      </nav>
    </header>
  )
}

function Card(props) {
  return (
    <article class="card" data-id={props.item.id}>
      <h2 class="card-title">{props.item.title}</h2>
      <p class="card-description">{props.item.description}</p>
      <Show when={props.item.onSale}>
        <span class="badge">Sale</span>
      </Show>
      <ul class="tags">
        <For each={props.item.tags}>{(tag) => <li class="tag">{tag}</li>}</For>
      </ul>
      <div class="card-footer">
        <span class="price">{props.item.price.toFixed(2)}</span>
        <button type="button" class="add" onClick={() => props.onAdd(props.item.id)}>
          Add to cart
        </button>
      </div>
    </article>
  )
}

export function App(props) {
  const [cart, setCart] = createSignal(0)
  return (
    <div id="app">
      <Header title="Example Shop" links={props.data.links} />
      <main>
        <p class="summary">
          {props.data.items.length} products, {cart()} in cart
        </p>
        <section class="grid">
          <For each={props.data.items}>
            {(item) => <Card item={item} onAdd={() => setCart((n) => n + 1)} />}
          </For>
        </section>
      </main>
      <footer class="site-footer">
        <a href="https://example.com/about">About salama &amp; co</a>
      </footer>
    </div>
  )
}

const WORDS = ["lamp", "chair", "desk", "shelf", "rug", "mirror", "clock", "vase", "stool", "bench"]

export function makeData(count) {
  const items = new Array(count)
  for (let i = 0; i < count; i++) {
    const word = WORDS[i % WORDS.length]
    items[i] = {
      id: i,
      title: `${word} <${i}>`,
      description: `A ${word} for the "${i % 3 === 0 ? "living" : "dining"}" room & beyond.`,
      price: 10 + ((i * 37) % 300) + 0.99,
      onSale: i % 4 === 0,
      tags: [word, i % 2 === 0 ? "oak" : "pine", "in stock"],
    }
  }
  return {
    links: [
      { href: "/", label: "Home", active: true },
      { href: "/products", label: "Products", active: false },
      { href: "/about", label: "About", active: false },
      { href: "/contact", label: "Contact", active: false },
    ],
    items,
  }
}
