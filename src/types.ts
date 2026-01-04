import type z from "zod"

export type RouteConfig = {
  body: z.ZodType
  query?: z.ZodType
  result: z.ZodType
}

export type RouterConfig = {
  GET: Record<string, Omit<RouteConfig, "body">>
  POST: Record<string, RouteConfig>
}

export type InferRouteConfig<
  T extends RouteConfig | Omit<RouteConfig, "body">
> = {
  [K in keyof T]: T[K] extends z.ZodType ? z.infer<T[K]> : never
}

export const defineRoutes = <T extends RouterConfig>(routes: T): T =>
  routes
