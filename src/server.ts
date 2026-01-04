import type { Request, Router } from "express"
import { readFile } from "node:fs/promises"
import type { InferRouteConfig, RouterConfig } from "./types"

// Extract path parameters from route string
// e.g., "/user/:id" -> { id: string }, "/user/:id/post/:postId" -> { id: string, postId: string }
type ExtractRouteParams<T extends string> =
  T extends `${infer _Start}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractRouteParams<`/${Rest}`>]: string }
    : T extends `${infer _Start}:${infer Param}`
    ? { [K in Param]: string }
    : Record<string, never>

export type RouteHandlers<T extends RouterConfig, TContext> = {
  GET: {
    [K in keyof T["GET"]]: (
      data: Omit<Omit<InferRouteConfig<T["GET"][K]>, "body">, "result"> & {
        params: K extends string ? ExtractRouteParams<K> : unknown
      },
      ctx: TContext
    ) =>
      | Promise<InferRouteConfig<T["GET"][K]>["result"]>
      | InferRouteConfig<T["GET"][K]>["result"]
  }
  POST: {
    [K in keyof T["POST"]]: (
      data: Omit<InferRouteConfig<T["POST"][K]>, "result"> & {
        params: K extends string ? ExtractRouteParams<K> : unknown
      },
      ctx: TContext
    ) =>
      | Promise<InferRouteConfig<T["POST"][K]>["result"]>
      | InferRouteConfig<T["POST"][K]>["result"]
  }
}

export const createExpressRouter = <T extends RouterConfig, TContext>(
  router: Router,
  routes: T,
  handlers: RouteHandlers<T, TContext> & {
    ctx?: (req: Request) => TContext
    schemaFilePath?: string
  }
) => {
  router = Object.keys(routes.GET).reduce(
    (r, x) =>
      r.get(x, async (req, res, next) => {
        try {
          const ctx = (handlers.ctx?.(req) ?? {}) as TContext

          const data = {
            params: req.params,
            query: routes.GET[x]?.query?.parse(req.query),
          }
          const result = await handlers.GET[x]?.(data as any, ctx)
          const validatedResult = routes.GET[x]?.result.parse(result)

          res.json(validatedResult)
        } catch (err) {
          next(err)
        }
      }),
    router
  )

  if (handlers.schemaFilePath) {
    router = router.get("/__schema", async (_, res) =>
      res
        .contentType("text/plain")
        .send(await readFile(handlers.schemaFilePath!, "utf8"))
    )
  }

  router = Object.keys(routes.POST).reduce(
    (r, x) =>
      r.post(x, async (req, res, next) => {
        try {
          const ctx = (handlers.ctx?.(req) ?? {}) as TContext

          const data = {
            params: req.params,
            body: routes.POST[x]?.body.parse(req.body),
            query: routes.POST[x]?.query?.parse(req.query),
          }
          const result = await handlers.POST[x]?.(data as any, ctx)
          const validatedResult = routes.POST[x]?.result.parse(result)
          res.json(validatedResult)
        } catch (err) {
          next(err)
        }
      }),
    router
  )

  return router
}
