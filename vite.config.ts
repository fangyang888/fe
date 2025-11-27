import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "http";

// https://vite.dev/config/
export default defineConfig({
  base: "/fe/",
  plugins: [
    react(),
    {
      name: "history-api",
      configureServer(server) {
        server.middlewares.use(
          "/api/save-history",
          async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
            if (req.method === "POST") {
              let body = "";
              req.on("data", (chunk: Buffer) => {
                body += chunk.toString();
              });
              req.on("end", () => {
                try {
                  const data = JSON.parse(body);
                  const filePath = join(process.cwd(), "src", "history.txt");
                  writeFileSync(filePath, data.content, "utf-8");
                  res.writeHead(200, { "Content-Type": "application/json" });
                  res.end(JSON.stringify({ success: true }));
                } catch (error: unknown) {
                  const errorMessage = error instanceof Error ? error.message : "Unknown error";
                  res.writeHead(500, { "Content-Type": "application/json" });
                  res.end(JSON.stringify({ success: false, error: errorMessage }));
                }
              });
            } else {
              next();
            }
          }
        );

        server.middlewares.use(
          "/api/read-history",
          (req: IncomingMessage, res: ServerResponse, next: () => void) => {
            if (req.method === "GET") {
              try {
                const filePath = join(process.cwd(), "src", "history.txt");
                const content = readFileSync(filePath, "utf-8");
                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end(content);
              } catch (error) {
                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end("");
              }
            } else {
              next();
            }
          }
        );
      },
    } as Plugin,
  ],
});
