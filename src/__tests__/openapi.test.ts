import express, { Router } from "express"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { registerExpressRoutes } from "../http.server"
import { routes } from "./fixtures"

function makeApp(registerRoutes: (router: Router) => Router) {
  const app = express()
  app.use(express.json())
  const router = Router()
  const updatedRouter = registerRoutes(router)
  app.use(updatedRouter)
  return app
}

describe("openapi document", () => {
  it("is served at /openapi.json when enabled", async () => {
    const app = makeApp((router) =>
      registerExpressRoutes(
        router,
        { routes, openapi: true },
        {
          GET: { "/users": () => [] },
        },
      ),
    )
    const res = await request(app).get("/openapi.json")
    expect(res.status).toBe(200)
    expect(res.body.openapi).toBe("3.1.0")
    expect(res.body.info).toEqual({ title: "API", version: "1.0.0" })
    expect(res.body.paths["/users"].get).toBeDefined()
  })

  it("is not served by default", async () => {
    const app = makeApp((router) =>
      registerExpressRoutes(
        router,
        { routes },
        {
          GET: { "/users": () => [] },
        },
      ),
    )
    const res = await request(app).get("/openapi.json")
    expect(res.status).toBe(404)
  })

  it("supports custom path and info", async () => {
    const app = makeApp((router) =>
      registerExpressRoutes(
        router,
        {
          routes,
          openapi: {
            path: "/docs/openapi.json",
            info: { title: "My API", version: "2.0.0", description: "Test" },
            servers: [{ url: "https://api.example.com" }],
          },
        },
        {
          GET: { "/users": () => [] },
        },
      ),
    )
    const res = await request(app).get("/docs/openapi.json")
    expect(res.status).toBe(200)
    expect(res.body.info).toEqual({
      title: "My API",
      version: "2.0.0",
      description: "Test",
    })
    expect(res.body.servers).toEqual([{ url: "https://api.example.com" }])

    const defaultPath = await request(app).get("/openapi.json")
    expect(defaultPath.status).toBe(404)
  })

  it("converts express path params to openapi format", async () => {
    const app = makeApp((router) =>
      registerExpressRoutes(
        router,
        { routes, openapi: true },
        {
          GET: {
            "/users/:id": () => ({ id: 1, name: "alice" }),
            "/users/:id/posts/:postId": () => null,
          },
        },
      ),
    )
    const res = await request(app).get("/openapi.json")
    const doc = res.body

    expect(doc.paths["/users/{id}"].get.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "string" } },
    ])
    expect(doc.paths["/users/{id}/posts/{postId}"].get.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      {
        name: "postId",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
    ])
  })

  it("includes zod-derived request body and response schemas", async () => {
    const app = makeApp((router) =>
      registerExpressRoutes(
        router,
        { routes, openapi: true },
        {
          POST: { "/users": ({ payload }) => ({ id: 1, name: payload.name }) },
        },
      ),
    )
    const res = await request(app).get("/openapi.json")
    const op = res.body.paths["/users"].post

    expect(op.requestBody.content["application/json"].schema).toMatchObject({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    })
    expect(
      op.responses["200"].content["application/json"].schema,
    ).toMatchObject({
      type: "object",
      properties: { id: { type: "number" }, name: { type: "string" } },
    })
  })

  it("expands queryParams schema into query parameters", async () => {
    const app = makeApp((router) =>
      registerExpressRoutes(
        router,
        { routes, openapi: true },
        {
          GET: { "/users": () => [] },
        },
      ),
    )
    const res = await request(app).get("/openapi.json")
    const op = res.body.paths["/users"].get

    expect(op.parameters).toEqual([
      {
        name: "limit",
        in: "query",
        required: false,
        schema: expect.objectContaining({ type: "number" }),
      },
    ])
  })

  it("documents QUERY routes as the query operation", async () => {
    const app = makeApp((router) =>
      registerExpressRoutes(
        router,
        { routes, openapi: true },
        {
          QUERY: { "/users/search": () => ({ results: [] }) },
        },
      ),
    )
    const res = await request(app).get("/openapi.json")
    const op = res.body.paths["/users/search"].query

    expect(op.requestBody.content["application/json"].schema).toMatchObject({
      type: "object",
      properties: { q: { type: "string" } },
    })
  })

  it("only documents routes with registered handlers", async () => {
    const app = makeApp((router) =>
      registerExpressRoutes(
        router,
        { routes, openapi: true },
        {
          GET: { "/users": () => [] },
        },
      ),
    )
    const res = await request(app).get("/openapi.json")
    expect(Object.keys(res.body.paths)).toEqual(["/users"])
  })

  it("works without a routes config (plain TS types)", async () => {
    type ApiRoutes = {
      GET: { "/ping": { response: string } }
    }
    const app = makeApp((router) =>
      registerExpressRoutes<ApiRoutes, null>(
        router,
        { openapi: true },
        {
          GET: { "/ping": () => "pong" },
        },
      ),
    )
    const res = await request(app).get("/openapi.json")
    expect(res.status).toBe(200)
    expect(res.body.paths["/ping"].get.responses["200"]).toEqual({
      description: "Success",
    })
  })
})
