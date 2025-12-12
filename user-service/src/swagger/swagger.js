import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import swaggerUi from "swagger-ui-express";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function setupSwagger(app) {
  try {
    const specPath = path.join(__dirname, "../swagger/openapi.yaml");
    const spec = yaml.load(fs.readFileSync(specPath, "utf8"));

    // Serve swagger UI at /docs
    app.use(
      "/docs",
      swaggerUi.serve,
      swaggerUi.setup(spec, {
        explorer: true,
        customCss: ".swagger-ui .topbar { display: none }",
      })
    );

    // Optionally serve raw spec at /openapi.json
    app.get("/openapi.json", (req, res) => res.json(spec));

    console.log("Swagger UI available at /docs");
  } catch (err) {
    console.error("Failed to load OpenAPI spec:", err.message);
  }
}
