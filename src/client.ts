import type z from 'zod'
import type { RouteConfig, RouterConfig } from './types'

type InferRouteConfig<T extends RouteConfig | Omit<RouteConfig, 'body'>> = {
  [K in keyof T]: z.infer<T[K]>
}

export type RouterClient<T extends RouterConfig> = {
  GET: {
    [K in keyof T['GET']]: (
      data?: Omit<Omit<InferRouteConfig<T['GET'][K]>, 'body'>, 'result'>
    ) => Promise<InferRouteConfig<T['GET'][K]>['result']>
  }
  POST: {
    [K in keyof T['POST']]: (
      data: Omit<InferRouteConfig<T['POST'][K]>, 'result'>
    ) => Promise<InferRouteConfig<T['POST'][K]>['result']>
  }
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
    GET: {} as RouterClient<T>['GET'],
    POST: {} as RouterClient<T>['POST'],
  }

  Object.keys(config.GET).forEach((path) => {
    client.GET[path as keyof T['GET']] = async (data?: any) => {
      if (validateRequest && data?.query) {
        config.GET[path]?.query?.parse(data.query)
      }
      const queryString = data?.query
        ? '?' + new URLSearchParams(data.query).toString()
        : ''
      const response = await customFetch(`${baseUrl}${path}${queryString}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return response.json()
    }
  })

  Object.keys(config.POST).forEach((path) => {
    client.POST[path as keyof T['POST']] = async (data: any) => {
      if (validateRequest) {
        if (data?.body) {
          config.POST[path]?.body?.parse(data.body)
        }
        if (data?.query) {
          config.POST[path]?.query?.parse(data.query)
        }
      }
      const queryString = data?.query
        ? '?' + new URLSearchParams(data.query).toString()
        : ''
      const response = await customFetch(`${baseUrl}${path}${queryString}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(data.body),
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return response.json()
    }
  })

  return client
}
