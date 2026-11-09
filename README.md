# FinSight AI: Personalized Expense Forecasting & Financial Intelligence

FinSight AI is a full-stack personal finance management, predictive expense forecasting, and AI-driven conversational intelligence system developed using React 19, TypeScript, Node.js/Express, Neon PostgreSQL, Scikit-learn, and Google Gemini.

---

## Prerequisites

Before setting up the project, ensure you have the following installed on your machine:
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **Python**: v3.10 or higher
- **PostgreSQL Database**: A free serverless database from [Neon](https://neon.tech) (or local PostgreSQL 15+)
- **Google AI Studio API Key**: For Gemini natural language reasoning ([Get API Key](https://aistudio.google.com/app/apikey))

---

## Step-by-Step Setup Guide

### 1. Clone the Repository
```bash
git clone <repository-url>
cd finsight-ai
```

### 2. Install Node.js Dependencies
Install all required frontend and backend packages:
```bash
npm install
```

Key packages installed include:
- **Frontend & Visualization**: `react` (v19), `react-dom`, `react-router-dom`, `recharts`, `lucide-react`, `motion`, `@tailwindcss/vite`, `tailwindcss`
- **Backend Server & Security**: `express`, `cookie-parser`, `jsonwebtoken`, `bcryptjs`, `express-rate-limit`, `dotenv`
- **Database**: `pg` (node-postgres connection pool)
- **Document & OCR Processing**: `multer`, `tesseract.js`, `pdf-parse`
- **Generative AI**: `@google/genai` (Official Google GenAI SDK for Gemini 3.5 Flash Lite)
- **Tooling & Bundling**: `vite`, `esbuild`, `tsx`, `typescript`

### 3. Install Python Machine Learning Dependencies
Set up the Python virtual environment and install the ML forecasting libraries:
```bash
# Create and activate Python virtual environment
python -m venv venv

# Windows:
.\venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install required packages
pip install -r ml_service/requirements.txt
```

### 4. Configure Environment Variables
Copy the example environment file and configure your credentials:
```bash
cp .env.example .env
```

Open `.env` and configure the following parameters:
```env
# Application Port and Node Environment
PORT=3000
NODE_ENV=development

# Neon Serverless PostgreSQL Database Connection URI
DATABASE_URL="postgresql://user:password@ep-your-endpoint-pooler.neon.tech/neondb?sslmode=require"

# Cryptographic Secret for JWT Session Signing (min 32 characters)
JWT_SECRET="generate_a_secure_random_32_plus_character_string_here"

# Google Gemini API Key for Natural Language Chatbot Reasoning
GEMINI_API_KEY="AIzaSy_YOUR_ACTUAL_GEMINI_API_KEY"
GEMINI_MODEL="gemini-3.5-flash-lite"

# Allowed CORS Origins (for local development or Vercel deployment)
FRONTEND_URL="http://localhost:3000"
COOKIE_SAME_SITE="none"
```

### 5. Run Database Migrations
Initialize the PostgreSQL database schema and required tables:
```bash
npm run db:migrate
```
This runs all idempotent migration scripts located in `server/migrations/` and creates the `schema_migrations` tracking table.

### 6. Start the Development Servers

#### Option A: Integrated Development Server (Frontend + Backend)
Starts the Express API server and Vite HMR dev server together on port 3000:
```bash
npm run dev
```
Open your browser and navigate to: **`http://localhost:3000`**

#### Option B: Auxiliary Python ML Forecasting Microservice (Optional)
In a separate terminal, launch the standalone Python forecasting service:
```bash
python -m uvicorn ml_service.main:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation will be available at: **`http://127.0.0.1:8000/docs`**

---

## Production Build & Deployment

### TypeScript Type-Checking
```bash
npm run lint
```

### Compile Production Bundles
```bash
npm run build
```
This compiles the Vite React client into `dist/` and bundles the Node.js server into `dist/server.js` using `esbuild`.

### Run Production Server
```bash
npm start
```

For full deployment guides to **Vercel** (frontend) and **Render** (backend), refer to [`DEPLOYMENT.md`](DEPLOYMENT.md).
