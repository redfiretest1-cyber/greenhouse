const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");

// Same Cosmos account (one connection string), but a SEPARATE database
// dedicated to configuration, kept apart from the telemetry readings.
const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);

const THRESHOLD_DB = process.env.COSMOS_THRESHOLD_DATABASE || "GreenhouseConfig";
const THRESHOLD_CONTAINER = process.env.COSMOS_THRESHOLD_CONTAINER || "Thresholds";

const DEFAULTS = {
  growLightBelowLight: 18, // grow light ON when light %  < this
  ventAboveTemp: 26,       // vent relay ON when temp °C   > this
  co2AbovePpm: 900,        // CO2 relay  ON when CO2 ppm   > this
  pumpBelowSoil: 40,       // pump relay ON when soil %    < this
};

// Create the separate database + container on first use, then cache it.
let containerPromise;
async function getContainer() {
  if (!containerPromise) {
    containerPromise = (async () => {
      const { database } = await client.databases.createIfNotExists({ id: THRESHOLD_DB });
      try {
        // Provisioned accounts: give the container a small dedicated throughput.
        const { container } = await database.containers.createIfNotExists(
          { id: THRESHOLD_CONTAINER, partitionKey: { paths: ["/deviceId"] } },
          { offerThroughput: 400 }
        );
        return container;
      } catch {
        // Serverless accounts reject throughput — create without it.
        const { container } = await database.containers.createIfNotExists({
          id: THRESHOLD_CONTAINER,
          partitionKey: { paths: ["/deviceId"] },
        });
        return container;
      }
    })();
  }
  return containerPromise;
}

app.http("thresholds", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const container = await getContainer();

      // ---- POST: save/update thresholds for a device ----
      if (request.method === "POST") {
        const body = await request.json();
        const deviceId = body.deviceId || "GreenHouseID";
        const doc = {
          id: `thresholds-${deviceId}`,
          deviceId,
          docType: "thresholds",
          growLightBelowLight: Number(body.growLightBelowLight),
          ventAboveTemp: Number(body.ventAboveTemp),
          co2AbovePpm: Number(body.co2AbovePpm),
          pumpBelowSoil: Number(body.pumpBelowSoil),
          updatedAt: new Date().toISOString(),
        };
        const { resource } = await container.items.upsert(doc);
        return { status: 200, jsonBody: resource };
      }

      // ---- GET: return thresholds for a device (or defaults) ----
      const deviceId = request.query.get("deviceId") || "GreenHouseID";
      const noCache = { "Content-Type": "application/json", "Cache-Control": "no-store" };
      try {
        const { resource } = await container
          .item(`thresholds-${deviceId}`, deviceId)
          .read();
        return { status: 200, headers: noCache, jsonBody: resource || { deviceId, ...DEFAULTS } };
      } catch {
        // No saved thresholds yet -> hand back the defaults.
        return { status: 200, headers: noCache, jsonBody: { deviceId, ...DEFAULTS } };
      }
    } catch (err) {
      context.error("Threshold operation failed:", err);
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});
