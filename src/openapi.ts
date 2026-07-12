import type { RouteDocs, Routes } from "./types"

// Loosely-keyed docs shape used internally (RouterDocs<T> narrows keys per app)
export type LooseRouterDocs = {
  [method: string]: { [route: string]: RouteDocs | undefined } | undefined
}

export type OpenApiOptions = {
  /** Route where the document is served. Default: "/openapi.json" */
  path?: string
  info?: {
    title?: string
    version?: string
    description?: string
  }
  servers?: { url: string; description?: string }[]
}

// QUERY is emitted as the "query" operation (standardized in OpenAPI 3.2)
const openApiMethodMap = {
  GET: "get",
  POST: "post",
  PUT: "put",
  PATCH: "patch",
  DELETE: "delete",
  QUERY: "query",
} as const

// Zod v4 schemas carry a `_zod` internals marker
export const isZodSchema = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "_zod" in value

export const generateOpenApiDocument = async (
  routes: Routes | undefined,
  handlers: Partial<Record<string, Record<string, unknown> | undefined>>,
  options: OpenApiOptions = {},
  docs?: LooseRouterDocs,
) => {
  let toJSONSchema:
    | ((schema: unknown, opts?: object) => Record<string, any>)
    | undefined

  try {
    // Lazy import keeps zod optional at runtime, matching the rest of the lib
    const zod: any = await import("zod")
    toJSONSchema = zod.z?.toJSONSchema ?? zod.toJSONSchema
  } catch {
    // zod not installed — emit the document without schemas
  }

  const convert = (schema: unknown, io: "input" | "output") => {
    if (!toJSONSchema || !isZodSchema(schema)) return undefined
    try {
      const { $schema: _, ...jsonSchema } = toJSONSchema(schema, {
        io,
        unrepresentable: "any",
      })
      return jsonSchema as Record<string, any>
    } catch {
      return undefined
    }
  }

  const paths: Record<string, Record<string, unknown>> = {}

  for (const [method, operation] of Object.entries(openApiMethodMap)) {
    const methodHandlers = handlers[method]
    if (!methodHandlers) continue

    for (const route of Object.keys(methodHandlers)) {
      const routeConfig = (routes as any)?.[method]?.[route]
      const openApiPath = route.replace(/:([^/]+)/g, "{$1}")

      const parameters: Record<string, unknown>[] = [
        ...route.matchAll(/:([^/]+)/g),
      ].map((m) => ({
        name: m[1],
        in: "path",
        required: true,
        schema: { type: "string" },
      }))

      const querySchema = convert(routeConfig?.queryParams, "input")
      if (querySchema?.properties) {
        const required = new Set<unknown>(querySchema.required ?? [])
        for (const [name, schema] of Object.entries(querySchema.properties)) {
          parameters.push({
            name,
            in: "query",
            required: required.has(name),
            schema,
          })
        }
      }

      const op: Record<string, unknown> = {}

      const doc = docs?.[method]?.[route]
      if (doc?.summary) op.summary = doc.summary
      if (doc?.description) op.description = doc.description

      if (parameters.length) op.parameters = parameters

      const payloadSchema =
        method === "GET" ? undefined : convert(routeConfig?.payload, "input")
      if (payloadSchema)
        op.requestBody = {
          required: true,
          content: { "application/json": { schema: payloadSchema } },
        }

      const responseSchema = convert(routeConfig?.response, "output")
      op.responses = {
        "200": {
          description: "Success",
          ...(responseSchema && {
            content: { "application/json": { schema: responseSchema } },
          }),
        },
      }

      paths[openApiPath] = { ...paths[openApiPath], [operation]: op }
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: options.info?.title ?? "API",
      version: options.info?.version ?? "1.0.0",
      ...(options.info?.description && {
        description: options.info.description,
      }),
    },
    ...(options.servers && { servers: options.servers }),
    paths,
  }
}
