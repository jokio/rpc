import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { createHttpClient, replacePathParams } from "../http.client"

function makeFetch(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(String(body)),
  } as unknown as Response)
}

describe("replacePathParams", () => {
  it("replaces a single path parameter", () => {
    expect(replacePathParams("/users/:id", { id: "42" })).toBe("/users/42")
  })

  it("replaces multiple path parameters", () => {
    expect(
      replacePathParams("/users/:id/posts/:postId", { id: "1", postId: "2" }),
    ).toBe("/users/1/posts/2")
  })

  it("casts numeric parameter values to string", () => {
    expect(replacePathParams("/items/:id", { id: 99 })).toBe("/items/99")
  })

  it("throws when a required parameter is missing", () => {
    expect(() => replacePathParams("/users/:id", {})).toThrow(
      'Missing required parameter: "id" for path "/users/:id"',
    )
  })

  it("returns path unchanged when it has no parameters", () => {
    expect(replacePathParams("/users", {})).toBe("/users")
  })
})

describe("createHttpClient", () => {
  describe("request methods", () => {
    it("GET calls fetch with GET method and no body", async () => {
      const fetch = makeFetch({ ok: true })
      const client = createHttpClient("https://api.example.com", { fetch })
      await (client as any).GET("/users")
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe("https://api.example.com/users")
      expect(opts.method).toBe("GET")
      expect(opts.body).toBeUndefined()
    })

    it("POST calls fetch with POST method and JSON body", async () => {
      const fetch = makeFetch({ id: 1 })
      const client = createHttpClient("https://api.example.com", { fetch })
      await (client as any).POST("/users", { name: "alice" })
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe("https://api.example.com/users")
      expect(opts.method).toBe("POST")
      expect(opts.body).toBe(JSON.stringify({ name: "alice" }))
    })

    it("PUT calls fetch with PUT method and JSON body", async () => {
      const fetch = makeFetch({ updated: true })
      const client = createHttpClient("https://api.example.com", { fetch })
      await (client as any).PUT("/users/1", { name: "bob" })
      const [, opts] = fetch.mock.calls[0]
      expect(opts.method).toBe("PUT")
      expect(opts.body).toBe(JSON.stringify({ name: "bob" }))
    })

    it("PATCH calls fetch with PATCH method and JSON body", async () => {
      const fetch = makeFetch({ patched: true })
      const client = createHttpClient("https://api.example.com", { fetch })
      await (client as any).PATCH("/users/1", { name: "carol" })
      const [, opts] = fetch.mock.calls[0]
      expect(opts.method).toBe("PATCH")
      expect(opts.body).toBe(JSON.stringify({ name: "carol" }))
    })

    it("DELETE calls fetch with DELETE method", async () => {
      const fetch = makeFetch({ deleted: true })
      const client = createHttpClient("https://api.example.com", { fetch })
      await (client as any).DELETE("/users/1", undefined)
      expect(fetch.mock.calls[0][1].method).toBe("DELETE")
      expect(fetch.mock.calls[0][1].body).toBeUndefined()
    })

    it("QUERY calls fetch with QUERY method and JSON body", async () => {
      const fetch = makeFetch({ results: [] })
      const client = createHttpClient("https://api.example.com", { fetch })
      await (client as any).QUERY("/search", { q: "hello" })
      const [, opts] = fetch.mock.calls[0]
      expect(opts.method).toBe("QUERY")
      expect(opts.body).toBe(JSON.stringify({ q: "hello" }))
    })
  })

  describe("URL building", () => {
    it("concatenates base URL and path", async () => {
      const fetch = makeFetch({})
      const client = createHttpClient("https://api.example.com", { fetch })
      await (client as any).GET("/ping")
      expect(fetch.mock.calls[0][0]).toBe("https://api.example.com/ping")
    })

    it("replaces path params in the URL", async () => {
      const fetch = makeFetch({})
      const client = createHttpClient("https://api.example.com", { fetch })
      await (client as any).GET("/users/:id", { params: { id: "42" } })
      expect(fetch.mock.calls[0][0]).toBe("https://api.example.com/users/42")
    })

    it("appends query params as a query string", async () => {
      const fetch = makeFetch({})
      const client = createHttpClient("https://api.example.com", { fetch })
      await (client as any).GET("/search", {
        queryParams: { q: "hello", limit: "5" },
      })
      expect(fetch.mock.calls[0][0]).toBe(
        "https://api.example.com/search?q=hello&limit=5",
      )
    })

    it("combines path params and query params", async () => {
      const fetch = makeFetch({})
      const client = createHttpClient("https://api.example.com", { fetch })
      await (client as any).GET("/users/:id/posts", {
        params: { id: "7" },
        queryParams: { page: "1" },
      })
      expect(fetch.mock.calls[0][0]).toBe(
        "https://api.example.com/users/7/posts?page=1",
      )
    })
  })

  describe("headers", () => {
    it("always sets Content-Type: application/json", async () => {
      const fetch = makeFetch({})
      const client = createHttpClient("https://api.example.com", { fetch })
      await (client as any).GET("/ping")
      expect(fetch.mock.calls[0][1].headers["Content-Type"]).toBe(
        "application/json",
      )
    })

    it("merges headers from async getHeaders()", async () => {
      const fetch = makeFetch({})
      const client = createHttpClient("https://api.example.com", {
        fetch,
        getHeaders: async () => ({ Authorization: "Bearer token" }),
      })
      await (client as any).GET("/ping")
      const { headers } = fetch.mock.calls[0][1]
      expect(headers.Authorization).toBe("Bearer token")
      expect(headers["Content-Type"]).toBe("application/json")
    })

    it("merges headers from sync getHeaders()", async () => {
      const fetch = makeFetch({})
      const client = createHttpClient("https://api.example.com", {
        fetch,
        getHeaders: () => ({ "x-api-key": "secret" }),
      })
      await (client as any).GET("/ping")
      expect(fetch.mock.calls[0][1].headers["x-api-key"]).toBe("secret")
    })
  })

  describe("requestInit", () => {
    it("includes global requestInit in fetch options", async () => {
      const fetch = makeFetch({})
      const client = createHttpClient("https://api.example.com", {
        fetch,
        requestInit: { credentials: "include" },
      })
      await (client as any).GET("/ping")
      expect(fetch.mock.calls[0][1].credentials).toBe("include")
    })

    it("includes per-request requestInit in fetch options", async () => {
      const fetch = makeFetch({})
      const client = createHttpClient("https://api.example.com", { fetch })
      await (client as any).GET("/ping", { requestInit: { cache: "no-store" } })
      expect(fetch.mock.calls[0][1].cache).toBe("no-store")
    })

    it("per-request requestInit overrides global requestInit", async () => {
      const fetch = makeFetch({})
      const client = createHttpClient("https://api.example.com", {
        fetch,
        requestInit: { credentials: "same-origin" },
      })
      await (client as any).GET("/ping", {
        requestInit: { credentials: "include" },
      })
      expect(fetch.mock.calls[0][1].credentials).toBe("include")
    })
  })

  describe("response handling", () => {
    it("returns parsed JSON on a successful response", async () => {
      const fetch = makeFetch({ name: "alice" })
      const client = createHttpClient("https://api.example.com", { fetch })
      const result = await (client as any).GET("/users/1")
      expect(result).toEqual({ name: "alice" })
    })

    it("throws with the error message when response is not ok", async () => {
      const fetch = makeFetch({ message: "Not found" }, false)
      const client = createHttpClient("https://api.example.com", { fetch })
      await expect((client as any).GET("/missing")).rejects.toThrow("Not found")
    })

    it("returns undefined for a void response type", async () => {
      const routes = {
        POST: {
          "/logout": {
            payload: z.object({}),
            response: { type: "void" } as any,
          },
        },
      }
      const fetch = makeFetch(null)
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      const result = await (client as any).POST("/logout", {})
      expect(result).toBeUndefined()
    })
  })

  describe("validation", () => {
    const routes = {
      POST: {
        "/items": {
          payload: z.object({ name: z.string() }),
          response: z.object({ id: z.number() }),
        },
      },
      GET: {
        "/search": {
          queryParams: z.object({ limit: z.number() }),
          response: z.object({ results: z.array(z.string()) }),
        },
      },
    }

    it("validates payload with Zod when validate is true", async () => {
      const fetch = makeFetch({ id: 1 })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
        validate: true,
      })
      await expect(
        (client as any).POST("/items", { name: 123 }),
      ).rejects.toThrow()
    })

    it("skips payload validation when validate is false (default)", async () => {
      const fetch = makeFetch({ id: 1 })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await expect(
        (client as any).POST("/items", { name: 123 }),
      ).resolves.toEqual({ id: 1 })
    })

    it("validates queryParams with Zod when validate is true", async () => {
      const fetch = makeFetch({ results: [] })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
        validate: true,
      })
      await expect(
        (client as any).GET("/search", {
          queryParams: { limit: "not-a-number" },
        }),
      ).rejects.toThrow()
    })

    it("validates response with Zod when validate is true", async () => {
      const fetch = makeFetch({ id: "not-a-number" })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
        validate: true,
      })
      await expect(
        (client as any).POST("/items", { name: "widget" }),
      ).rejects.toThrow()
    })

    it("skips response validation when validate is false", async () => {
      const fetch = makeFetch({ id: "not-a-number" })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      const result = await (client as any).POST("/items", { name: "widget" })
      expect(result).toEqual({ id: "not-a-number" })
    })
  })
})
