import {
  type ExtractRouteParams,
  type InferRouteConfig,
  type RouterConfig,
} from "./types"

// Reusable type for client options with optional params
type ClientOptions<TConfig, K> = Omit<TConfig, "response"> & {
  params?: K extends string ? ExtractRouteParams<K> : unknown
}

export type RouterClient<T extends Partial<RouterConfig>> = {
  [M in keyof T & keyof RouterConfig]: T[M] extends Record<string, any>
    ? M extends "GET"
      ? <K extends keyof T[M]>(
          path: K,
          options?: ClientOptions<
            Omit<InferRouteConfig<T[M][K]>, "payload">,
            K
          >,
        ) => Promise<InferRouteConfig<T[M][K]>["response"]>
      : <K extends keyof T[M]>(
          path: K,
          payload: InferRouteConfig<T[M][K]>["payload"],
          options?: ClientOptions<
            Omit<InferRouteConfig<T[M][K]>, "payload">,
            K
          >,
        ) => Promise<InferRouteConfig<T[M][K]>["response"]>
    : never
}

type FetchFunction = (url: string, options: RequestInit) => Promise<Response>

type CreateClientOptions<T extends Partial<RouterConfig>> = {
  routes?: T
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
  params: Record<string, string | number>,
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
        `Missing required parameter: "${paramName}" for path "${path}"`,
      )
    }
  }

  // Replace all parameters with their values
  return path.replace(/:([^/]+)/g, (_, paramName) => {
    return String(params[paramName])
  })
}

export const createHttpClient = <T extends Partial<RouterConfig>>(
  baseUrl: string,
  options?: CreateClientOptions<T>,
): RouterClient<T> => {
  const {
    routes,
    getHeaders = () => Promise.resolve({}),
    fetch: customFetch = fetch,
    validate = false,
  } = options ?? {}

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
    method: keyof T & keyof RouterConfig,
    path: string,
    payload?: any,
    options?: any,
  ) => {
    if (!validate) return

    const routeConfig = (routes?.[method] as any)?.[path]
    if (payload && routeConfig?.payload) {
      routeConfig.payload.parse(payload)
    }
    if (options?.queryParams && routeConfig?.queryParams) {
      routeConfig.queryParams.parse(options.queryParams)
    }
  }

  const handleResponse = async (
    method: keyof T & keyof RouterConfig,
    path: string,
    response: Response,
    options?: any,
  ) => {
    if (!response.ok) {
      const error: any = await response.json()

      if (options?.debug) {
        console.debug(error)
      }

      throw new Error(error.message)
    }

    const routeConfig = (routes?.[method] as any)?.[path]
    if (routeConfig?.response?.type === "void") {
      await response.text()
      return
    }

    const json = await response.json()

    return validate && routeConfig?.response
      ? routeConfig.response.parse(json)
      : json
  }

  const makeRequest = async (
    method: keyof T & keyof RouterConfig,
    path: string,
    payload?: any,
    options?: any,
  ) => {
    handleValidation(method, path, payload, options)

    const url = buildUrl(path, options)
    const fetchOptions: RequestInit = {
      method: method as string,
      headers: {
        "Content-Type": "application/json",
        ...(await getHeaders()),
      },
    }

    if (payload !== undefined) {
      fetchOptions.body = JSON.stringify(payload)
    }

    const response = await customFetch(url, fetchOptions)

    return handleResponse(method, path, response, options)
  }

  const methodHandlers = {
    GET: async (path: any, options?: any) =>
      makeRequest("GET", path, undefined, options),
    QUERY: async (path: any, payload: any, options?: any) =>
      makeRequest("QUERY", path, payload, options),
    POST: async (path: any, payload: any, options?: any) =>
      makeRequest("POST", path, payload, options),
    PUT: async (path: any, payload: any, options?: any) =>
      makeRequest("PUT", path, payload, options),
    PATCH: async (path: any, payload: any, options?: any) =>
      makeRequest("PATCH", path, payload, options),
    DELETE: async (path: any, payload: any, options?: any) =>
      makeRequest("DELETE", path, payload, options),
  }

  const client = methodHandlers as RouterClient<T>

  return client
}
