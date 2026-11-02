# HNU StallHub

HNU StallHub is a campus food ordering application for Holy Name University. Students can browse campus stalls and their available menus, place orders, and review their order history. Sellers manage their stall, products, stock, and orders, while administrators monitor activity and manage stall visibility.

## How the code works

The project has two main parts:

- **Frontend (`frontend/`)** — A Next.js application that renders the customer, seller, and administrator pages. It collects user actions and sends requests to the API.
- **Backend (`backend/`)** — An Express API that validates requests, checks user roles, applies application rules, and reads or updates the database.
- **Database** — Supabase hosts the project's PostgreSQL database. The API connects to it with the `pg` package; the browser never connects directly to the database.

When someone signs in, the API verifies their credentials and creates a secure, HTTP-only session cookie. The frontend uses that session when it requests data. The API checks the user's role before allowing access to customer, seller, or administrator features.

For checkout, the API validates the selected products, quantities, availability, and stall. It then uses database transactions and the project's checkout procedure to save the order and update inventory together.

## Main code areas

### Frontend

- `frontend/app/page.js` — Customer homepage and stall directory.
- `frontend/app/login/page.js` — Sign-in and account registration.
- `frontend/app/stall/[stallId]/page.js` — Stall menu and ordering interface.
- `frontend/app/orders/page.js` — Customer order history.
- `frontend/app/seller/dashboard/page.js` — Seller tools for products, inventory, and orders.
- `frontend/app/admin/dashboard/page.js` — Administrator overview and stall management, including removing and restoring stalls.
- `frontend/lib/api.js` — Shared API requests and session-related helpers.
- `frontend/lib/use-require-role.js` — Checks the signed-in user and protects role-specific pages.

### Backend

- `backend/server.js` — Starts the API, mounts the route modules, and provides a database health check.
- `backend/config/db.js` — Configures the PostgreSQL connection pool.
- `backend/middleware/auth.js` — Handles password verification, session cookies, authentication, and role checks.
- `backend/routes/auth.js` — Registration, sign-in, and session endpoints.
- `backend/routes/stalls.js` and `backend/routes/products.js` — Public stall and menu data.
- `backend/routes/customer.js` — Customer ordering and order history.
- `backend/routes/vendor.js` — Seller dashboard, product, inventory, and order operations.
- `backend/routes/admin.js` — Administrator dashboard and stall management.
- `backend/schema.sql` and `backend/migrations/` — Database schema and incremental database changes.

## Technology

- Next.js and React for the web interface
- Node.js and Express for the API
- PostgreSQL hosted by Supabase for persistent application data
- Render for hosting the frontend and API

## Run locally

See [SETUP.md](./SETUP.md) for database configuration, environment variables, and setup instructions. During development, run the API from `backend` and the frontend from `frontend`; the frontend normally runs at `http://localhost:3000` and the API at `http://localhost:5000`.

## Team

- DBA: Franco Cagoco
- Programmer: Matthew James Dumagan
- Frontend: Lorraine Grace Genralao, Joel Bajan, Matthew James Dumagan
