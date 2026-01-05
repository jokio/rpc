# @jokio/rpc

A type-safe RPC framework for TypeScript with Zod validation, designed for Express servers and HTTP clients.

<img width="400" height="400" alt="ChatGPT Image Jan 4, 2026 at 10_15_01 AM" src="https://github.com/user-attachments/assets/5ca6462a-4d3a-46d6-ac09-31ecbc4d06fb" />

## Use Cases

**Front-end → Backend** | **Backend → Backend**

## Features

- Full TypeScript type safety from server to client
- Runtime validation using Zod schemas
- Express.js integration for server-side
- Flexible fetch-based client with custom fetch support
- Support for multiple HTTP methods (GET, POST, PUT, PATCH, DELETE, QUERY)
- Path parameters, query parameters, and request body validation
- Automatic response validation

## Installation

```bash
npm install @jokio/rpc zod
```

## Usage

### 1. Define Your Routes

```typescript
import { defineRoutes } from "@jokio/rpc"
import { z } from "zod"

const routes = defineRoutes({
  GET: {
    "/user/:id": {
      queryParams: z.object({
        include: z.string().optional(),
      }),
      response: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
      }),
    },
  },
  POST: {
    "/user": {
      body: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
      response: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
      }),
    },
  },
  PUT: {
    "/user/:id": {
      body: z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
      }),
      response: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
      }),
    },
  },
})
```

### 2. Set Up the Server

```typescript
import express from "express"
import { registerExpressRoutes } from "@jokio/rpc"

const app = express()
app.use(express.json())

const router = express.Router()

registerExpressRoutes(router, routes, {
  GET: {
    "/user/:id": async ({ params, queryParams }) => {
      // params.id is type-safe and contains the :id from the path
      // queryParams.include is validated by Zod
      return {
        id: params.id,
        name: "John Doe",
        email: "john@example.com",
      }
    },
  },
  POST: {
    "/user": async ({ body }) => {
      // body is validated by Zod
      return {
        id: "2",
        name: body.name,
        email: body.email,
      }
    },
  },
  PUT: {
    "/user/:id": async ({ params, body }) => {
      // Both params and body are type-safe
      return {
        id: params.id,
        name: body.name ?? "John Doe",
        email: body.email ?? "john@example.com",
      }
    },
  },
})

app.use("/api", router)
app.listen(3000)
```

### 3. Create a Type-Safe Client

```typescript
import { createClient } from "@jokio/rpc"

const client = createClient(routes, {
  baseUrl: "http://localhost:3000/api",
  validate: true, // Optional: validate requests on client-side
})

// Fully typed API calls with path parameters
const user = await client.GET("/user/:id", {
  params: { id: "23" },
  queryParams: { include: "profile" },
})

// POST request with body
const newUser = await client.POST("/user", {
  name: "Jane Doe",
  email: "jane@example.com",
})

// PUT request with path parameters and body
const updatedUser = await client.PUT(
  "/user/:id",
  {
    name: "Jane Smith",
  },
  {
    params: { id: "23" },
  }
)
```

## API Reference

### `defineRoutes(routes)`

Helper function to define routes with type inference.

**Parameters:**

- `routes`: Route definitions object containing method configurations (GET, POST, PUT, PATCH, DELETE, QUERY)

**Route Configuration:**

- `body`: Zod schema for request body (not available for GET)
- `queryParams`: Zod schema for query parameters (optional)
- `response`: Zod schema for response data

### `registerExpressRoutes(router, routes, handlers)`

Registers route handlers to an Express router with automatic validation.

**Parameters:**

- `router`: Express Router instance
- `routes`: Route definitions object
- `handlers`: Handler functions for each route with optional configuration
  - `ctx`: Optional function `(req: Request) => TContext` to provide context to handlers
  - `validation`: Optional boolean to enable response validation (default: false)
  - `schemaFile`: Optional path to expose route schemas at `/__routes` endpoint
  - `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `QUERY`: Handler functions that receive `(data, ctx)` parameters
    - `data.params`: Path parameters (e.g., `:id` in `/user/:id`)
    - `data.body`: Request body (validated by Zod)
    - `data.queryParams`: Query parameters (validated by Zod)

### `createClient(routes, options)`

Creates a type-safe HTTP client.

**Parameters:**

- `routes`: Route definitions object (same as used on the server)
- `options`: Client configuration options
  - `baseUrl`: Base URL for API requests
  - `getHeaders`: Optional function that returns headers (sync or async)
  - `fetch`: Optional custom fetch function (useful for Node.js or testing)
  - `validate`: Enable client-side request validation (default: true)
  - `debug`: Enable debug logging (default: false)

**Client Methods:**

Each HTTP method has a type-safe method on the client:

- `GET(path, options?)`: For GET requests
  - `options.params`: Path parameters
  - `options.queryParams`: Query parameters
- `POST(path, body, options?)`: For POST requests
- `PUT(path, body, options?)`: For PUT requests
- `PATCH(path, body, options?)`: For PATCH requests
- `DELETE(path, body, options?)`: For DELETE requests
- `QUERY(path, body, options?)`: For QUERY requests (custom method)

## Type Safety

The library provides end-to-end type safety:

```typescript
// TypeScript knows the exact shape of requests and responses
const result = await client.POST("/user", {
  name: "John",
  email: "invalid-email", // Zod will catch this at runtime
})

// result is typed as { id: string; name: string; email: string }
console.log(result.id)

// Path parameters are type-safe
const user = await client.GET("/user/:id", {
  params: { id: "123" }, // TypeScript enforces correct parameter names
})

// Query parameters are validated
const users = await client.GET("/user/:id", {
  params: { id: "123" },
  queryParams: { include: "profile" }, // Must match Zod schema
})
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
