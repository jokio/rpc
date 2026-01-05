import {
  type ExtractRouteParams,
  type InferRouteConfig,
  type RouterConfig,
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

  QUERY: <K extends keyof T["QUERY"]>(
    path: K,
    body: InferRouteConfig<T["QUERY"][K]>["body"],
    options?: ClientOptions<Omit<InferRouteConfig<T["QUERY"][K]>, "body">, K>
  ) => Promise<InferRouteConfig<T["QUERY"][K]>["response"]>

  POST: <K extends keyof T["POST"]>(
    path: K,
    body: InferRouteConfig<T["POST"][K]>["body"],
    options?: ClientOptions<Omit<InferRouteConfig<T["POST"][K]>, "body">, K>
  ) => Promise<InferRouteConfig<T["POST"][K]>["response"]>

  PUT: <K extends keyof T["PUT"]>(
    path: K,
    body: InferRouteConfig<T["PUT"][K]>["body"],
    options?: ClientOptions<Omit<InferRouteConfig<T["PUT"][K]>, "body">, K>
  ) => Promise<InferRouteConfig<T["PUT"][K]>["response"]>

  PATCH: <K extends keyof T["PATCH"]>(
    path: K,
    body: InferRouteConfig<T["PATCH"][K]>["body"],
    options?: ClientOptions<Omit<InferRouteConfig<T["PATCH"][K]>, "body">, K>
  ) => Promise<InferRouteConfig<T["PATCH"][K]>["response"]>

  DELETE: <K extends keyof T["DELETE"]>(
    path: K,
    body: InferRouteConfig<T["DELETE"][K]>["body"],
    options?: ClientOptions<Omit<InferRouteConfig<T["DELETE"][K]>, "body">, K>
  ) => Promise<InferRouteConfig<T["DELETE"][K]>["response"]>
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
  routes: Partial<T>,
  options: CreateClientOptions
): RouterClient<T> => {
  const {
    baseUrl,
    getHeaders = () => Promise.resolve({}),
    fetch: customFetch = fetch,
    validate = true,
  } = options

  const buildUrl = (path: string, options?: any): string => {
    const queryString = options?.queryParams
      ? "?" + new URLSearchParams(options.queryParams).toString()
      : ""

    const finalPath = path.includes(":")
      ? replacePathParams(path, options?.params ?? {})
      : path

    return `${baseUrl}${finalPath}${queryString}`
  }

  const handleValidation = (
    method: keyof T,
    path: string,
    body?: any,
    options?: any
  ) => {
    if (!validate) return

    const routeConfig = (routes[method] as any)[path]
    if (body && routeConfig?.body) {
      routeConfig.body.parse(body)
    }
    if (options?.queryParams && routeConfig?.queryParams) {
      routeConfig.queryParams.parse(options.queryParams)
    }
  }

  const handleResponse = async (
    method: keyof T,
    path: string,
    response: Response,
    options?: any
  ) => {
    if (!response.ok) {
      const error: any = await response.json()

      if (options?.debug) {
        console.debug(error)
      }

      throw new Error(error.message)
    }

    const routeConfig = (routes[method] as any)[path]
    if (routeConfig.response.type === "void") {
      await response.text()
      return
    }

    const json = await response.json()

    return validate && routeConfig?.response
      ? routeConfig.response.parse(json)
      : json
  }

  const makeRequest = async (
    method: keyof T,
    path: string,
    body?: any,
    options?: any
  ) => {
    handleValidation(method, path, body, options)

    const url = buildUrl(path, options)
    const fetchOptions: RequestInit = {
      method: method as string,
      headers: {
        "Content-Type": "application/json",
        ...(await getHeaders()),
      },
    }

    if (body !== undefined) {
      fetchOptions.body = JSON.stringify(body)
    }

    const response = await customFetch(url, fetchOptions)

    return handleResponse(method, path, response, options)
  }

  return {
    GET: async (path: any, options?: any) =>
      makeRequest("GET", path, undefined, options),

    QUERY: async (path: any, body: any, options?: any) =>
      makeRequest("QUERY", path, body, options),

    POST: async (path: any, body: any, options?: any) =>
      makeRequest("POST", path, body, options),

    PUT: async (path: any, body: any, options?: any) =>
      makeRequest("PUT", path, body, options),

    PATCH: async (path: any, body: any, options?: any) =>
      makeRequest("PATCH", path, body, options),

    DELETE: async (path: any, body: any, options?: any) =>
      makeRequest("DELETE", path, body, options),
  }
}

// const routes = defineRoutes({
//   GET: {
//     "/test": {
//       response: z.string(),
//     },
//   },
// })

// var t = createClient(routes, { baseUrl: "" })
