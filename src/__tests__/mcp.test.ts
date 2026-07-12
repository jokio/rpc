import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import express, { Router } from "express"
import type { Server } from "node:http"
import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import { registerExpressRoutes, type RouteHandlers } from "../http.server"
import { routes } from "./fixtures"

const handlers: RouteHandlers<typeof routes, unknown> = {
  GET: {
    "/users": ({ queryParams }) =>
      [{ id: 1, name: "alice" }].slice(0, queryParams?.limit),
    "/users/:id": ({ params }) => ({ id: Number(params.id), name: "alice" }),
  },
  POST: {
    "/users": ({ payload }) => ({ id: 1, name: payload.name }),
  },
}

function makeApp(config: Parameters<typeof registerExpressRoutes>[1]) {
  const app = express()
  app.use(express.json())
  const router = Router()
  app.use(registerExpressRoutes(router, config, handlers as any))
  return app
}

let server: Server | undefined
let client: Client | undefined

async function connectClient(config: Parameters<typeof registerExpressRoutes>[1]) {
  const app = makeApp(config)
  server = app.listen(0)
  const { port } = server.address() as { port: number }
  client = new Client({ name: "test-client", version: "1.0.0" })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)),
  )
  return client
}

afterEach(async () => {
  await client?.close().catch(() => {})
  server?.close()
  client = undefined
  server = undefined
})

describe("mcp server", () => {
  it("is not served by default", async () => {
    const app = makeApp({ routes })
    const res = await request(app)
      .post("/mcp")
      .send({ jsonrpc: "2.0", id: 1, method: "ping" })
    expect(res.status).toBe(404)
  })

  it("lists a tool per registered handler", async () => {
    const c = await connectClient({ routes, mcp: true })
    const { tools } = await c.listTools()

    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_users",
      "get_users_id",
      "post_users",
    ])
  })

  it("uses docs for tool descriptions and falls back to method + route", async () => {
    const c = await connectClient({
      routes,
      mcp: true,
      docs: {
        GET: {
          "/users/:id": {
            summary: "Get user",
            description: "Fetch a single user by id",
          },
        },
      },
    })
    const { tools } = await c.listTools()
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]))

    expect(byName.get_users_id.title).toBe("Get user")
    expect(byName.get_users_id.description).toBe("Fetch a single user by id")
    expect(byName.post_users.description).toBe("POST /users")
  })

  it("exposes params, queryParams and payload in tool input schemas", async () => {
    const c = await connectClient({ routes, mcp: true })
    const { tools } = await c.listTools()
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]))

    expect(
      Object.keys(byName.get_users_id.inputSchema.properties ?? {}),
    ).toEqual(["params"])
    expect(Object.keys(byName.get_users.inputSchema.properties ?? {})).toEqual(
      ["queryParams"],
    )
    expect(Object.keys(byName.post_users.inputSchema.properties ?? {})).toEqual(
      ["payload"],
    )
  })

  it("calls handlers with params", async () => {
    const c = await connectClient({ routes, mcp: true })
    const result: any = await c.callTool({
      name: "get_users_id",
      arguments: { params: { id: "7" } },
    })

    expect(JSON.parse(result.content[0].text)).toEqual({
      id: 7,
      name: "alice",
    })
  })

  it("calls handlers with a validated payload", async () => {
    const c = await connectClient({ routes, mcp: true })
    const result: any = await c.callTool({
      name: "post_users",
      arguments: { payload: { name: "bob" } },
    })

    expect(JSON.parse(result.content[0].text)).toEqual({ id: 1, name: "bob" })
  })

  it("rejects tool calls with an invalid payload", async () => {
    const c = await connectClient({ routes, mcp: true })
    const result: any = await c
      .callTool({
        name: "post_users",
        arguments: { payload: { name: 123 } },
      })
      .catch((err) => err)

    // Depending on SDK version this surfaces as an isError result or a
    // protocol-level error — either way the handler must not run
    if (result instanceof Error) {
      expect(String(result)).toMatch(/invalid|expected/i)
    } else {
      expect(result.isError).toBe(true)
    }
  })

  it("supports a custom endpoint path", async () => {
    const app = makeApp({ routes, mcp: { path: "/rpc/mcp" } })
    server = app.listen(0)
    const { port } = (server.address() as { port: number })!
    client = new Client({ name: "test-client", version: "1.0.0" })
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/rpc/mcp`),
      ),
    )
    const { tools } = await client.listTools()
    expect(tools.length).toBeGreaterThan(0)
  })
})
