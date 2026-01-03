# @jokio/rpc

A type-safe RPC framework for TypeScript with Zod validation, designed for Express servers and HTTP clients.

## Features

- Full TypeScript type safety from server to client
- Runtime validation using Zod schemas
- Express.js integration for server-side
- Flexible fetch-based client with custom fetch support
- Support for both GET and POST routes
- Query parameters and request body validation
- Automatic response validation

## Installation

```bash
npm install @jokio/rpc zod express
```

## Usage

### 1. Define Your Router Configuration

```typescript
import { defineRouterConfig } from "@jokio/rpc";
import { z } from "zod";

const routerConfig = defineRouterConfig({
  GET: {
    "/users/:id": {
      query: z.object({
        include: z.enum(["posts", "comments"]).optional(),
      }),
      result: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
      }),
    },
  },
  POST: {
    "/users": {
      body: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
      query: z.object({
        sendEmail: z.boolean().optional(),
      }),
      result: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
      }),
    },
  },
});
```

### 2. Set Up the Server

```typescript
import express from "express";
import { applyConfigToExpressRouter } from "@jokio/rpc";

const app = express();
app.use(express.json());

const router = express.Router();

applyConfigToExpressRouter(router, routerConfig, {
  // Optional: Define a context factory function
  ctx: (req) => ({
    userId: req.headers["x-user-id"] as string,
    // Add other context properties like db, logger, etc.
  }),
  GET: {
    "/users/:id": async ({ query }, ctx) => {
      // Handler implementation with context
      console.log("Current user:", ctx.userId);
      return {
        id: "1",
        name: "John Doe",
        email: "john@example.com",
      };
    },
  },
  POST: {
    "/users": async ({ body, query }, ctx) => {
      // Handler implementation with context
      console.log("Creating user, requested by:", ctx.userId);
      return {
        id: "2",
        name: body.name,
        email: body.email,
      };
    },
  },
});

app.use("/api", router);
app.listen(3000);
```

### 3. Create a Type-Safe Client

```typescript
import { createClient } from "@jokio/rpc";

const client = createClient(routerConfig, {
  baseUrl: "http://localhost:3000/api",
  validateRequest: true, // Optional: validate requests on client-side
});

// Fully typed API calls
const user = await client.GET("/users/:id", {
  query: { include: "posts" },
});

const newUser = await client.POST(
  "/users",
  { name: "Jane Doe", email: "jane@example.com" },
  { query: { sendEmail: true } }
);
```

## API Reference

### `defineRouterConfig(config)`

Helper function to define a router configuration with type inference.

### `applyConfigToExpressRouter(router, config, handlers)`

Applies route handlers to an Express router with automatic validation.

**Parameters:**

- `router`: Express Router instance
- `config`: Router configuration object
- `handlers`: Handler functions for each route with optional context factory
  - `ctx`: Optional function `(req: Request) => TContext` to provide context to handlers
  - `GET`: Handler functions that receive `(data, ctx)` parameters
  - `POST`: Handler functions that receive `(data, ctx)` parameters

### `createClient(config, options)`

Creates a type-safe HTTP client.

**Options:**

- `baseUrl`: Base URL for API requests
- `headers`: Optional default headers
- `fetch`: Optional custom fetch function (useful for Node.js or testing)
- `validateRequest`: Enable client-side request validation (default: false)

## Type Safety

The library provides end-to-end type safety:

```typescript
// TypeScript knows the exact shape of requests and responses
const result = await client.POST(
  "/users",
  {
    name: "John",
    email: "invalid-email", // Zod will catch this at runtime
  }
);

// result is typed as { id: string; name: string; email: string }
console.log(result.id);
```

## Error Handling

The library throws errors for:

- HTTP errors (non-2xx responses)
- Validation errors (invalid request/response data)

```typescript
try {
  await client.POST("/users", invalidData);
} catch (error) {
  // Handle validation or HTTP errors
}
```

## License

MIT
