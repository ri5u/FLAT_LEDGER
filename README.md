# Flatmate Ledger (flat_ledger)

A shared-expense tracker for one flat, built using React (Vite) + Node.js (Express) + PostgreSQL (Prisma ORM) and Docker. It ingests a messy raw CSV ledger containing deliberate data anomalies, classifies them using Google Gemini API structured outputs, and allows administrators to review and resolve cards before committing transactions.

---

## 🚀 Quick Start (Docker Compose)

The entire application (PostgreSQL + built React frontend + Node.js backend) is containerized and orchestrates via Docker Compose.

### 1. Prerequisites
- Docker & Docker Compose installed.
- A Google Gemini API key (obtain from [Google AI Studio](https://aistudio.google.com/)).

### 2. Configure Environment
Create a `.env` file in the root directory (or copy `.env.example`):
```bash
# Set your Google Gemini API key
GEMINI_API_KEY="your-gemini-api-key-here"

# Database URL used by Prisma locally (optional, Docker Compose overrides this inside containers)
DATABASE_URL="postgresql://flat_ledger_user:flat_ledger_password@localhost:5400/flat_ledger?schema=public"
JWT_SECRET="super_secret_flat_ledger_token_secret"
PORT=5000
```

### 3. Run Containers
Build and start the application in the background:
```bash
docker compose up -d --build
```
This command will:
1. Spin up the PostgreSQL database (`flat_ledger_db` exposed on host port `5400`).
2. Build the multi-stage React app and bundle it with the Express API container.
3. Start the Express server on host port `5000`.

### 4. Setup Database Schema & Seed
Run Prisma migrations and database seed inside the running backend container to initialize roommate profiles (`Aisha`, `Rohan`, `Priya`, `Meera`, `Sam`, `Dev`, `Kabir`):
```bash
docker compose exec backend npm run db:setup
```

The application is now fully running and accessible at:
- **Web App UI**: [http://localhost:5000](http://localhost:5000)
- **Health check**: [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

## 🛠️ Local Development (Outside Docker)

If you wish to run the backend and frontend separately for hot-reloading:

### 1. Setup PostgreSQL Database
Make sure Docker is running, then start only the database container:
```bash
docker compose up -d db
```

### 2. Run Backend
Go to the `backend` directory, install packages, run migrations, seed, and start the development server:
```bash
cd backend
npm install
cp ../.env .env  # Ensure env is copied
npx prisma migrate dev
npm run prisma:seed
npm run dev
```
The backend server runs on `http://localhost:5000` with nodemon.

### 3. Run Frontend
Go to the `frontend` directory, install packages, and start the Vite dev server:
```bash
cd frontend
npm install
npm run dev
```
The frontend SPA runs on `http://localhost:5173`. Vite is pre-configured to proxy `/api` requests to the backend server.

---

## 🧪 Running Integration Tests

We have created an end-to-end integration test that simulates the entire spreadsheet import, reviews review required cards, previews resolves, commits splits to the database, and verifies pairwise balances.

To execute the E2E test suite:
1. Ensure the Express server is running on `localhost:5000`.
2. Run:
```bash
node backend/src/utils/importPipeline.js # compiles imports (if needed)
node --no-warnings .gemini/antigravity-cli/brain/de3092ac-c034-4bad-81ee-052ab87c32ab/scratch/testEndToEndImport.js
```

---

## 📁 Repository Deliverables
- [SCOPE.md](file:///home/r15u/webDev/flat_ledger/SCOPE.md) — The complete 19 Anomaly Catalog and PostgreSQL Prisma schema layout.
- [DECISIONS.md](file:///home/r15u/webDev/flat_ledger/DECISIONS.md) — Product and engineering decision log.
- [AI_USAGE.md](file:///home/r15u/webDev/flat_ledger/AI_USAGE.md) — Collaborator logs, key prompts, and debugging case notes.
