import type { NextFunction, Request, Response, Router } from "express"
import { generateOpenApiDocument, type OpenApiOptions } from "./openapi"
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

export type Middleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => void | Promise<void>

export type RouteHandlers<T extends Partial<RouterConfig>, TContext> = {
  [M in keyof T & keyof RouterConfig]?: T[M] extends Record<string, any>
    ? {
        [K in keyof T[M]]?: T[M][K] extends
          | RouteConfig
          | Omit<RouteConfig, "payload">
          ?
              | ((
                  data: M extends "GET"
                    ? HandlerData<Omit<InferRouteConfig<T[M][K]>, "payload">, K>
                    : HandlerData<InferRouteConfig<T[M][K]>, K>,
                  ctx: TContext,
                ) => MaybePromise<InferRouteConfig<T[M][K]>["response"]>)
              | {
                  middleware: Middleware[]
                  handler: (
                    data: M extends "GET"
                      ? HandlerData<
                          Omit<InferRouteConfig<T[M][K]>, "payload">,
                          K
                        >
                      : HandlerData<InferRouteConfig<T[M][K]>, K>,
                    ctx: TContext,
                  ) => MaybePromise<InferRouteConfig<T[M][K]>["response"]>
                }
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
  getCtx: (req: Request, res: Response, next: NextFunction) => TContext,
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

      const ctx = (getCtx(req, res, next) ?? {}) as TContext
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

      const handlerDef = handlers[method]?.[route] as any
      const handlerFn =
        typeof handlerDef === "function" ? handlerDef : handlerDef?.handler
      const result = await handlerFn?.(data as any, ctx)

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
    ctx?: (req: Request, res: Response, next: NextFunction) => TContext
    schemaFile?: string
    validation?:
      | boolean
      | {
          payload?: boolean
          queryParams?: boolean
          response?: boolean
        }
    openapi?: boolean | OpenApiOptions
  },
  handlers: RouteHandlers<T, TContext>,
) => {
  const {
    schemaFile,
    validation = true,
    ctx = () => null as TContext,
    routes,
    openapi = false,
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

    router = Object.keys(methodRoutes as object).reduce((r, route) => {
      const handlerDef = (methodRoutes as any)[route]
      const middlewares: Middleware[] =
        typeof handlerDef === "function" ? [] : (handlerDef?.middleware ?? [])
      return r[routerMethod](
        route,
        ...middlewares,
        createRouteHandler(methodKey, routes, ctx, handlers, route, validation),
      )
    }, router)
  }

  if (schemaFile) {
    router = router.get("/__schema", async (_, res) =>
      res.contentType("text/plain").send(schemaFile),
    )
  }

  if (openapi !== false) {
    const openapiOptions = openapi === true ? {} : openapi
    const docPath = openapiOptions.path ?? "/openapi.json"
    let doc: object | undefined

    router = router.get(docPath, async (_, res) => {
      doc ??= await generateOpenApiDocument(
        routes,
        handlers as Record<string, Record<string, unknown>>,
        openapiOptions,
      )
      res.json(doc)
    })
  }

  return router
}
