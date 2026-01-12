import type { Request, Router } from "express"
import {
  type ExtractRouteParams,
  type InferRouteConfig,
  type RouteConfig,
  type RouterConfig,
} from "./types"

// Reusable type for sync or async responses
type MaybePromise<T> = Promise<T> | T

// Reusable type for handler data with params
type HandlerData<TConfig, K> = Omit<TConfig, "response"> & {
  params: K extends string ? ExtractRouteParams<K> : unknown
}

export type RouteHandlers<T extends Partial<RouterConfig>, TContext> = {
  [M in keyof T & keyof RouterConfig]: T[M] extends Record<string, any>
    ? {
        [K in keyof T[M]]: T[M][K] extends
          | RouteConfig
          | Omit<RouteConfig, "body">
          ? (
              data: M extends "GET"
                ? HandlerData<Omit<InferRouteConfig<T[M][K]>, "body">, K>
                : HandlerData<InferRouteConfig<T[M][K]>, K>,
              ctx: TContext
            ) => MaybePromise<InferRouteConfig<T[M][K]>["response"]>
          : never
      }
    : never
}

const createRouteHandler = <
  T extends Partial<RouterConfig>,
  TContext,
  M extends keyof RouteHandlers<T, TContext>
>(
  method: M,
  routes: T,
  getCtx: (req: Request) => TContext,
  handlers: RouteHandlers<T, TContext> & {},
  route: string,
  validation: boolean
) => {
  return async (req: Request, res: any, next: any) => {
    try {
      if (method === "QUERY" && req.method !== "QUERY") {
        res.status(405).send("Method Not Allowed")
        return
      }

      const ctx = (getCtx(req) ?? {}) as TContext
      const routeConfig = (routes[method] as any)[route]

      const data = {
        params: req.params,
        ...(routeConfig?.body && { body: routeConfig.body.parse(req.body) }),
        ...(routeConfig?.queryParams && {
          queryParams: routeConfig.queryParams.parse(req.query),
        }),
      }

      const result = await handlers[method][route]?.(data as any, ctx)

      res.json(validation ? routeConfig?.response.parse(result) : result)
    } catch (err: any) {
      console.warn(method, route, err?.message)
      next(err)
    }
  }
}

export const registerExpressRoutes = <
  T extends Partial<RouterConfig>,
  TContext
>(
  router: Router,
  routes: T,
  config: {
    ctx?: (req: Request) => TContext
    schemaFile?: string
    validation?: boolean
  },
  handlers: RouteHandlers<T, TContext>
) => {
  const { schemaFile, validation = true, ctx = () => null as TContext } = config

  const expressMethodMap = {
    GET: "get",
    POST: "post",
    PUT: "put",
    PATCH: "patch",
    DELETE: "delete",
    QUERY: "all",
  } as const

  for (const [method, routerMethod] of Object.entries(expressMethodMap)) {
    const methodKey = method as keyof RouteHandlers<T, TContext>
    const methodRoutes = routes[methodKey]

    if (!methodRoutes) continue

    router = Object.keys(methodRoutes as object).reduce(
      (r, route) =>
        r[routerMethod](
          route,
          createRouteHandler(
            methodKey,
            routes,
            ctx,
            handlers,
            route,
            validation
          )
        ),
      router
    )
  }

  if (schemaFile) {
    router = router.get("/__routes", async (_, res) =>
      res.contentType("text/plain").send(schemaFile)
    )
  }

  return router
}
