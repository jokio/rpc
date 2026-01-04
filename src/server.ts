import type { Request, Router } from "express"
import { readFile } from "node:fs/promises"
import type {
  ExtractRouteParams,
  InferRouteConfig,
  RouterConfig,
} from "./types"

// Reusable type for sync or async responses
type MaybePromise<T> = Promise<T> | T

// Reusable type for handler data with params
type HandlerData<TConfig, K> = Omit<TConfig, "response"> & {
  params: K extends string ? ExtractRouteParams<K> : unknown
}

export type RouteHandlers<T extends RouterConfig, TContext> = {
  GET: {
    [K in keyof T["GET"]]: (
      data: HandlerData<Omit<InferRouteConfig<T["GET"][K]>, "body">, K>,
      ctx: TContext
    ) => MaybePromise<InferRouteConfig<T["GET"][K]>["response"]>
  }
  POST: {
    [K in keyof T["POST"]]: (
      data: HandlerData<InferRouteConfig<T["POST"][K]>, K>,
      ctx: TContext
    ) => MaybePromise<InferRouteConfig<T["POST"][K]>["response"]>
  }
}

export const registerExpressRoutes = <T extends RouterConfig, TContext>(
  router: Router,
  routes: T,
  handlers: RouteHandlers<T, TContext> & {
    ctx?: (req: Request) => TContext
    schemaFilePath?: string
    validation?: boolean
  }
) => {
  const { validation = false, schemaFilePath } = handlers

  router = Object.keys(routes.GET).reduce(
    (r, x) =>
      r.get(x, async (req, res, next) => {
        try {
          const ctx = (handlers.ctx?.(req) ?? {}) as TContext

          const data = {
            params: req.params,
            queryParams: routes.GET[x]?.queryParams?.parse(req.query),
          }
          const result = await handlers.GET[x]?.(data as any, ctx)

          res.json(validation ? routes.GET[x]?.response.parse(result) : result)
        } catch (err) {
          next(err)
        }
      }),
    router
  )

  if (schemaFilePath) {
    router = router.get("/__schema", async (_, res) =>
      res
        .contentType("text/plain")
        .send(await readFile(schemaFilePath!, "utf8"))
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
            queryParams: routes.POST[x]?.queryParams?.parse(req.query),
          }
          const result = await handlers.POST[x]?.(data as any, ctx)

          res.json(validation ? routes.POST[x]?.response.parse(result) : result)
        } catch (err) {
          next(err)
        }
      }),
    router
  )

  return router
}
