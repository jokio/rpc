import type { Request, Router } from "express"
import { readFile } from "node:fs/promises"
import z from "zod"
import {
  defineRoutes,
  type ExtractRouteParams,
  type InferRouteConfig,
  type RouterConfig,
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
  QUERY: {
    [K in keyof T["QUERY"]]: (
      data: HandlerData<InferRouteConfig<T["QUERY"][K]>, K>,
      ctx: TContext
    ) => MaybePromise<InferRouteConfig<T["QUERY"][K]>["response"]>
  }
  POST: {
    [K in keyof T["POST"]]: (
      data: HandlerData<InferRouteConfig<T["POST"][K]>, K>,
      ctx: TContext
    ) => MaybePromise<InferRouteConfig<T["POST"][K]>["response"]>
  }
  PUT: {
    [K in keyof T["PUT"]]: (
      data: HandlerData<InferRouteConfig<T["PUT"][K]>, K>,
      ctx: TContext
    ) => MaybePromise<InferRouteConfig<T["PUT"][K]>["response"]>
  }
  PATCH: {
    [K in keyof T["PATCH"]]: (
      data: HandlerData<InferRouteConfig<T["PATCH"][K]>, K>,
      ctx: TContext
    ) => MaybePromise<InferRouteConfig<T["PATCH"][K]>["response"]>
  }
  DELETE: {
    [K in keyof T["DELETE"]]: (
      data: HandlerData<InferRouteConfig<T["DELETE"][K]>, K>,
      ctx: TContext
    ) => MaybePromise<InferRouteConfig<T["DELETE"][K]>["response"]>
  }
}

const createRouteHandler = <
  T extends RouterConfig,
  TContext,
  M extends keyof RouteHandlers<T, TContext>
>(
  method: M,
  routes: T,
  handlers: RouteHandlers<T, TContext> & {
    ctx?: (req: Request) => TContext
    validation?: boolean
  },
  route: string
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

      res.json(
        handlers.validation ? routeConfig?.response.parse(result) : result
      )
    } catch (err) {
      next(err)
    }
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
  const { schemaFilePath } = handlers

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

    router = Object.keys(routes[methodKey] as object).reduce(
      (r, route) =>
        r[routerMethod](
          route,
          createRouteHandler(methodKey, routes, handlers, route)
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

const routes = defineRoutes({
  GET: {
    "/test": {
      response: z.string(),
    },
  },
})

// registerExpressRoutes(null as any, routes, {
//   GET: {
//     "/test": () => {},
//   },
// })
