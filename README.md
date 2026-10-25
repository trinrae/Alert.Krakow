# Alert.Kraków

Dark city monitoring dashboard for Kraków, Poland. English interface, Europe/Warsaw timezone.

## Live vs linked data
- Live weather and modeled air quality: Open-Meteo (no key required). Air quality is modeled, **not** a GIOŚ station measurement.
- Live map tiles: OpenStreetMap/CARTO. Markers show landmarks, **not incidents**.
- Transport, emergency notices, station air quality, and news: links to source websites. No automated incident ingestion is claimed.

## Deploy online for free (no local software)
1. Sign in at https://github.com and create a new public or private repository named `alert-krakow`.
2. Choose **Add file → Upload files**, upload the **contents** of this folder (including `public/` and `render.yaml`) and commit. GitHub's web upload may require dragging folders or using the repository's web editor. Ensure `package.json`, `server.js`, and `render.yaml` are in the repository root.
3. Sign in at https://dashboard.render.com, select **New → Blueprint**, connect the repository, and approve the free service.
4. Wait for a successful deploy and open the `.onrender.com` URL Render provides. It may take time to wake after inactivity.

No Node.js installation is needed for visitors or for this deployment flow. Custom domains require separate ownership and DNS configuration. For dependable always-on alerting, use paid hosting and verified incident feeds.

## Local development (optional)
`npm install && npm start` then visit http://localhost:3000.

## Source/accuracy note
The dashboard is not an official emergency warning service. In Poland call 112 for emergencies. Upstream APIs may change, fail, or provide delayed/model data. Always consult the official sources for safety-critical decisions.
