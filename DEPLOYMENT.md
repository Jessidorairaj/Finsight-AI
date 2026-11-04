# FinSight AI — Production Deployment Guide
## Vercel Frontend & Render Backend Architecture

This guide provides end-to-end instructions for deploying **FinSight AI** into production using a decoupled architecture:
- **Frontend**: React 19 + Vite SPA deployed on **Vercel** with edge CDN and client-side routing.
- **Backend**: Express + Node.js REST API deployed on **Render** (Web Service).
- **Database**: Serverless PostgreSQL hosted on **Neon**.
- **AI Intelligence**: Server-side Google Gemini 3.5 Flash Lite with deterministic fallback.

---

## Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │             Vercel Frontend             │
                      │    (React 19 + Vite Single Page App)    │
                      │   https://your-finsight.vercel.app      │
                      └────────────────────┬────────────────────┘
                                           │
                        HTTPS API Requests │ with Credentials
                        (Cookies + Bearer) │ & CORS Allow-Origin
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │              Render Backend             │
                      │      (Express + Node.js Server)         │
                      │   https://your-finsight.onrender.com    │
                      └────────────┬───────────────┬────────────┘
                                   │               │
                 Database Pooling  │               │ Gemini API
                 TLS Encrypted     ▼               ▼
                      ┌─────────────────┐   ┌───────────────────┐
                      │ Neon PostgreSQL │   │  Google Gemini    │
                      │    Database     │   │   AI Studio API   │
                      └─────────────────┘   └───────────────────┘
```

---

## 1. Render Backend Deployment (API Web Service)

### Step 1.1: Create a New Web Service on Render
1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** → **Web Service**.
3. Connect your Git repository (`finsight-ai`).
4. Configure the service settings:
   - **Name**: `finsight-api` (or your preferred service name)
   - **Region**: Choose the region closest to your Neon database (e.g., `Singapore / Oregon / Frankfurt`)
   - **Branch**: `main`
   - **Root Directory**: `.` (leave empty or dot)
   - **Runtime**: `Node`
   - **Build Command**:
     ```bash
     npm install && npm run build:server && npm run db:migrate
     ```
   - **Start Command**:
     ```bash
     npm start
     ```
   - **Plan**: Free or Starter

### Step 1.2: Configure Health Check Path
Under **Advanced Settings**:
- **Health Check Path**: `/api/health`
- Render will ping this endpoint to verify that the container is healthy before routing live traffic.

### Step 1.3: Set Environment Variables on Render
Add the following environment variables in the Render Dashboard (**Environment** tab):

| Variable | Recommended Production Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production security headers, strict error masking, and rate limits |
| `PORT` | *(Provided by Render automatically)* | Port assigned by Render runtime (default: 10000) |
| `FRONTEND_URL` | `https://your-finsight.vercel.app` | Exact URL of your deployed Vercel frontend for CORS |
| `CORS_ORIGIN` | `https://your-finsight.vercel.app` | Secondary CORS origins or preview URLs (optional) |
| `COOKIE_SAME_SITE` | `none` | Required for cross-site cookie transmission from Vercel to Render |
| `DATABASE_URL` | `postgresql://user:pass@ep-pooler.neon.tech/neondb?sslmode=require` | Pooled Neon PostgreSQL connection string |
| `JWT_SECRET` | *32+ character random string* | Used for cryptographic session JWT signing (`openssl rand -base64 32`) |
| `GEMINI_API_KEY` | `AIzaSy...` | Google AI Studio API key for chatbot reasoning and document OCR |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Gemini model version for natural-language analysis |
| `DISABLE_HMR` | `true` | Disables file watchers in production environment |

> [!IMPORTANT]
> Keep `DATABASE_URL`, `JWT_SECRET`, and `GEMINI_API_KEY` strictly inside the Render dashboard. Never commit these secrets or prefix them with `VITE_`.

---

## 2. Vercel Frontend Deployment (Vite SPA)

