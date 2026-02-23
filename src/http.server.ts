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
          | Omit<RouteConfig, "payload">
          ? (
              data: M extends "GET"
                ? HandlerData<Omit<InferRouteConfig<T[M][K]>, "payload">, K>
                : HandlerData<InferRouteConfig<T[M][K]>, K>,
              ctx: TContext,
            ) => MaybePromise<InferRouteConfig<T[M][K]>["response"]>
          : never
      }
    : never
}

const createRouteHandler = <
  T extends Partial<RouterConfig>,
  TContext,
  M extends keyof RouteHandlers<T, TContext>,
>(
  method: M,
  routes: T | undefined,
  getCtx: (req: Request) => TContext,
  handlers: RouteHandlers<T, TContext> & {},
  route: string,
  validation:
    | boolean
    | {
        payload?: boolean
        queryParams?: boolean
        response?: boolean
      },
) => {
  return async (req: Request, res: any, next: any) => {
    try {
      if (method === "QUERY" && req.method !== "QUERY") {
        res.status(405).send("Method Not Allowed")
        return
      }

      const validationCheck = {
        payload:
          typeof validation === "boolean"
            ? validation
            : (validation.payload ?? false),

        queryParams:
          typeof validation === "boolean"
            ? validation
            : (validation.queryParams ?? false),

        response:
          typeof validation === "boolean"
            ? validation
            : (validation.response ?? false),
      }

      const ctx = (getCtx(req) ?? {}) as TContext
      const routeConfig: any = routes?.[method]?.[route]

      const data = {
        params: req.params,

        payload:
          routeConfig?.payload && validationCheck.payload
            ? routeConfig.payload.parse(req.body)
            : req.body,

        queryParams:
          routeConfig?.queryParams && validationCheck.queryParams
            ? routeConfig.queryParams.parse(req.query)
            : req.query,
      }

      const result = await handlers[method][route]?.(data as any, ctx)

      res.json(
        routeConfig?.response && validationCheck.response
          ? routeConfig?.response.parse(result)
          : result,
      )
    } catch (err: any) {
      console.warn(method, route, err?.message)
      next(err)
    }
  }
}

export const registerExpressRoutes = <
  T extends Partial<RouterConfig>,
  TContext,
>(
  router: Router,
  config: {
    routes?: T
    ctx?: (req: Request) => TContext
    schemaFile?: string
    validation?:
      | boolean
      | {
          payload?: boolean
          queryParams?: boolean
          response?: boolean
        }
  },
  handlers: RouteHandlers<T, TContext>,
) => {
  const {
    schemaFile,
    validation = true,
    ctx = () => null as TContext,
    routes,
  } = config

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
    const methodRoutes = handlers[methodKey]

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
            validation,
          ),
        ),
      router,
    )
  }

  if (schemaFile) {
    router = router.get("/__routes", async (_, res) =>
      res.contentType("text/plain").send(schemaFile),
    )
  }

  return router
}
