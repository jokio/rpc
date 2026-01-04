import type {
  ExtractRouteParams,
  InferRouteConfig,
  RouterConfig,
} from "./types"

// Reusable type for client options with optional params
type ClientOptions<TConfig, K> = Omit<TConfig, "response"> & {
  params?: K extends string ? ExtractRouteParams<K> : unknown
}

export type RouterClient<T extends RouterConfig> = {
  GET: <K extends keyof T["GET"]>(
    path: K,
    options?: ClientOptions<Omit<InferRouteConfig<T["GET"][K]>, "body">, K>
  ) => Promise<InferRouteConfig<T["GET"][K]>["response"]>

  POST: <K extends keyof T["POST"]>(
    path: K,
    body: InferRouteConfig<T["POST"][K]>["body"],
    options?: ClientOptions<Omit<InferRouteConfig<T["POST"][K]>, "body">, K>
  ) => Promise<InferRouteConfig<T["POST"][K]>["response"]>
}

type FetchFunction = (url: string, options: RequestInit) => Promise<Response>

type CreateClientOptions = {
  baseUrl: string
  getHeaders?: () => Promise<Record<string, string>> | Record<string, string>
  fetch?: FetchFunction
  validate?: boolean
  debug?: boolean
}

/**
 * Replaces path parameters with their values.
 * @param path - The path template with parameters (e.g., "/:id/test/:name/info")
 * @param params - The parameter values (e.g., {id: "123", name: "434"})
 * @returns The resolved path (e.g., "/123/test/434/info")
 * @throws Error if a required parameter is missing
 */
export const replacePathParams = (
  path: string,
  params: Record<string, string | number>
): string => {
  const paramNames = new Set<string>()
  const paramPattern = /:([^/]+)/g
  let match: RegExpExecArray | null

  // Extract all parameter names from the path
  while ((match = paramPattern.exec(path)) !== null) {
    paramNames.add(match[1])
  }

  // Check if all required parameters are provided
  for (const paramName of paramNames) {
    if (!(paramName in params)) {
      throw new Error(
        `Missing required parameter: "${paramName}" for path "${path}"`
      )
    }
  }

  // Replace all parameters with their values
  return path.replace(/:([^/]+)/g, (_, paramName) => {
    return String(params[paramName])
  })
}

export const createClient = <T extends RouterConfig>(
  routes: T,
  options: CreateClientOptions
): RouterClient<T> => {
  const {
    baseUrl,
    getHeaders = () => Promise.resolve({}),
    fetch: customFetch = fetch,
    validate = false,
  } = options

  const client = {
    GET: {} as any,
    POST: {} as any,
  }

  client.GET = async (path: string, options?: any) => {
    if (validate && options?.queryParams) {
      routes.GET[path]?.queryParams?.parse(options.queryParams)
    }

    const queryString = options?.queryParams
      ? "?" + new URLSearchParams(options.queryParams).toString()
      : ""

    const finalPath = replacePathParams(path, options.params ?? {})

    const response = await customFetch(`${baseUrl}${finalPath}${queryString}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(await getHeaders()),
      },
    })

    if (!response.ok) {
      const error: any = await response.json()

      if (options.debug) {
        console.debug(error)
      }

      throw new Error(error.message)
    }

    if (routes.GET[path].response.type === "void") {
      await response.text()
      return
    }

    const json = await response.json()

    return validate ? routes.GET[path]?.response.parse(json) : json
  }

  client.POST = async (path: string, body: any, options?: any) => {
    if (validate) {
      if (body) {
        routes.POST[path]?.body?.parse(body)
      }
      if (options?.queryParams) {
        routes.POST[path]?.queryParams?.parse(options.queryParams)
      }
    }

    const queryString = options?.queryParams
      ? "?" + new URLSearchParams(options.queryParams).toString()
      : ""

    const finalPath = replacePathParams(path, options.params ?? {})

    const response = await customFetch(`${baseUrl}${finalPath}${queryString}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await getHeaders()),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error: any = await response.json()

      if (options.debug) {
        console.debug(error)
      }

      throw new Error(error.message)
    }

    if (routes.POST[path].response.type === "void") {
      await response.text()
      return
    }

    const json = await response.json()

    return validate ? routes.POST[path]?.response.parse(json) : json
  }

  return client
}
