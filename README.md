# Mian Tailor And Design

A responsive storefront prototype for Pakistani men's shalwar kameez, built with React, TypeScript, Vite, and React Router.

## Pages

- `/` home and featured designs
- `/shop` complete catalog with occasion filters
- `/shop/:productId` individual design details and size selection
- `/craft` stitching and design approach
- `/fitting` appointment request form
- `/account` customer registration and sign-in, backed by the self-hosted account API

## Run locally

```sh
npm install
npm run auth:start
```

In another terminal:

```sh
npm run dev
```

The Vite development server forwards `/api` requests to the account API on `127.0.0.1:3001`.
Node.js 22.5 or newer is required for the built-in SQLite account store.

## Admin panel

Open `/admin` and sign in with the manager email and password configured for the account API. Supabase is not required for manager authentication or the customer directory. The account API verifies the manager credentials and stores hashed-token sessions in SQLite; customer registrations are read from the same SQLite database used by `/account`. Password hashes are never returned by the customer-directory API.

Set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters in the account API environment before starting it. `AUTH_DB_PATH` defaults to `./data/accounts.sqlite`; the database file is excluded from Git, so back it up and keep it on persistent storage. Catalog edits, fitting requests, and demo support data remain browser-local when Supabase is not configured.

### VPS account API deployment

Create a `.env` file in the project directory using `.env.example`, set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD`, and keep the SQLite database on persistent storage. The API loads this file when started from the project directory. Run it as a persistent Node process with PM2:

```sh
npm ci
npm run build
NODE_ENV=production pm2 start npm --name mian-tailor-auth -- run auth:start
pm2 save
```

The API listens on `127.0.0.1:3001` by default. Nginx must proxy `/api/` to this port before the SPA fallback, otherwise account requests receive the storefront HTML instead of API JSON. In the `mianatailor.com` server block, configure:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

After changing Nginx configuration, run `sudo nginx -t` and then `sudo systemctl reload nginx`. Set `NODE_ENV=production` for the API process so session cookies are marked `Secure`; serve the site over HTTPS. Set `AUTH_DB_PATH` to a persistent, backed-up location if the application directory is replaced during deployment.

For subsequent code updates, run `git pull --ff-only origin main`, `npm ci`, and `npm run build`, then restart the API with `pm2 restart mian-tailor-auth --update-env`. The self-hosted account flow does not send email confirmations or password-reset emails; those require an email delivery service.

Supabase support for catalog, fitting requests, and live support is optional. The standalone `/account` registration/login flow and `/admin` customer list use the self-hosted SQLite API.

## Checks

```sh
npm run build
npm run lint
npm run test:auth
```

The catalog contains 50 designs: ten shalwar kameez silhouettes crossed with five stitch treatments (Resha, Kinari, Badla, Shadow Panel, and Gulaab), each with five selectable colors. Each catalog design has a distinct Unsplash stock fashion photo; these are styling references and do not depict the exact design or selected color. Occasion filters, size selection, and the client-side shopping bag carry each selected style and color through to the cart. The home page photography and typefaces load from Unsplash and Google Fonts. Cart contents are in memory only, and checkout/payment processing are not connected.

A source backup is stored in `backups/Mian-Tailor-And-Design-2026-10-22.zip`.
