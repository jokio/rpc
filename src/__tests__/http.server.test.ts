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
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message })
  })
  return app
}

describe("registerExpressRoutes", () => {
  describe("HTTP method registration", () => {
    it("registers GET routes", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            GET: { "/users": () => [{ id: 1, name: "alice" }] },
          },
        ),
      )
      const res = await request(app).get("/users")
      expect(res.status).toBe(200)
      expect(res.body).toEqual([{ id: 1, name: "alice" }])
    })

    it("registers POST routes", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            POST: { "/users": () => ({ id: 1, name: "alice" }) },
          },
        ),
      )
      const res = await request(app).post("/users").send({ name: "alice" })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 1, name: "alice" })
    })

    it("registers PUT routes", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            PUT: { "/users/:id": () => ({ id: 1, name: "bob" }) },
          },
        ),
      )
      const res = await request(app).put("/users/1").send({ name: "bob" })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 1, name: "bob" })
    })

    it("registers PATCH routes", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            PATCH: { "/users/:id": () => ({ id: 1, name: "carol" }) },
          },
        ),
      )
      const res = await request(app)
        .patch("/users/1")
        .set("Content-Type", "application/json")
        .send({})
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 1, name: "carol" })
    })

    it("registers DELETE routes", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            DELETE: { "/users/:id": () => {} },
          },
        ),
      )
      const res = await request(app).delete("/users/1").send({})
      expect(res.status).toBe(200)
    })

    it("skips method keys with no handlers", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            POST: { "/users": () => ({ id: 1, name: "alice" }) },
          },
        ),
      )
      const res = await request(app).get("/users")
      expect(res.status).toBe(404)
    })
  })

  describe("QUERY method", () => {
    it("returns 405 when request method is not QUERY", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            QUERY: { "/users/search": () => ({ results: [] }) },
          },
        ),
      )
      const res = await request(app).get("/users/search")
      expect(res.status).toBe(405)
    })
  })

  describe("/__schema endpoint", () => {
    it("serves schema content when schemaFile is provided", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(router, { schemaFile: "type Foo = string" }, {}),
      )
      const res = await request(app).get("/__schema")
      expect(res.status).toBe(200)
      expect(res.text).toBe("type Foo = string")
    })

    it("returns 404 when schemaFile is not provided", async () => {
      const app = makeApp((router) => registerExpressRoutes(router, {}, {}))
      const res = await request(app).get("/__schema")
      expect(res.status).toBe(404)
    })
  })

  describe("handler data — params", () => {
    it("passes URL params to the handler", async () => {
      let captured: any
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            GET: {
              "/users/:id/posts/:postId": (data: any) => {
                captured = data.params
                return {}
              },
            },
          },
        ),
      )
      await request(app).get("/users/42/posts/7")
      expect(captured).toEqual({ id: "42", postId: "7" })
    })
  })

  describe("handler data — payload", () => {
    it("passes raw body when no route schema is defined", async () => {
      let captured: any
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            POST: {
              "/users": (data: any) => {
                captured = data.payload
                return { id: 123, name: "alice" }
              },
            },
          },
        ),
      )
      await request(app).post("/users").send({ name: "alice" })
      expect(captured).toEqual({ name: "alice" })
    })

    it("validates and parses payload when schema is defined", async () => {
      let captured: any
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            POST: {
              "/users": (data: any) => {
                captured = data.payload
                return { id: 1, name: data.payload.name }
              },
            },
          },
        ),
      )
      await request(app).post("/users").send({ name: "alice" })
      expect(captured).toEqual({ name: "alice" })
    })

    it("returns 500 when payload fails schema validation", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            POST: { "/users": () => ({ id: 1, name: "x" }) },
          },
        ),
      )
      const res = await request(app).post("/users").send({ name: 123 })
      expect(res.status).toBe(500)
    })

    it("skips payload validation when validation is disabled", async () => {
      let captured: any
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes, validation: false },
          {
            POST: {
              "/users": (data: any) => {
                captured = data.payload
                return { id: 1, name: String(data.payload.name) }
              },
            },
          },
        ),
      )
      await request(app).post("/users").send({ name: 999 })
      expect(captured).toEqual({ name: 999 })
    })
  })

  describe("handler data — queryParams", () => {
    it("passes raw query when no schema is defined", async () => {
      let captured: any
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            GET: {
              "/users": (data: any) => {
                captured = data.queryParams
                return []
              },
            },
          },
        ),
      )
      await request(app).get("/users?limit=10")
      expect(captured).toEqual({ limit: 10 })
    })

    it("validates and coerces queryParams when schema is defined", async () => {
      let captured: any
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes, validation: { queryParams: true } },
          {
            GET: {
              "/users": (data: any) => {
                captured = data.queryParams
                return []
              },
            },
          },
        ),
      )
      await request(app).get("/users?limit=5")
      expect(captured).toEqual({ limit: 5 })
    })

    it("returns 500 when queryParams fails schema validation", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes, validation: { queryParams: true } },
          {
            GET: { "/users": () => [] },
          },
        ),
      )
      const res = await request(app).get("/users?limit=notanumber")
      expect(res.status).toBe(500)
    })
  })

  describe("void response", () => {
    it("responds with status 200 and empty body when handler returns void", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes, validation: false },
          {
            POST: { "/logout": () => undefined },
          },
        ),
      )
      const res = await request(app).post("/logout").send({})
      expect(res.status).toBe(200)
      expect(res.text).toBe("")
    })
  })

  describe("response validation", () => {
    it("returns raw result when response validation is disabled", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes, validation: { response: false } },
          {
            GET: {
              "/users/:id": () => ({
                id: "not-a-number" as any,
                name: "alice",
              }),
            },
          },
        ),
      )
      const res = await request(app).get("/users/1")
      expect(res.body).toEqual({ id: "not-a-number", name: "alice" })
    })

    it("returns 500 when response fails schema validation", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes, validation: { response: true } },
          {
            GET: {
              "/users/:id": () => ({
                id: "not-a-number" as any,
                name: "alice",
              }),
            },
          },
        ),
      )
      const res = await request(app).get("/users/1")
      expect(res.status).toBe(500)
    })
  })

  describe("context (ctx)", () => {
    it("passes ctx derived from req to the handler", async () => {
      let capturedCtx: any
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          {
            routes,
            ctx: (req: any) => ({ userId: req.headers["x-user-id"] }),
          },
          {
            GET: {
              "/me": (_data: any, ctx: any) => {
                capturedCtx = ctx
                return {}
              },
            },
          },
        ),
      )
      await request(app).get("/me").set("x-user-id", "u-99")
      expect(capturedCtx).toEqual({ userId: "u-99" })
    })

    it("defaults ctx to empty object when ctx option is not provided", async () => {
      let capturedCtx: any
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            GET: {
              "/ping": (_data: any, ctx: any) => {
                capturedCtx = ctx
                return {}
              },
            },
          },
        ),
      )
      await request(app).get("/ping")
      expect(capturedCtx).toEqual({})
    })
  })

  describe("middleware", () => {
    it("runs middleware before the handler", async () => {
      const order: string[] = []
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            GET: {
              "/protected": {
                middleware: [
                  (_req: any, _res: any, next: any) => {
                    order.push("mw")
                    next()
                  },
                ],
                handler: () => {
                  order.push("handler")
                  return { ok: true }
                },
              },
            },
          },
        ),
      )
      const res = await request(app).get("/protected")
      expect(res.status).toBe(200)
      expect(order).toEqual(["mw", "handler"])
    })

    it("can short-circuit the request from middleware", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            GET: {
              "/protected": {
                middleware: [
                  (_req: any, res: any, _next: any) => {
                    res.status(401).json({ error: "unauthorized" })
                  },
                ],
                handler: () => ({ ok: true }),
              },
            },
          },
        ),
      )
      const res = await request(app).get("/protected")
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: "unauthorized" })
    })
  })

  describe("error handling", () => {
    it("calls next(err) when the handler throws", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            GET: {
              "/boom": () => {
                throw new Error("something went wrong")
              },
            },
          },
        ),
      )
      const res = await request(app).get("/boom")
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: "something went wrong" })
    })

    it("calls next(err) when an async handler rejects", async () => {
      const app = makeApp((router) =>
        registerExpressRoutes(
          router,
          { routes },
          {
            POST: {
              "/async-boom": async () => {
                throw new Error("async failure")
              },
            },
          },
        ),
      )
      const res = await request(app).post("/async-boom").send({})
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: "async failure" })
    })
  })
})
