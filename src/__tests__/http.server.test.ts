import express, { Router } from "express"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { registerExpressRoutes } from "../http.server"

function makeApp(
  routesDef: any,
  handlers: any,
  config: {
    ctx?: (req: any) => any
    schemaFile?: string
    validation?:
      | boolean
      | { payload?: boolean; queryParams?: boolean; response?: boolean }
  } = {},
) {
  const app = express()
  app.use(express.json())
  const router = Router()
  registerExpressRoutes(router, { routes: routesDef, ...config }, handlers)
  app.use(router)
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message })
  })
  return app
}

describe("registerExpressRoutes", () => {
  describe("HTTP method registration", () => {
    it("registers GET routes", async () => {
      const app = makeApp(undefined, {
        GET: { "/users": () => ({ ok: true }) },
      })
      const res = await request(app).get("/users")
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
    })

    it("registers POST routes", async () => {
      const app = makeApp(undefined, {
        POST: { "/users": () => ({ created: true }) },
      })
      const res = await request(app).post("/users").send({})
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ created: true })
    })

    it("registers PUT routes", async () => {
      const app = makeApp(undefined, {
        PUT: { "/users/:id": () => ({ updated: true }) },
      })
      const res = await request(app).put("/users/1")
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ updated: true })
    })

    it("registers PATCH routes", async () => {
      const app = makeApp(undefined, {
        PATCH: { "/users/:id": () => ({ patched: true }) },
      })
      const res = await request(app).patch("/users/1")
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ patched: true })
    })

    it("registers DELETE routes", async () => {
      const app = makeApp(undefined, {
        DELETE: { "/users/:id": () => ({ deleted: true }) },
      })
      const res = await request(app).delete("/users/1")
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ deleted: true })
    })

    it("skips method keys with no handlers", async () => {
      // Only POST defined — GET should 404
      const app = makeApp(undefined, {
        POST: { "/items": () => ({ ok: true }) },
      })
      const res = await request(app).get("/items")
      expect(res.status).toBe(404)
    })
  })

  describe("QUERY method", () => {
    it("returns 405 when request method is not QUERY", async () => {
      const app = makeApp(undefined, {
        QUERY: { "/search": () => ({ results: [] }) },
      })
      // router.all() catches all methods — handler guards against non-QUERY
      const res = await request(app).get("/search")
      expect(res.status).toBe(405)
    })
  })

  describe("/__schema endpoint", () => {
    it("serves schema content when schemaFile is provided", async () => {
      const app = makeApp(undefined, {} as any, {
        schemaFile: "type Foo = string",
      })
      const res = await request(app).get("/__schema")
      expect(res.status).toBe(200)
      expect(res.text).toBe("type Foo = string")
    })

    it("returns 404 when schemaFile is not provided", async () => {
      const app = makeApp(undefined, {} as any)
      const res = await request(app).get("/__schema")
      expect(res.status).toBe(404)
    })
  })

  describe("handler data — params", () => {
    it("passes URL params to the handler", async () => {
      let captured: any
      const app = makeApp(undefined, {
        GET: {
          "/users/:id/posts/:postId": (data: any) => {
            captured = data.params
            return {}
          },
        },
      })
      await request(app).get("/users/42/posts/7")
      expect(captured).toEqual({ id: "42", postId: "7" })
    })
  })

  describe("handler data — payload", () => {
    it("passes raw body when no route schema is defined", async () => {
      let captured: any
      const app = makeApp(undefined, {
        POST: {
          "/echo": (data: any) => {
            captured = data.payload
            return {}
          },
        },
      })
      await request(app).post("/echo").send({ name: "alice" })
      expect(captured).toEqual({ name: "alice" })
    })

    it("validates payload with Zod when schema and validation.payload are enabled", async () => {
      const routes = {
        POST: {
          "/items": {
            payload: z.object({ name: z.string() }),
            response: z.object({ name: z.string() }),
          },
        },
      }
      let captured: any
      const app = makeApp(routes, {
        POST: {
          "/items": (data: any) => {
            captured = data.payload
            return { name: data.payload.name }
          },
        },
      })
      await request(app).post("/items").send({ name: "widget" })
      expect(captured).toEqual({ name: "widget" })
    })

    it("passes next(err) when Zod payload validation fails", async () => {
      const routes = {
        POST: {
          "/items": {
            payload: z.object({ name: z.string() }),
            response: z.any(),
          },
        },
      }
      const app = makeApp(routes, {
        POST: { "/items": () => ({}) },
      })
      const res = await request(app).post("/items").send({ name: 123 })
      expect(res.status).toBe(500)
    })

    it("skips payload validation when validation is false", async () => {
      const routes = {
        POST: {
          "/items": {
            payload: z.object({ name: z.string() }),
            response: z.any(),
          },
        },
      }
      let captured: any
      const app = makeApp(
        routes,
        {
          POST: {
            "/items": (data: any) => {
              captured = data.payload
              return {}
            },
          },
        },
        { validation: false },
      )
      // Send invalid payload — should not throw because validation is off
      await request(app).post("/items").send({ name: 999 })
      expect(captured).toEqual({ name: 999 })
    })
  })

  describe("handler data — queryParams", () => {
    it("passes raw query when no schema is defined", async () => {
      let captured: any
      const app = makeApp(undefined, {
        GET: {
          "/search": (data: any) => {
            captured = data.queryParams
            return {}
          },
        },
      })
      await request(app).get("/search?q=hello&limit=10")
      expect(captured).toEqual({ q: "hello", limit: "10" })
    })

    it("validates queryParams with Zod when schema and validation.queryParams are enabled", async () => {
      const routes = {
        GET: {
          "/search": {
            queryParams: z.object({ limit: z.coerce.number() }),
            response: z.any(),
          },
        },
      }
      let captured: any
      const app = makeApp(
        routes,
        {
          GET: {
            "/search": (data: any) => {
              captured = data.queryParams
              return {}
            },
          },
        },
        { validation: { queryParams: true } },
      )
      await request(app).get("/search?limit=5")
      expect(captured).toEqual({ limit: 5 })
    })

    it("passes next(err) when Zod queryParams validation fails", async () => {
      const routes = {
        GET: {
          "/search": {
            queryParams: z.object({ limit: z.number() }),
            response: z.any(),
          },
        },
      }
      const app = makeApp(
        routes,
        { GET: { "/search": () => ({}) } },
        { validation: { queryParams: true } },
      )
      const res = await request(app).get("/search?limit=notanumber")
      expect(res.status).toBe(500)
    })
  })

  describe("response validation", () => {
    it("returns raw result when validation.response is false", async () => {
      const routes = {
        GET: {
          "/data": { response: z.object({ id: z.number() }) },
        },
      }
      const app = makeApp(
        routes,
        { GET: { "/data": () => ({ id: "not-a-number" }) } },
        { validation: { response: false } },
      )
      const res = await request(app).get("/data")
      expect(res.body).toEqual({ id: "not-a-number" })
    })

    it("validates response with Zod when validation.response is true", async () => {
      const routes = {
        GET: {
          "/data": { response: z.object({ id: z.number() }) },
        },
      }
      const app = makeApp(
        routes,
        { GET: { "/data": () => ({ id: "not-a-number", extra: "stripped" }) } },
        { validation: { response: true } },
      )
      const res = await request(app).get("/data")
      expect(res.status).toBe(500)
    })
  })

  describe("context (ctx)", () => {
    it("passes ctx derived from req to the handler", async () => {
      let capturedCtx: any
      const app = makeApp(
        undefined,
        {
          GET: {
            "/me": (_data: any, ctx: any) => {
              capturedCtx = ctx
              return {}
            },
          },
        },
        {
          ctx: (req: any) => ({ userId: req.headers["x-user-id"] }),
        },
      )
      await request(app).get("/me").set("x-user-id", "u-99")
      expect(capturedCtx).toEqual({ userId: "u-99" })
    })

    it("defaults ctx to empty object when ctx option is not provided", async () => {
      let capturedCtx: any
      const app = makeApp(undefined, {
        GET: {
          "/ping": (_data: any, ctx: any) => {
            capturedCtx = ctx
            return {}
          },
        },
      })
      await request(app).get("/ping")
      expect(capturedCtx).toEqual({})
    })
  })

  describe("middleware", () => {
    it("runs middleware before the handler", async () => {
      const order: string[] = []
      const app = makeApp(undefined, {
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
      })
      const res = await request(app).get("/protected")
      expect(res.status).toBe(200)
      expect(order).toEqual(["mw", "handler"])
    })

    it("can short-circuit the request from middleware", async () => {
      const app = makeApp(undefined, {
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
      })
      const res = await request(app).get("/protected")
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: "unauthorized" })
    })
  })

  describe("error handling", () => {
    it("calls next(err) when the handler throws", async () => {
      const app = makeApp(undefined, {
        GET: {
          "/boom": () => {
            throw new Error("something went wrong")
          },
        },
      })
      const res = await request(app).get("/boom")
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: "something went wrong" })
    })

    it("calls next(err) when an async handler rejects", async () => {
      const app = makeApp(undefined, {
        POST: {
          "/async-boom": async () => {
            throw new Error("async failure")
          },
        },
      })
      const res = await request(app).post("/async-boom").send({})
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: "async failure" })
    })
  })
})
