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

## Admin panel

Open `/admin` to manage product listings, fitting requests, live customer chats, and the WhatsApp contact number. Admin is not linked in the public storefront; the route requires a Supabase admin login in production. Without Supabase, the panel is available only during local development as a browser demo and is disabled in production builds. Admin's existing customer directory remains Supabase-backed; customer sign-in and registration at `/account` use the self-hosted API and SQLite database.

Supabase is still used for the optional production admin panel, catalog management, fitting requests, and live chat. It is not required for customer account registration or sign-in. The account API stores password hashes and expiring sessions in `data/accounts.sqlite`; the database file is excluded from Git. Back up this file regularly.

### VPS account API deployment

Run the API as a persistent Node process from the project directory. For example, with PM2:

```sh
npm ci
npm run build
NODE_ENV=production pm2 start npm --name mian-tailor-auth -- run auth:start
pm2 save
```

The API listens on `127.0.0.1:3001` by default. For subsequent code updates, run `npm ci`, `npm run build`, then `pm2 restart mian-tailor-auth --update-env`. Configure the existing Nginx site to proxy `/api/` to it, before the SPA fallback:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

After changing Nginx configuration, run `sudo nginx -t` and then `sudo systemctl reload nginx`. Set `NODE_ENV=production` for the API process so session cookies are marked `Secure`; serve the site over HTTPS. Set `AUTH_DB_PATH` to a persistent, backed-up location if the application directory is replaced during deployment.

The self-hosted account flow does not send email confirmations or password-reset emails; those require an email delivery service.

With Supabase configured, customers can register and sign in at `/account`. Supabase Auth stores customer credentials; a database trigger permanently syncs registered customer names, emails, and signup dates to `customer_profiles` for Admin > Customers. Admin accounts and anonymous support-chat sessions are excluded from the customer directory. Customers can read only their own profile, and only admins can list customer profiles. The storefront reads active products, saves fitting requests, and supports persistent real-time customer conversations. Supabase Realtime is enabled for catalog, appointments, support messages, WhatsApp settings, and customer profiles. Row-level security restricts management to admins and limits customers to their own anonymous support conversations.

When updating an existing Supabase project, re-run the latest `supabase/schema.sql` in the SQL editor to install the customer-profile table, trigger, backfill, policies, and Realtime publication. Customer profile emails are exposed to authenticated admins only—never use a service-role key in the browser.

## Checks

```sh
npm run build
npm run lint
npm run test:auth
```

The catalog contains 50 designs: ten shalwar kameez silhouettes crossed with five stitch treatments (Resha, Kinari, Badla, Shadow Panel, and Gulaab), each with five selectable colors. Each catalog design has a distinct Unsplash stock fashion photo; these are styling references and do not depict the exact design or selected color. Occasion filters, size selection, and the client-side shopping bag carry each selected style and color through to the cart. The home page photography and typefaces load from Unsplash and Google Fonts. Cart contents are in memory only, and checkout/payment processing are not connected.

A source backup is stored in `backups/Mian-Tailor-And-Design-2026-10-22.zip`.
