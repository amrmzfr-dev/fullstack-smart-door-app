# Smart Door

One access-controlled door: 4x3 keypad PIN, AS608 fingerprint, EM lock,
exit button, door contact — plus a web app to manage who can get in.

```
frontend/   React + TypeScript + Tailwind (same look as Gate Sensor)
backend/    ASP.NET Core (.NET 10) + PostgreSQL + Redis
firmware/   ESP32 door controller (PlatformIO)
```

## How the parts talk

- **MQTT (always-on, the fast path):** the door keeps one TLS connection to
  the Mosquitto broker on the VPS (prod 103.20.240.48:8883, dev :8884). The
  server pushes commands (unlock, enroll, delete) the moment they're made; the
  door pushes its state the moment it changes, plus command results. The
  broker's last will marks the door offline instantly if it drops. Topics:
  `smartdoor/door/{cmd,access,status,report,online}` — see `mosquitto/acl`.
- **REST (fallback + bulk):** if MQTT is unreachable the door falls back to the
  heartbeat below. The access-list download and the event log always use REST.

- The door calls `POST /api/device/heartbeat` every 2 s with its status and
  gets back any waiting commands (app unlock, enroll fingerprint, delete
  fingerprint) and the current access-list version.
- When the version changes it downloads `GET /api/device/access-list`
  (PIN hashes + allowed fingerprint slots) and saves it to flash, so PINs and
  fingerprints keep working when the network or server is down.
- Every PIN / fingerprint / exit-button / alarm / door open-close is sent to
  `POST /api/device/events` and shows up in the web app's log.
- The web app has two parts:
  - `/` — the **keypad app**. No login. Type a PIN, or use the phone's own
    fingerprint / face (set up once per phone with your PIN). It never shows
    who came in. Wrong PINs are limited to 8 a minute per address.
  - `/admin` — the **admin dashboard** (login). People, PINs, door-sensor
    fingerprints, phones, and the activity log. There is no unlock button.
- Device endpoints use the `X-Device-Key` header (backend `Device:ApiKey`),
  the admin endpoints use a normal login.
- Phone fingerprint needs HTTPS (localhost is fine for testing). The deployed
  sites set `WebAuthn__RpId` / `WebAuthn__Origins__0` in their `.env` files.

## Run locally

1. `docker compose up -d` — Postgres (5433) and Redis (6380)
2. `cd backend && dotnet run` — API on http://0.0.0.0:5125, applies
   migrations, creates the dev login **admin / admin123**
3. `cd frontend && npm install && npm run dev` — keypad at
   http://localhost:5173, admin at http://localhost:5173/admin
4. Firmware: fill in WiFi in `firmware/door-controller/include/secrets.h`
   (copy of `secrets.h.example`; `API_BASE_URL` must be this PC's LAN IP),
   then `pio run -t upload` from `firmware/door-controller`.

Until the door has synced once, it still accepts the built-in `DEFAULT_PIN`
(1459) and any fingerprint already on the sensor. After the first sync only
PINs and fingerprints set in the web app work.

## Deploy (VPS 103.20.240.48, same style as the other czeros apps)

| | Web app | API (also the door's `API_BASE_URL`) | Server folder |
|---|---|---|---|
| prod (`main`)    | https://utils.czeros.tech     | https://utils-api.czeros.tech/api     | `/opt/smart-door-prod` |
| dev (`develop`)  | https://utils-dev.czeros.tech | https://utils-api-dev.czeros.tech/api | `/opt/smart-door-dev`  |

- Push to `develop` deploys dev, push to `main` deploys prod
  (`.github/workflows/*-deploy.yml`: build on GitHub Actions, stream the
  image to the VPS over SSH, restart that one container).
- Repo secrets needed: `VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_SSH_KEY`.
- nginx on the VPS (`/etc/nginx/conf.d/utils-*.conf`, HTTPS by Certbot)
  sends each subdomain to its container: prod web 3008 / API 8098, dev web
  3009 / API 8099.
- Settings and secrets live only on the VPS in `.env.prod` / `.env.dev`
  (see `.env.prod.example` / `.env.dev.example`). The admin login and the
  door's `Device__ApiKey` are in there.
- New database changes apply by themselves when the backend starts.
