# Smart Greenhouse Dashboard — Azure Deployment

A React dashboard that visualises IoT greenhouse telemetry stored in **Azure Cosmos DB**,
with a device filter, timeline filters (6h / 24h / 3d / 7d), live metric cards and charts.

## Architecture

    [IoT device] --> [Azure IoT Hub] --> [Cosmos DB]  <-- queried by -->  [Azure Function /api]  <-- fetch -->  [React dashboard]

- **Frontend**: React (GreenhouseDashboard.jsx)
- **Backend API**: Azure Functions (Node v4) — `/api/readings` queries Cosmos with device + time filters
- **Hosting**: Azure Static Web Apps (free tier) hosts BOTH the frontend and the API together

---

## A. Cosmos DB setup

1. Azure Portal -> Create resource -> **Azure Cosmos DB for NoSQL**.
2. Create a **Database** `GreenhouseDB` and a **Container** `Readings`
   with partition key **`/deviceId`** (matches your documents).
3. Your existing telemetry documents already fit the schema used by the API.
4. Settings -> **Keys** -> copy the **PRIMARY CONNECTION STRING**.

## B. Run locally (test before deploying)

    # backend
    cd api
    npm install
    # paste your connection string into local.settings.json (COSMOS_CONNECTION_STRING)
    npm install -g azure-functions-core-tools@4
    func start            # serves http://localhost:7071/api/readings

    # frontend (create a Vite React app, drop in GreenhouseDashboard.jsx)
    npm create vite@latest web -- --template react
    cd web && npm install recharts lucide-react
    # add  "proxy" or use SWA CLI so /api/* points to :7071
    npm run dev

Tip: `npm install -g @azure/static-web-apps-cli` then `swa start web --api-location api`
runs the whole thing exactly like production.

## C. Deploy to Azure Static Web Apps (recommended, free)

1. Push this folder to a **GitHub repo**.
2. Azure Portal -> Create resource -> **Static Web App**.
3. Sign in to GitHub, pick your repo/branch.
4. Build details:
   - **App location**: `/web`
   - **Api location**: `/api`
   - **Output location**: `dist`   (Vite) or `build` (CRA)
5. Create. Azure adds a GitHub Action that builds and deploys on every push.
6. In the Static Web App -> **Configuration**, add application settings:
   - `COSMOS_CONNECTION_STRING`
   - `COSMOS_DATABASE` = greenhouse-iot
   - `COSMOS_CONTAINER` = greenhouse-iot-container
   - `COSMOS_THRESHOLD_DATABASE` = GreenhouseConfig   (separate config DB)
   - `COSMOS_THRESHOLD_CONTAINER` = Thresholds
7. Open the generated `*.azurestaticapps.net` URL — done. The dashboard calls
   `/api/readings` on the same domain, so there are no CORS issues.

## Filters (already implemented in the API)

| Filter        | Frontend control | API query param | Cosmos SQL |
|---------------|------------------|-----------------|------------|
| Device        | dropdown         | `deviceId`      | `c.deviceId = @deviceId` |
| Time window   | 6h/24h/3d/7d     | `hours`         | `c.eventTime >= @since`  |

Example call: `/api/readings?deviceId=GreenHouseID&hours=24`
