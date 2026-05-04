import { describe, expect, it, vi } from "vitest"
import { createHttpClient, replacePathParams } from "../http.client"
import { routes } from "./fixtures"

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
    expect(replacePathParams("/users/:id", { id: 99 })).toBe("/users/99")
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
      const fetch = makeFetch([{ id: 1, name: "alice" }])
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await client.GET("/users")
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe("https://api.example.com/users")
      expect(opts.method).toBe("GET")
      expect(opts.body).toBeUndefined()
    })

    it("POST calls fetch with POST method and JSON body", async () => {
      const fetch = makeFetch({ id: 1, name: "alice" })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await client.POST("/users", { name: "alice" })
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe("https://api.example.com/users")
      expect(opts.method).toBe("POST")
      expect(opts.body).toBe(JSON.stringify({ name: "alice" }))
    })

    it("PUT calls fetch with PUT method and JSON body", async () => {
      const fetch = makeFetch({ id: 1, name: "bob" })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await client.PUT("/users/:id", { name: "bob" }, { params: { id: "1" } })
      const [, opts] = fetch.mock.calls[0]
      expect(opts.method).toBe("PUT")
      expect(opts.body).toBe(JSON.stringify({ name: "bob" }))
    })

    it("PATCH calls fetch with PATCH method and JSON body", async () => {
      const fetch = makeFetch({ id: 1, name: "carol" })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await client.PATCH("/users/:id", { name: "carol" }, { params: { id: "1" } })
      const [, opts] = fetch.mock.calls[0]
      expect(opts.method).toBe("PATCH")
      expect(opts.body).toBe(JSON.stringify({ name: "carol" }))
    })

    it("DELETE calls fetch with DELETE method and no body", async () => {
      const fetch = makeFetch(null)
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await client.DELETE("/users/:id", {}, { params: { id: "1" } })
      expect(fetch.mock.calls[0][1].method).toBe("DELETE")
    })

    it("QUERY calls fetch with QUERY method and JSON body", async () => {
      const fetch = makeFetch({ results: [] })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await client.QUERY("/users/search", { q: "alice" })
      const [, opts] = fetch.mock.calls[0]
      expect(opts.method).toBe("QUERY")
      expect(opts.body).toBe(JSON.stringify({ q: "alice" }))
    })
  })

  describe("URL building", () => {
    it("concatenates base URL and path", async () => {
      const fetch = makeFetch([])
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await client.GET("/users")
      expect(fetch.mock.calls[0][0]).toBe("https://api.example.com/users")
    })

    it("replaces path params in the URL", async () => {
      const fetch = makeFetch({ id: 1, name: "alice" })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await client.GET("/users/:id", { params: { id: "42" } })
      expect(fetch.mock.calls[0][0]).toBe("https://api.example.com/users/42")
    })

    it("appends query params as a query string", async () => {
      const fetch = makeFetch([])
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await client.GET("/users", { queryParams: { limit: 5 } })
      expect(fetch.mock.calls[0][0]).toBe(
        "https://api.example.com/users?limit=5",
      )
    })

    it("combines path params and query params", async () => {
      const fetch = makeFetch([])
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
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
      const fetch = makeFetch([])
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await client.GET("/users")
      expect(fetch.mock.calls[0][1].headers["Content-Type"]).toBe(
        "application/json",
      )
    })

    it("merges headers from async getHeaders()", async () => {
      const fetch = makeFetch([])
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
        getHeaders: async () => ({ Authorization: "Bearer token" }),
      })
      await client.GET("/users")
      const { headers } = fetch.mock.calls[0][1]
      expect(headers.Authorization).toBe("Bearer token")
      expect(headers["Content-Type"]).toBe("application/json")
    })

    it("merges headers from sync getHeaders()", async () => {
      const fetch = makeFetch([])
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
        getHeaders: () => ({ "x-api-key": "secret" }),
      })
      await client.GET("/users")
      expect(fetch.mock.calls[0][1].headers["x-api-key"]).toBe("secret")
    })
  })

  describe("requestInit", () => {
    it("includes global requestInit in fetch options", async () => {
      const fetch = makeFetch([])
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
        requestInit: { credentials: "include" },
      })
      await client.GET("/users")
      expect(fetch.mock.calls[0][1].credentials).toBe("include")
    })

    it("includes per-request requestInit in fetch options", async () => {
      const fetch = makeFetch([])
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await client.GET("/users", { queryParams: {}, requestInit: { keepalive: true } })
      expect(fetch.mock.calls[0][1].keepalive).toBe(true)
    })

    it("per-request requestInit overrides global requestInit", async () => {
      const fetch = makeFetch([])
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
        requestInit: { credentials: "same-origin" },
      })
      await client.GET("/users", { queryParams: {}, requestInit: { credentials: "include" } })
      expect(fetch.mock.calls[0][1].credentials).toBe("include")
    })
  })

  describe("response handling", () => {
    it("returns parsed JSON on a successful response", async () => {
      const fetch = makeFetch([{ id: 1, name: "alice" }])
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      const result = await client.GET("/users")
      expect(result).toEqual([{ id: 1, name: "alice" }])
    })

    it("throws with the error message when response is not ok", async () => {
      const fetch = makeFetch({ message: "Not found" }, false)
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await expect(client.GET("/users")).rejects.toThrow("Not found")
    })

    it("returns undefined and calls text() for a void response type", async () => {
      const mockFetch = makeFetch(null)
      const client = createHttpClient("https://api.example.com", {
        fetch: mockFetch,
        routes,
      })
      const result = await client.POST("/logout", {})
      expect(result).toBeUndefined()
      const mockResponse = await mockFetch.mock.results[0].value
      expect(mockResponse.text).toHaveBeenCalled()
      expect(mockResponse.json).not.toHaveBeenCalled()
    })
  })

  describe("validation", () => {
    it("validates payload with Zod when validate is true", async () => {
      const fetch = makeFetch({ id: 1, name: "alice" })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
        validate: true,
      })
      await expect(
        client.POST("/users", { name: 123 as any }),
      ).rejects.toThrow()
    })

    it("skips payload validation when validate is false (default)", async () => {
      const fetch = makeFetch({ id: 1, name: "alice" })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      await expect(
        client.POST("/users", { name: 123 as any }),
      ).resolves.toEqual({ id: 1, name: "alice" })
    })

    it("validates queryParams with Zod when validate is true", async () => {
      const fetch = makeFetch([])
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
        validate: true,
      })
      await expect(
        client.GET("/users", { queryParams: { limit: "not-a-number" as any } }),
      ).rejects.toThrow()
    })

    it("validates response with Zod when validate is true", async () => {
      const fetch = makeFetch({ id: "not-a-number", name: "alice" })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
        validate: true,
      })
      await expect(client.POST("/users", { name: "alice" })).rejects.toThrow()
    })

    it("skips response validation when validate is false", async () => {
      const fetch = makeFetch({ id: "not-a-number", name: "alice" })
      const client = createHttpClient("https://api.example.com", {
        fetch,
        routes,
      })
      const result = await client.POST("/users", { name: "alice" })
      expect(result).toEqual({ id: "not-a-number", name: "alice" })
    })
  })
})
