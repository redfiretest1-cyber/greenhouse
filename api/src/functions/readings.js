const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");

// Connection string is read from app settings (set in Azure portal / SWA config)
const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client
  .database(process.env.COSMOS_DATABASE || "GreenhouseDB")
  .container(process.env.COSMOS_CONTAINER || "Readings");

app.http("readings", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      // ---- POST: insert a new reading document into Cosmos ----
      if (request.method === "POST") {
        const body = await request.json();
        const doc = {
          id: (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`),
          deviceId: body.deviceId || "GreenHouseID",
          temperature: Number(body.temperature),
          humidity: Number(body.humidity),
          soilPercent: Number(body.soilPercent),
          co2Ppm: Number(body.co2Ppm),
          lightPercent: Number(body.lightPercent),
          growLightOn: !!body.growLightOn,
          ventRelayOn: !!body.ventRelayOn,
          co2RelayOn: !!body.co2RelayOn,
          pumpRelayOn: !!body.pumpRelayOn,
          eventTime: body.eventTime || new Date().toISOString(),
        };
        const { resource } = await container.items.create(doc);
        return { status: 201, jsonBody: resource };
      }

      // ---- GET: read filters from the query string ----
      const deviceId = request.query.get("deviceId"); // e.g. GreenHouseID
      const hours = parseInt(request.query.get("hours") || "24", 10);
      const sinceIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();

      // ---- build a parameterised SQL query (safe from injection) ----
      const conditions = ["c.eventTime >= @since"];
      const parameters = [{ name: "@since", value: sinceIso }];

      if (deviceId) {
        conditions.push("c.deviceId = @deviceId");
        parameters.push({ name: "@deviceId", value: deviceId });
      }

      const querySpec = {
        query: `SELECT c.deviceId, c.id, c.temperature, c.humidity,
                       c.soilPercent, c.co2Ppm, c.lightPercent,
                       c.growLightOn, c.ventRelayOn, c.co2RelayOn,
                       c.pumpRelayOn, c.eventTime
                FROM c
                WHERE ${conditions.join(" AND ")}
                ORDER BY c.eventTime ASC`,
        parameters,
      };

      const { resources } = await container.items.query(querySpec).fetchAll();

      return {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        jsonBody: resources,
      };
    } catch (err) {
      context.error("Cosmos query failed:", err);
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});

// Optional: list distinct devices for the device filter dropdown
app.http("devices", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async () => {
    const { resources } = await container.items
      .query("SELECT DISTINCT VALUE c.deviceId FROM c")
      .fetchAll();
    return { status: 200, jsonBody: resources };
  },
});
