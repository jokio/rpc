import type z from "zod"

export type RouterConfig = {
  GET: Record<string, Omit<RouteConfig, "payload">>
  QUERY: Record<string, RouteConfig>
  POST: Record<string, RouteConfig>
  PUT: Record<string, RouteConfig>
  PATCH: Record<string, RouteConfig>
  DELETE: Record<string, RouteConfig>
}

export type RouteConfig = {
  payload: z.ZodType | unknown
  queryParams?: z.ZodType | unknown
  response: z.ZodType | unknown
}

export type Routes = Partial<RouterConfig>

export type InferRouteConfig<
  T extends RouteConfig | Omit<RouteConfig, "payload">,
> = {
  [K in keyof T]: T[K] extends z.ZodType ? z.infer<T[K]> : T[K]
}

// TS-only way of defining routes
export type DefineRoutes<T extends Routes> = T

// Zod way of defining routes
export const defineRoutes = <T extends Routes>(routes: T): T => routes

// Extract path parameters from route string
// e.g., "/user/:id" -> { id: string }, "/user/:id/info" -> { id: string }, "/user/:id/post/:postId" -> { id: string, postId: string }
export type ExtractRouteParams<T extends string> =
  T extends `${infer _Start}:${infer Param}/${infer Rest}`
    ? Rest extends `:${string}`
      ? {
          [K in Param | keyof ExtractRouteParams<`/${Rest}`>]: string
        }
      : Rest extends `${string}/:${string}`
        ? {
            [K in Param | keyof ExtractRouteParams<`/${Rest}`>]: string
          }
        : { [K in Param]: string }
    : T extends `${infer _Start}:${infer Param}`
      ? { [K in Param]: string }
      : Record<string, never>
