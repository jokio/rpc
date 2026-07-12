# @jokio/rpc

A type-safe RPC framework for TypeScript designed for Express servers and HTTP clients. Supports both Zod schemas (with runtime validation) and plain TypeScript types (for type safety without runtime overhead).

An implementation of [RESTspec](https://restspec.org/)

<img width="400" height="400" alt="ChatGPT Image Jan 4, 2026 at 10_15_01 AM" src="https://github.com/user-attachments/assets/5ca6462a-4d3a-46d6-ac09-31ecbc4d06fb" />

## Use Cases

**Front-end → Backend** | **Backend → Backend**

## Features

- Full TypeScript type safety from server to client
- Two route definition styles: **Zod schemas** (with runtime validation) or **plain TypeScript types** (type-only, no runtime overhead)
- Express.js integration for server-side
- Flexible fetch-based client with custom fetch support
- Support for multiple HTTP methods (GET, POST, PUT, PATCH, DELETE, QUERY)
- Path parameters, query parameters, and request payload validation
- Automatic response validation
- Optional OpenAPI 3.1 document generated from Zod schemas, served at `/openapi.json`
- Optional MCP server exposing your routes as tools (via the MCP TypeScript SDK v2), served at `/mcp`
- Optional per-route docs (`summary` / `description`) that feed both OpenAPI and MCP

## Installation

```bash
npm install @jokio/rpc

# Optional: install zod if you want runtime validation
npm install zod
```

## Usage

### 1. Define Your Routes

You can define routes using **Zod schemas** (enables runtime validation) or **plain TypeScript types** (type safety only, no runtime cost).

#### Option A: Zod Schemas

```typescript
import { defineRoutes } from "@jokio/rpc"
import { z } from "zod"

const routes = defineRoutes({
  GET: {
    "/room/:id": {
      response: z.object({ name: z.string() }),
    },
    "/rooms": {
      response: z.any(),
    },
  },
  POST: {
    "/room": {
      payload: z.any(),
      response: z.any(),
    },
  },
})
```

#### Option B: Plain TypeScript Types

```typescript
type ApiRoutes = {
  GET: {
    "/room/:id": {
      response: { name: string }
    }
    "/rooms": {
      response: { count: number }
    }
  }
  POST: {
    "/room": {
      payload: { name: string }
      response: number
    }
  }
}
```

### 2. Set Up the Server

#### With Zod Routes

```typescript
import express from "express"
import { registerApiAndMcpRoutes } from "@jokio/rpc"

const app = express()
app.use(express.json())

const { api, mcp } = registerApiAndMcpRoutes(
  { api: express.Router(), mcp: express.Router() },
  { routes },
  {
    GET: {
      "/room/:id": ({ params }) => ({ name: params.id }),
      "/rooms": () => ({ count: 10 }),
    },
    POST: {
      "/room": ({ payload }) => ({ id: "1" }),
    },
  },
)

app.use("/api", api)
app.use("/mcp", mcp)
app.listen(3000)
```

#### With TypeScript Types

When using plain TypeScript types, pass the type as a generic parameter. No `routes` object is needed — you get full type safety without runtime validation.

```typescript
registerApiAndMcpRoutes<ApiRoutes, { userId: number }>(
  { api: express.Router(), mcp: express.Router() },
  { ctx: (req) => ({ userId: 123 }) },
  {
    GET: {
      "/room/:id": ({ params }) => ({ name: params.id }),
      "/rooms": (_, ctx) => ({ count: ctx.userId }),
    },
    POST: {
      "/room": ({ payload }) => payload.name.length,
    },
  },
)
```

### 3. Create a Type-Safe Client

#### With Zod Routes

The client uses the Zod route definitions for both type inference and optional runtime validation.

```typescript
import { createHttpClient } from "@jokio/rpc"

const client = createHttpClient("http://localhost:3000/api", { routes })

// Fully typed response — .name is inferred from the Zod schema
const room = await client.GET("/room/:id")
console.log(room.name)
```

#### With TypeScript Types

When using plain TypeScript types, pass the type as a generic parameter. No `routes` object is needed.

```typescript
import { createHttpClient } from "@jokio/rpc"

const client = createHttpClient<ApiRoutes>("http://localhost:3000/api")

// Fully typed response — .name is inferred from the ApiRoutes type
const room = await client.GET("/room/:id")
console.log(room.name)
```

## API Reference

### `defineRoutes(routes)`

Helper function to define routes with type inference.

**Parameters:**

- `routes`: Route definitions object containing method configurations (GET, POST, PUT, PATCH, DELETE, QUERY)

**Route Configuration:**

Each route accepts the following fields as either a Zod schema or a plain TypeScript type:

- `payload`: Request body (not available for GET)
- `queryParams`: Query parameters (optional)
- `response`: Response data

### `registerApiAndMcpRoutes(routers, config, handlers)`

Registers route handlers onto two separate Express routers with automatic
validation: the REST/OpenAPI routes on `api` and the MCP endpoint on `mcp`, so
they can be mounted independently. Returns `{ api, mcp }`.

**Parameters:**

- `routers`: Object with `{ api, mcp }` Express Router instances
- `config`: Configuration object
  - `routes`: Optional route definitions object (Zod schemas — omit when using plain TS types)
  - `ctx`: Optional function `(req: Request) => TContext` to provide context to handlers
  - `validation`: Optional boolean to enable response validation (default: true)
  - `schemaFile`: Optional string to expose route schemas at `/__routes` endpoint
  - `openapi`: Optional boolean or options object to enable OpenAPI document generation (default: false, served at `/openapi.json` when enabled)
  - `mcp`: Optional boolean or options object to enable the MCP server endpoint (default: false, served at the root of the `mcp` router — mount it under `/mcp` for a root-level `/mcp` endpoint)
  - `docs`: Optional per-route `{ summary, description }` object, keyed by method and route — used by both OpenAPI and MCP
- `handlers`: Handler functions for each route
  - `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `QUERY`: Handler functions that receive `(data, ctx)` parameters
    - `data.params`: Path parameters (e.g., `:id` in `/user/:id`)
    - `data.payload`: Request payload (validated by Zod if schemas provided)
    - `data.queryParams`: Query parameters (validated by Zod if schemas provided)

When using plain TypeScript types, pass the type as a generic: `registerApiAndMcpRoutes<MyRoutes>(...)`. Zod validation is skipped since there are no schemas.

The legacy `registerExpressRoutes(router, config, handlers)` is still available: it registers everything (REST, OpenAPI and MCP) on a single router, with the MCP endpoint served at `/mcp` relative to where the router is mounted.

### OpenAPI Document

When enabled, an OpenAPI 3.1 document is generated from the Zod schemas and served at `/openapi.json` (relative to where the router is mounted). Only routes with registered handlers are documented.

```typescript
// Enable with defaults
registerApiAndMcpRoutes(routers, { routes, openapi: true }, handlers)

// Or enable with options
registerApiAndMcpRoutes(
  routers,
  {
    routes,
    openapi: {
      path: "/docs/openapi.json", // default: "/openapi.json"
      info: { title: "My API", version: "2.0.0", description: "..." },
      servers: [{ url: "https://api.example.com" }],
    },
  },
  handlers,
)
```

Notes:

- Payload, query parameter, and response schemas are converted with Zod's built-in `z.toJSONSchema()` (requires zod v4).
- `QUERY` routes are documented under the `query` operation (standardized in OpenAPI 3.2).
- When using plain TypeScript types (no `routes` object), the document still lists paths and path parameters, but without schemas.

You can also generate the document yourself without serving it, e.g. to write it to a file:

```typescript
import { generateOpenApiDocument } from "@jokio/rpc"

const doc = await generateOpenApiDocument(routes, handlers, {
  info: { title: "My API", version: "1.0.0" },
})
```

### MCP Server

When enabled, your routes are exposed as MCP tools over Streamable HTTP at the root of the `mcp` router — mount it under `/mcp` for a root-level `/mcp` endpoint — so any MCP client (Claude, IDEs, agents) can call your API directly. Requires the optional peer dependencies:

```bash
npm install @modelcontextprotocol/server@beta @modelcontextprotocol/node@beta
```

```typescript
// Enable with defaults
registerApiAndMcpRoutes(routers, { routes, mcp: true }, handlers)

// Or enable with options
registerApiAndMcpRoutes(
  routers,
  {
    routes,
    mcp: {
      path: "/", // default: "/" (mount the mcp router under "/mcp")
      name: "my-api", // default: "api"
      version: "2.0.0", // default: "1.0.0"
    },
  },
  handlers,
)
```

How it works:

- Each registered handler becomes a tool named `<method>_<route>`, e.g. `GET /users/:id` → `get_users_id`.
- Tool input is `{ params, queryParams, payload }`, built from the route's Zod schemas — the SDK validates arguments against them before your handler runs.
- The handler result is returned as JSON text content.
- `ctx` works the same as regular routes: it is derived from the live Express request of the MCP call.

> [!WARNING]
> Per-route `middleware` does **not** run for MCP tool calls. If your routes rely on middleware for auth, protect the MCP endpoint itself (e.g. mount auth middleware in front of the router) or enforce auth inside `ctx`/handlers.

### Route Docs

Add optional `summary`/`description` per route via the `docs` config — they flow into the OpenAPI operations and MCP tool titles/descriptions:

```typescript
registerApiAndMcpRoutes(
  routers,
  {
    routes,
    openapi: true,
    mcp: true,
    docs: {
      GET: {
        "/users/:id": {
          summary: "Get user",
          description: "Fetch a single user by id",
        },
      },
    },
  },
  handlers,
)
```

For field-level documentation, use Zod's `.describe()` on schema fields — it flows into the generated JSON Schema automatically.

### `createHttpClient(baseUrl, options)`

Creates a type-safe HTTP client.

**Parameters:**

- `baseUrl`: Base URL for API requests
- `options`: Client configuration options
  - `routes`: Route definitions object (Zod schemas for type inference)
  - `getHeaders`: Optional function that returns headers (sync or async)
  - `fetch`: Optional custom fetch function (useful for Node.js or testing)
  - `validate`: Enable client-side request validation (default: false)
  - `debug`: Enable debug logging (default: false)

## License

MIT
