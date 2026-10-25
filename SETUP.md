# HNU StallHub backend and account setup

## What is in this project

The existing project is a Next.js frontend and an Express/PostgreSQL API (using `pg`), not NestJS or TypeORM. The authentication, role checks, stall/menu routes, seller APIs, and customer order APIs in `backend` use that existing stack and can connect to Supabase PostgreSQL through its connection string.

The browser does not connect directly to Supabase and does not contain database credentials. The Express API verifies the account, sets an HTTP-only session cookie, and performs database access. `backend/schema.sql` is the database schema to run in Supabase; the Node.js backend is a separate service and is not pasted into the Supabase SQL editor.

## Supabase setup

1. In Supabase, open **SQL Editor**, review the existing schema, and run [`backend/schema.sql`](./backend/schema.sql). This schema is intended for a new StallHub database. If you already have `users`, `stores`, `products`, `inventory`, `orders`, or `order_items` tables, compare their columns and constraints before running it; `CREATE TABLE IF NOT EXISTS` does not migrate an existing, incompatible table.
2. The project already has a private `backend/.env`; **do not overwrite it**. Add or update `DATABASE_URL` using your Supabase PostgreSQL connection string (use the Supabase pooler if your backend host requires pooled connections), and add `SESSION_SECRET` with a private random string of at least 32 characters. Keep `.env` private.
3. For local development, the frontend uses `http://localhost:5000/api` by default. Set `NEXT_PUBLIC_API_URL` only if your API is hosted at another address.
4. Start the API from `backend` with `npm install` (first time) and `npm run dev`. Start the frontend from `frontend` with `npm install` (first time) and `npm run dev`.
5. Create a customer or seller account from the login page. Enter the assigned 8-digit School ID; the backend validates the role-specific ID format. Seller registration also asks for stall name and location, then creates the seller and stall together in a database transaction.

## Implemented workflow

- Login checks the stored password hash and selected role, then sets a signed, HTTP-only cookie. Customer and seller registration are database-backed; seller accounts are created with their own stall in one transaction.
- Customer pages show active stalls and products queried from PostgreSQL. Checkout accepts only product IDs and quantities; it derives customer identity, stall, prices, and totals from the authenticated account/database.
- Checkout locks product and inventory rows in one transaction, checks stock, saves the order and item snapshots, and decrements stock atomically. A stale/insufficient cart is rejected instead of overselling.
- Seller dashboard queries only the stall assigned to the authenticated seller. Product edits, inventory changes, and order status transitions check ownership on the backend. Customer history is filtered by the authenticated customer.
- Status transitions are `Pending → Confirmed → Preparing → Ready for Pickup → Completed`. Product removal is a soft removal so completed order details remain available.

## Before deployment

- The repository includes [`render.yaml`](./render.yaml) for deploying the Next.js frontend and Express API as separate Render web services. In Render, create a Blueprint from the GitHub repository and select the `master` branch (or whichever branch contains this file).
- Enter `DATABASE_URL` and `SESSION_SECRET` as private environment values for the `hnu-stallhub-api` service. Do not put database credentials or session secrets in GitHub or frontend environment variables.
- The frontend uses a same-origin `/api` path. Next.js proxies those requests to the backend using `BACKEND_URL`, and Render wires that variable to the API service. This keeps the browser session cookie same-site while the backend remains a separate service; the backend CORS setting is not needed for this proxy path.
- Locally, `BACKEND_URL` defaults to `http://localhost:5000`; run the backend and frontend in separate terminals. Local database access still needs `DATABASE_URL` and `SESSION_SECRET` in `backend/.env`.
- Use the Supabase PostgreSQL connection URI (Session Pooler if required by your network) for the API service. The database connection is used by the backend only.
- Existing tables and data cannot be verified from this workspace because no database schema export or usable database credentials were provided.
