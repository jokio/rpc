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
import { registerExpressRoutes } from "@jokio/rpc"

const app = express()
app.use(express.json())

const router = express.Router()

registerExpressRoutes(
  router,
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

app.use("/api", router)
app.listen(3000)
```

#### With TypeScript Types

When using plain TypeScript types, pass the type as a generic parameter. No `routes` object is needed — you get full type safety without runtime validation.

```typescript
registerExpressRoutes<ApiRoutes, { userId: number }>(
  router,
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

### `registerExpressRoutes(router, config, handlers)`

Registers route handlers to an Express router with automatic validation.

**Parameters:**

- `router`: Express Router instance
- `config`: Configuration object
  - `routes`: Optional route definitions object (Zod schemas — omit when using plain TS types)
  - `ctx`: Optional function `(req: Request) => TContext` to provide context to handlers
  - `validation`: Optional boolean to enable response validation (default: true)
  - `schemaFile`: Optional string to expose route schemas at `/__routes` endpoint
- `handlers`: Handler functions for each route
  - `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `QUERY`: Handler functions that receive `(data, ctx)` parameters
    - `data.params`: Path parameters (e.g., `:id` in `/user/:id`)
    - `data.payload`: Request payload (validated by Zod if schemas provided)
    - `data.queryParams`: Query parameters (validated by Zod if schemas provided)

When using plain TypeScript types, pass the type as a generic: `registerExpressRoutes<MyRoutes>(...)`. Zod validation is skipped since there are no schemas.

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

**Client Methods:**

Each HTTP method has a type-safe method on the client:

- `GET(path, options?)`: For GET requests
  - `options.params`: Path parameters
  - `options.queryParams`: Query parameters
- `POST(path, payload, options?)`: For POST requests
- `PUT(path, payload, options?)`: For PUT requests
- `PATCH(path, payload, options?)`: For PATCH requests
- `DELETE(path, payload, options?)`: For DELETE requests
- `QUERY(path, payload, options?)`: For QUERY requests (custom method)

## Type Safety

The library provides end-to-end type safety with both approaches:

- **Zod schemas**: Types are inferred from schemas + runtime validation is available
- **Plain TypeScript types**: Types are enforced at compile time with zero runtime overhead

```typescript
// With Zod — types are inferred, runtime validation available
const client = createHttpClient("http://localhost:3000/api", { routes })
const room = await client.GET("/room/:id")
room.name // string — inferred from z.object({ name: z.string() })

// With plain TS types — same type safety, no runtime cost
registerExpressRoutes<ApiRoutes>(
  router,
  {},
  {
    POST: {
      "/room": ({ payload }) => payload.name.length, // payload typed as { name: string }
    },
  },
)
```

## Error Handling

The library throws errors for:

- HTTP errors (non-2xx responses)
- Validation errors (invalid request/response data)
- Missing path parameters

```typescript
try {
  await client.POST("/user", invalidData)
} catch (error) {
  // Handle validation or HTTP errors
}

// Missing path parameters will throw an error
try {
  await client.GET("/user/:id", {
    params: {}, // Missing 'id' parameter
  })
} catch (error) {
  // Error: Missing required parameter: "id" for path "/user/:id"
}
```

## License

MIT