### Step 2.1: Import Project to Vercel
1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New...** → **Project**.
3. Import your Git repository (`finsight-ai`).
4. Configure project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./`
   - **Build Command**: `npm run build:client` (or `vite build`)
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

### Step 2.2: Set Environment Variables on Vercel
Add the following variable in the Vercel Project Settings (**Environment Variables**):

| Variable | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://your-finsight.onrender.com` | Public URL of your deployed Render backend (no trailing slash) |

> [!NOTE]
> When `VITE_API_URL` is set, the frontend API client automatically routes all API calls to your Render backend. In local development without this variable, it defaults to the local server.

### Step 2.3: Single Page App (SPA) Routing & Caching
The included [`vercel.json`](file:///vercel.json) automatically handles client-side routing rewrites and cache policies:
- All non-asset routes rewrite to `/index.html`, allowing direct navigation and browser reloads on routes like `/transactions`, `/budgets`, and `/analytics`.
- Static assets in `/assets/` are cached with immutable cache headers for fast loading.

---

## 3. Cross-Origin Security & Dual-Layer Authentication

### 3.1 CORS Security
The backend explicitly validates incoming request origins against `FRONTEND_URL` and `CORS_ORIGIN`:
- Responses include `Access-Control-Allow-Origin: <origin>` and `Access-Control-Allow-Credentials: true`.
- Wildcards (`*`) are disallowed when credentials are included.
- Preflight `OPTIONS` requests are handled immediately with HTTP 204.

### 3.2 Dual-Layer Authentication Architecture
Browsers with aggressive privacy protections (e.g. Safari Intelligent Tracking Prevention, Chrome third-party cookie restrictions, Brave Shields) can block cross-origin cookies between `vercel.app` and `onrender.com`.

FinSight AI protects against this using **Dual-Layer Authentication**:
1. **HTTP-only Cookie**: When logging in, the backend sends the `finsight_session` cookie configured with `SameSite: 'none'`, `Secure: true`, and `HttpOnly: true`.
2. **Bearer Token Fallback**: The login response also provides the JWT token to the frontend client, which securely attaches it via `Authorization: Bearer <token>` in all requests.
3. **Verification**: The backend's `requireAuth` middleware checks the cookie first; if unavailable, it seamlessly validates the Bearer token. This guarantees authentication never drops across different devices or browsers.

---

## 4. Post-Deployment Verification Checklist

Run these quick checks after deploying to confirm your system is fully operational:

### 4.1 Backend Health Check
```bash
curl -i https://your-finsight.onrender.com/api/health
```
**Expected Response:** HTTP 200 with `{ "status": "ok", "service": "FinSight AI API" }`.

### 4.2 Database Connectivity Check
```bash
curl -i https://your-finsight.onrender.com/api/db/health
```
**Expected Response:** HTTP 200 with `{ "status": "connected", "connected": true, "database": "neondb" }`.

### 4.3 CORS Preflight Check
```bash
curl -i -X OPTIONS https://your-finsight.onrender.com/api/auth/login \
  -H "Origin: https://your-finsight.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"
```
**Expected Response:** HTTP 204 with `Access-Control-Allow-Origin: https://your-finsight.vercel.app` and `Access-Control-Allow-Credentials: true`.

### 4.4 End-to-End Application Test
1. Open `https://your-finsight.vercel.app` in your browser.
2. Log in with your credentials or register a new user account.
3. Verify that your transactions, budgets, goals, and recurring items load accurately.
4. Navigate to the **FinSight Assistant** chatbot tab and ask:
   *"How much did I spend on dining this month?"*
5. Confirm that the chatbot answers with grounded ledger totals from your database.

---

## 5. Local Development (Single-Port Integrated Mode)

In local development, the integrated server runs both Vite and Express together on `http://localhost:3000`:
```bash
# Start integrated local development server
npm run dev

# Run database schema migrations
npm run db:migrate

# Run type check and build verification
npm run lint
npm run build
```
In this mode, `VITE_API_URL` is omitted, so requests automatically target same-origin relative paths `/api/...`.
