import type z from "zod"

export type RouterConfig = {
  GET: Record<string, Omit<RouteConfig, "body">>
  QUERY: Record<string, RouteConfig>
  POST: Record<string, RouteConfig>
  PUT: Record<string, RouteConfig>
  PATCH: Record<string, RouteConfig>
  DELETE: Record<string, RouteConfig>
}

export type RouteConfig = {
  body: z.ZodType
  queryParams?: z.ZodType
  response: z.ZodType
}

export type InferRouteConfig<
  T extends RouteConfig | Omit<RouteConfig, "body">
> = {
  [K in keyof T]: T[K] extends z.ZodType ? z.infer<T[K]> : never
}

export const defineRoutes = <T extends Partial<RouterConfig>>(
  routes: T
): T => routes

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
