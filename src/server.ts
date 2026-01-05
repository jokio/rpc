import type { Request, Router } from "express"
import { readFile } from "node:fs/promises"
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
  handlers: RouteHandlers<T, TContext> & {
    ctx?: (req: Request) => TContext
  },
  route: string,
  validation: boolean
) => {
  return async (req: Request, res: any, next: any) => {
    try {
      if (method === "QUERY" && req.method !== "QUERY") {
        res.status(405).send("Method Not Allowed")
        return
      }

      const ctx = (handlers.ctx?.(req) ?? {}) as TContext
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
    } catch (err) {
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
  handlers: RouteHandlers<T, TContext> & {
    ctx?: (req: Request) => TContext
    schemaFilePath?: string
    validation?: boolean
  }
) => {
  const { schemaFilePath, validation = true } = handlers

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
          createRouteHandler(methodKey, routes, handlers, route, validation)
        ),
      router
    )
  }

  if (schemaFilePath) {
    router = router.get("/__schema", async (_, res) =>
      res
        .contentType("text/plain")
        .send(await readFile(schemaFilePath!, "utf8"))
    )
  }

  return router
}
