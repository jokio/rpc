import type { InferRouteConfig, RouterConfig } from "./types"

export type RouterClient<T extends RouterConfig> = {
  GET: <K extends keyof T["GET"]>(
    path: K,
    options?: Omit<Omit<InferRouteConfig<T["GET"][K]>, "body">, "result">
  ) => Promise<InferRouteConfig<T["GET"][K]>["result"]>
  POST: <K extends keyof T["POST"]>(
    path: K,
    body: InferRouteConfig<T["POST"][K]>["body"],
    options?: Omit<InferRouteConfig<T["POST"][K]>, "body" | "result">
  ) => Promise<InferRouteConfig<T["POST"][K]>["result"]>
}

type FetchFunction = (url: string, options: RequestInit) => Promise<Response>

type CreateClientOptions = {
  baseUrl: string
  headers?: Record<string, string>
  fetch?: FetchFunction
  validateRequest?: boolean
}

export const createClient = <T extends RouterConfig>(
  config: T,
  options: CreateClientOptions
): RouterClient<T> => {
  const {
    baseUrl,
    headers = {},
    fetch: customFetch = fetch,
    validateRequest = false,
  } = options

  const client = {
    GET: {} as any,
    POST: {} as any,
  }

  client.GET = async (path: string, data?: any) => {
    if (validateRequest && data?.query) {
      config.GET[path]?.query?.parse(data.query)
    }
    const queryString = data?.query
      ? "?" + new URLSearchParams(data.query).toString()
      : ""
    const response = await customFetch(`${baseUrl}${path}${queryString}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    })

    if (!response.ok) {
      const error: any = await response.json()
      console.error(error)
      throw new Error(error.message)
    }

    const json = await response.json()

    return config.GET[path]?.result.parse(json)
  }

  client.POST = async (path: string, body: any, rest?: any) => {
    if (validateRequest) {
      if (body) {
        config.POST[path]?.body?.parse(body)
      }
      if (rest?.query) {
        config.POST[path]?.query?.parse(rest.query)
      }
    }
    const queryString = rest?.query
      ? "?" + new URLSearchParams(rest.query).toString()
      : ""
    const response = await customFetch(`${baseUrl}${path}${queryString}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error: any = await response.json()
      console.error(error)
      throw new Error(error.message)
    }

    const json = await response.json()

    return config.POST[path]?.result.parse(json)
  }

  return client
}
