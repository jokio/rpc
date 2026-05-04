import { z } from "zod"
import { defineRoutes } from "../types"

export const routes = defineRoutes({
  GET: {
    "/users": {
      queryParams: z.object({ limit: z.coerce.number().optional() }),
      response: z.array(z.object({ id: z.number(), name: z.string() })),
    },
    "/users/:id": {
      response: z.object({ id: z.number(), name: z.string() }),
    },
  },
  QUERY: {
    "/users/search": {
      payload: z.object({ q: z.string() }),
      response: z.object({
        results: z.array(z.object({ id: z.number(), name: z.string() })),
      }),
    },
  },
  POST: {
    "/users": {
      payload: z.object({ name: z.string() }),
      response: z.object({ id: z.number(), name: z.string() }),
    },
    "/logout": {
      payload: z.object({}),
      response: { type: "void" } as any,
    },
  },
  PUT: {
    "/users/:id": {
      payload: z.object({ name: z.string() }),
      response: z.object({ id: z.number(), name: z.string() }),
    },
  },
  PATCH: {
    "/users/:id": {
      payload: z.object({ name: z.string().optional() }),
      response: z.object({ id: z.number(), name: z.string() }),
    },
  },
  DELETE: {
    "/users/:id": {
      payload: z.object({}),
      response: { type: "void" } as any,
    },
  },
})
