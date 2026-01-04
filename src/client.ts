import type { InferRouteConfig, RouterConfig } from "./types"

export type RouterClient<T extends RouterConfig> = {
  GET: <K extends keyof T["GET"]>(
    path: K,
    options?: Omit<Omit<InferRouteConfig<T["GET"][K]>, "body">, "response">
  ) => Promise<InferRouteConfig<T["GET"][K]>["response"]>
  POST: <K extends keyof T["POST"]>(
    path: K,
    body: InferRouteConfig<T["POST"][K]>["body"],
    options?: Omit<InferRouteConfig<T["POST"][K]>, "body" | "response">
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

    const response = await customFetch(`${baseUrl}${path}${queryString}`, {
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

    const json = await response.json()

    return routes.GET[path]?.response.parse(json)
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

    const response = await customFetch(`${baseUrl}${path}${queryString}`, {
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

    const json = await response.json()

    return routes.POST[path]?.response.parse(json)
  }

  return client
}
