import express from "express"
import { z } from "zod"
import { defineRoutes, registerApiAndMcpRoutes } from "../src"

const PORT = Number(process.env.PORT ?? 6060)

const movieSchema = z.object({
  id: z.string().describe("Unique movie id"),
  title: z.string().describe("Movie title"),
  year: z.number().int().describe("Release year"),
  genre: z.string().describe("Primary genre"),
  director: z.string().describe("Director name"),
  rating: z.number().min(0).max(10).describe("Average rating (0-10)"),
})

type Movie = z.infer<typeof movieSchema>

const movies: Movie[] = [
  {
    id: "1",
    title: "The Matrix",
    year: 1999,
    genre: "Sci-Fi",
    director: "The Wachowskis",
    rating: 8.7,
  },
  {
    id: "2",
    title: "Spirited Away",
    year: 2001,
    genre: "Animation",
    director: "Hayao Miyazaki",
    rating: 8.6,
  },
  {
    id: "3",
    title: "The Godfather",
    year: 1972,
    genre: "Crime",
    director: "Francis Ford Coppola",
    rating: 9.2,
  },
  {
    id: "4",
    title: "Parasite",
    year: 2019,
    genre: "Thriller",
    director: "Bong Joon-ho",
    rating: 8.5,
  },
  {
    id: "5",
    title: "Interstellar",
    year: 2014,
    genre: "Sci-Fi",
    director: "Christopher Nolan",
    rating: 8.7,
  },
]

const routes = defineRoutes({
  GET: {
    "/movies": {
      queryParams: z.object({
        genre: z.string().optional().describe("Filter by genre"),
        search: z.string().optional().describe("Search in movie titles"),
      }),
      response: z.array(movieSchema),
    },
    "/movies/:id": {
      response: movieSchema,
    },
  },
  POST: {
    "/movies": {
      payload: movieSchema.omit({ id: true }),
      response: movieSchema,
    },
  },
  PUT: {
    "/movies/:id": {
      payload: movieSchema.omit({ id: true }).partial(),
      response: movieSchema,
    },
  },
  DELETE: {
    "/movies/:id": {
      payload: z.any(),
      response: z.object({ ok: z.boolean() }),
    },
  },
})

const findMovie = (id: string) => {
  const movie = movies.find((x) => x.id === id)
  if (!movie) throw new Error(`Movie not found: ${id}`)
  return movie
}

const app = express()
app.use(express.json())

const { api, mcp } = registerApiAndMcpRoutes(
  { api: express.Router(), mcp: express.Router() },
  {
    routes,
    openapi: {
      info: {
        title: "Movies Demo API",
        version: "1.0.0",
        description: "Mock movies API demonstrating @jokio/rpc",
      },
    },
    mcp: {
      name: "movies-api",
      version: "1.0.0",
      // Mount the MCP endpoint at the root of the mcp router so it
      // resolves to /mcp (not /mcp/mcp) once mounted below.
      path: "/",
    },
    docs: {
      GET: {
        "/movies": {
          summary: "List movies",
          description: "List all movies, optionally filtered by genre or title",
        },
        "/movies/:id": {
          summary: "Get movie",
          description: "Fetch a single movie by id",
        },
      },
      POST: {
        "/movies": {
          summary: "Add movie",
          description: "Add a new movie to the catalog",
        },
      },
      PUT: {
        "/movies/:id": {
          summary: "Update movie",
          description: "Update fields of an existing movie",
        },
      },
      DELETE: {
        "/movies/:id": {
          summary: "Delete movie",
          description: "Remove a movie from the catalog",
        },
      },
    },
  },
  {
    GET: {
      "/movies": ({ queryParams }) =>
        movies.filter(
          (x) =>
            (!queryParams.genre ||
              x.genre.toLowerCase() === queryParams.genre.toLowerCase()) &&
            (!queryParams.search ||
              x.title.toLowerCase().includes(queryParams.search.toLowerCase())),
        ),
      "/movies/:id": ({ params }) => findMovie(params.id),
    },
    POST: {
      "/movies": ({ payload }) => {
        const movie: Movie = {
          id: String(Math.max(0, ...movies.map((x) => Number(x.id))) + 1),
          ...payload,
        }
        movies.push(movie)
        return movie
      },
    },
    PUT: {
      "/movies/:id": ({ params, payload }) => {
        const movie = findMovie(params.id)
        Object.assign(movie, payload)
        return movie
      },
    },
    DELETE: {
      "/movies/:id": ({ params }) => {
        const movie = findMovie(params.id)
        movies.splice(movies.indexOf(movie), 1)
        return { ok: true }
      },
    },
  },
)

app.use("/api", api)
app.use("/mcp", mcp)

app.listen(PORT, () => {
  console.log(`Movies demo API running on http://localhost:${PORT}`)
  console.log(`  REST:     http://localhost:${PORT}/api/movies`)
  console.log(`  OpenAPI:  http://localhost:${PORT}/api/openapi.json`)
  console.log(`  MCP:      http://localhost:${PORT}/mcp`)
})
