import type { Router } from "express";
import type z from "zod";
import type { RouteConfig, RouterConfig } from "./types";

type InferRouteConfig<T extends RouteConfig | Omit<RouteConfig, "body">> = {
  [K in keyof T]: z.infer<T[K]>;
};

export type RouterHandlerConfig<T extends RouterConfig> = {
  GET: {
    [K in keyof T["GET"]]: (
      data: Omit<Omit<InferRouteConfig<T["GET"][K]>, "body">, "result">
    ) => Promise<InferRouteConfig<T["GET"][K]>["result"]>;
  };
  POST: {
    [K in keyof T["POST"]]: (
      data: Omit<InferRouteConfig<T["POST"][K]>, "result">
    ) => Promise<InferRouteConfig<T["POST"][K]>["result"]>;
  };
};

export const applyConfigToExpressRouter = <T extends RouterConfig>(
  router: Router,
  config: T,
  handlers: RouterHandlerConfig<T>
) => {
  const routes = Object.keys(config.GET);

  routes.reduce(
    (r, x) =>
      r.get(x, async (req, res, next) => {
        try {
          const data = {
            query: config.GET[x]?.query?.parse(req.query),
          };
          const result = await handlers.GET[x]?.(data as any);
          const validatedResult = config.GET[x]?.result.parse(result);
          res.json(validatedResult);
        } catch (err) {
          next(err);
        }
      }),
    router
  );

  routes.reduce(
    (r, x) =>
      r.post(x, async (req, res, next) => {
        try {
          const data = {
            body: config.POST[x]?.body.parse(req.body),
            query: config.POST[x]?.query?.parse(req.query),
          };
          const result = await handlers.POST[x]?.(data as any);
          const validatedResult = config.POST[x]?.result.parse(result);
          res.json(validatedResult);
        } catch (err) {
          next(err);
        }
      }),
    router
  );

  return router;
};
