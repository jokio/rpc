import type { Request, Router } from "express"
import type { InferRouteConfig, RouterConfig } from "./types"

export type RouterHandlerConfig<T extends RouterConfig, TContext> = {
  GET: {
    [K in keyof T["GET"]]: (
      data: Omit<Omit<InferRouteConfig<T["GET"][K]>, "body">, "result">,
      ctx: TContext
    ) =>
      | Promise<InferRouteConfig<T["GET"][K]>["result"]>
      | InferRouteConfig<T["GET"][K]>["result"]
  }
  POST: {
    [K in keyof T["POST"]]: (
      data: Omit<InferRouteConfig<T["POST"][K]>, "result">,
      ctx: TContext
    ) =>
      | Promise<InferRouteConfig<T["POST"][K]>["result"]>
      | InferRouteConfig<T["POST"][K]>["result"]
  }
}

export const applyConfigToExpressRouter = <T extends RouterConfig, TContext>(
  router: Router,
  config: T,
  handlers: RouterHandlerConfig<T, TContext> & {
    ctx?: (req: Request) => TContext
  }
) => {
  router = Object.keys(config.GET).reduce(
    (r, x) =>
      r.get(x, async (req, res, next) => {
        try {
          const ctx = (handlers.ctx?.(req) ?? {}) as TContext

          const data = {
            query: config.GET[x]?.query?.parse(req.query),
          }
          const result = await handlers.GET[x]?.(data as any, ctx)
          const validatedResult = config.GET[x]?.result.parse(result)
          res.json(validatedResult)
        } catch (err) {
          next(err)
        }
      }),
    router
  )

  router = Object.keys(config.POST).reduce(
    (r, x) =>
      r.post(x, async (req, res, next) => {
        try {
          const ctx = (handlers.ctx?.(req) ?? {}) as TContext

          const data = {
            body: config.POST[x]?.body.parse(req.body),
            query: config.POST[x]?.query?.parse(req.query),
          }
          const result = await handlers.POST[x]?.(data as any, ctx)
          const validatedResult = config.POST[x]?.result.parse(result)
          res.json(validatedResult)
        } catch (err) {
          next(err)
        }
      }),
    router
  )

  return router
}
