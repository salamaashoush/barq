import { defineConfig, type Plugin } from "vite"
import { barqVitePlugin } from "@barqjs/compiler/vite"

// Mock API plugin for development
function mockApiPlugin(): Plugin {
  return {
    name: "mock-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url!, `http://${req.headers.host}`)

        if (url.pathname === "/api/users") {
          await sleep(500)
          res.setHeader("Content-Type", "application/json")
          res.end(
            JSON.stringify([
              { id: 1, name: "Alice", email: "alice@example.com" },
              { id: 2, name: "Bob", email: "bob@example.com" },
              { id: 3, name: "Charlie", email: "charlie@example.com" },
            ])
          )
          return
        }

        if (url.pathname.startsWith("/api/users/")) {
          const id = url.pathname.split("/").pop()
          await sleep(300)
          res.setHeader("Content-Type", "application/json")
          res.end(
            JSON.stringify({
              id: Number(id),
              name: `User ${id}`,
              email: `user${id}@example.com`,
              bio: "Lorem ipsum dolor sit amet",
            })
          )
          return
        }

        if (url.pathname === "/api/posts") {
          const page = Number(url.searchParams.get("page") || "1")
          await sleep(400)
          res.setHeader("Content-Type", "application/json")
          res.end(
            JSON.stringify({
              posts: Array.from({ length: 10 }, (_, i) => ({
                id: (page - 1) * 10 + i + 1,
                title: `Post ${(page - 1) * 10 + i + 1}`,
                body: "Lorem ipsum dolor sit amet...",
              })),
              nextPage: page < 5 ? page + 1 : null,
            })
          )
          return
        }

        if (url.pathname === "/api/slow") {
          await sleep(2000)
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ message: "Slow response complete" }))
          return
        }

        if (url.pathname === "/api/error") {
          res.statusCode = 500
          res.end("Internal Server Error")
          return
        }

        next()
      })
    },
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default defineConfig({
  plugins: [
    barqVitePlugin(),
    mockApiPlugin(),
  ],
  resolve: {
    // Use "bun" condition to resolve workspace packages to source files
    conditions: ["bun", "import", "module", "browser", "default"],
  },
  server: {
    port: 3456,
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "@barqjs/core",
  },
})
