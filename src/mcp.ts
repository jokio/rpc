import type { NextFunction, Request, Response } from "express"
import { isZodSchema, type LooseRouterDocs } from "./openapi"
import type { Routes } from "./types"

export type McpOptions = {
  /** Route where the MCP endpoint is served. Default: "/mcp" */
  path?: string
  /** MCP server name. Default: "api" */
  name?: string
  /** MCP server version. Default: "1.0.0" */
  version?: string
}

// GET /users/:id -> "get_users_id"
const toToolName = (method: string, route: string) =>
  `${method}_${route}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

const noopNext = (() => {}) as NextFunction

export const createMcpExpressHandler = (config: {
  routes: Routes | undefined
  handlers: Partial<Record<string, Record<string, unknown> | undefined>>
  docs?: LooseRouterDocs
  getCtx: (req: Request, res: Response, next: NextFunction) => unknown
  options: McpOptions
}) => {
  const { routes, handlers, docs, getCtx, options } = config

  // The MCP SDK and zod are optional peers, loaded on first request
  let depsPromise:
    | Promise<{
        createMcpHandler: any
        McpServer: any
        toNodeHandler: any
        z: any
      }>
    | undefined

  const loadDeps = async () => {
    const [serverMod, nodeMod, zodMod] = await Promise.all([
      import("@modelcontextprotocol/server"),
      import("@modelcontextprotocol/node"),
      import("zod"),
    ])
    return {
      createMcpHandler: serverMod.createMcpHandler,
      McpServer: serverMod.McpServer,
      toNodeHandler: nodeMod.toNodeHandler,
      z: zodMod.z,
    }
  }

  const buildServer = (
    deps: Awaited<NonNullable<typeof depsPromise>>,
    ctx: unknown,
  ) => {
    const { McpServer, z } = deps
    const server = new McpServer({
      name: options.name ?? "api",
      version: options.version ?? "1.0.0",
    })

    for (const [method, methodHandlers] of Object.entries(handlers)) {
      if (!methodHandlers) continue

      for (const route of Object.keys(methodHandlers)) {
        const handlerDef = methodHandlers[route] as any
        const handlerFn =
          typeof handlerDef === "function" ? handlerDef : handlerDef?.handler
        if (!handlerFn) continue

        const routeConfig: any = (routes as any)?.[method]?.[route]
        const doc = docs?.[method]?.[route]
        const paramNames = [...route.matchAll(/:([^/]+)/g)].map((m) => m[1])

        const shape: Record<string, any> = {}
        if (paramNames.length)
          shape.params = z.object(
            Object.fromEntries(paramNames.map((name) => [name, z.string()])),
          )
        if (isZodSchema(routeConfig?.queryParams))
          shape.queryParams = routeConfig.queryParams
        if (method !== "GET" && isZodSchema(routeConfig?.payload))
          shape.payload = routeConfig.payload

        server.registerTool(
          toToolName(method, route),
          {
            ...(doc?.summary && { title: doc.summary }),
            description: doc?.description ?? `${method} ${route}`,
            inputSchema: z.object(shape),
          },
          async (args: any) => {
            const data = {
              params: args?.params ?? {},
              payload: args?.payload,
              queryParams: args?.queryParams ?? {},
            }
            const result = await handlerFn(data, ctx)
            return {
              content: [
                { type: "text", text: JSON.stringify(result ?? null) },
              ],
            }
          },
        )
      }
    }

    return server
  }

  return async (req: Request, res: Response) => {
    let deps: Awaited<NonNullable<typeof depsPromise>>
    try {
      deps = await (depsPromise ??= loadDeps())
    } catch {
      depsPromise = undefined
      res.status(500).json({
        error:
          "MCP support requires optional dependencies. Install them with: npm install @modelcontextprotocol/server @modelcontextprotocol/node zod",
      })
      return
    }

    const ctx = getCtx(req, res, noopNext) ?? {}
    // Per-request server instance (stateless), so ctx can be derived from the
    // live express request just like regular route handlers
    const handler = deps.createMcpHandler(() => buildServer(deps, ctx))
    await deps.toNodeHandler(handler)(req, res, req.body)
  }
}
