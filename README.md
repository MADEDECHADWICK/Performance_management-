# Reward-Based Perfomance Matrix

Full-stack system for audit and tax firms covering employee lifecycle, performance evaluation, and job delivery. Built with a TypeScript/Node backend and a React dashboard UI.

## Highlights
- Employee onboarding, profiles, and role-based access control
- Client intake with engagement letters
- Job creation, staffing, costing, and budget caps
- Timesheets and time-entry approvals
- KPI tracking and evaluation cycles (manager, peer, direct report)
- Dashboards for HR, managers, partners, and employees

## Tech Stack
Backend
- Node.js + Express (TypeScript)
- PostgreSQL + Prisma
- JWT auth

Frontend
- React (Vite) + TypeScript
- Tailwind CSS + shadcn/radix UI
- TanStack Query

## Repo Structure
- `backend/` API, Prisma schema, services, and tests
- `ronalds-growth-hub/` React dashboard UI

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Backend
```bash
cd backend
npm install
```

Create `backend/.env`:


Generate Prisma client and run migrations:
```bash
npm run prisma:generate
npm run prisma:migrate
```

Start the API:
```bash
npm run dev
```

### Frontend
```bash
cd ronalds-growth-hub
npm install
npm run dev
```

The app expects the API at `http://localhost:4000`. You can override with `VITE_API_URL`.

## Scripts
Backend (in `backend/`)
- `npm run dev` Start API in dev mode
- `npm run prisma:generate` Generate Prisma client
- `npm run prisma:migrate` Apply migrations
- `npm run test` Run tests

Frontend (in `ronalds-growth-hub/`)
- `npm run dev` Start Vite dev server
- `npm run build` Build production bundle
- `npm run preview` Preview build

## Status
This project is under active development. Core backend modules and the dashboard are operational; some advanced workflows and reports are still evolving.

## License
Proprietary. All rights reserved.
