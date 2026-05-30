import Fastify from "fastify";
import cors from "@fastify/cors";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
});


app.get("/health", async () => {
  return { status: "ok", service: "collabdocs-server" };
});

const port = Number(process.env.PORT ?? 4000);

try {
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Server ready at http://localhost:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
