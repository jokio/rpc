import type z from 'zod'

export type RouteConfig = {
  body: z.ZodType
  query?: z.ZodType
  result: z.ZodType
}

export type RouterConfig = {
  GET: Record<string, Omit<RouteConfig, 'body'>>
  POST: Record<string, RouteConfig>
}

export const defineRouterConfig = <T extends RouterConfig>(config: T): T => config
