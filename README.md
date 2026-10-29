# Mian Tailor And Design

A responsive storefront prototype for Pakistani men's shalwar kameez, built with React, TypeScript, Vite, and React Router.

## Pages

- `/` home and featured designs
- `/shop` complete catalog with occasion filters
- `/shop/:productId` individual design details and size selection
- `/checkout` delivery details, order summary, and available payment methods
- `/payment/:orderId` order confirmation and payment instructions
- `/about` brand story, shop address, contact details, and map link
- `/fitting` appointment request form
- `/account` customer registration and sign-in, backed by the self-hosted account API

The frontend supports English and Urdu. Use the language selector to translate the storefront, account screens, shopping bag, checkout, payment instructions, support widget, and admin portal. The selected language is saved in this browser; Urdu switches the layout to right-to-left and uses the Noto Nastaliq Urdu font.

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

Open `/admin` and sign in with the manager username and password configured for the account API. Supabase is not required for manager authentication or the customer directory. The account API verifies the manager credentials and stores hashed-token sessions in SQLite; customer registrations are read from the same SQLite database used by `/account`. Password hashes are never returned by the customer-directory API.

Set `ADMIN_USERNAME` and a unique `ADMIN_PASSWORD` of at least 12 characters that is different from the username in the account API environment before starting it. `AUTH_DB_PATH` defaults to `./data/accounts.sqlite`; the database file is excluded from Git, so back it up and keep it on persistent storage. With Supabase unset, the product catalog, customer support conversations, chat read state, orders, and payment settings are stored in SQLite. The Admin migrates the existing browser catalog into SQLite on first load; subsequent product additions, edits, and visibility changes are shared with the storefront. Signed-in customers see their own account conversation across devices; guest chats use a private browser session. Fitting requests and WhatsApp settings remain browser-local.

The Admin Orders section lists submitted orders and lets managers update order status. In Admin Settings, configure the payment methods customers can choose at checkout. Bank transfer, Easypaisa, and JazzCash show the instructions and account details entered there. Card checkout only redirects to a hosted payment page when a valid HTTPS checkout URL is configured; payment processing and confirmation must be provided by that payment provider. The About us and shop contact settings let managers publish the shop address, phone, WhatsApp number, email, and map link to every visitor. In SQLite mode these details are stored in the account service database; in Supabase mode they are stored in the `business_settings` table. Apply the updated `supabase/schema.sql` to existing Supabase projects to allow public storefront reads of the shop contact setting.

### VPS account API deployment

Create a `.env` file in the project directory using `.env.example`, set `ADMIN_USERNAME` and a strong `ADMIN_PASSWORD`, and keep the SQLite database on persistent storage. The API loads this file when started from the project directory. Run it as a persistent Node process with PM2:

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

Supabase support for catalog, fitting requests, and live support is optional. Without Supabase, `/account`, the `/admin` customer list, product catalog, and customer support chat use the self-hosted SQLite API. The Admin support inbox refreshes from SQLite and records when the manager has read customer messages, so read conversations no longer show an unread indicator.

## Checks

```sh
npm run build
npm run lint
npm run test:auth
```

The starter catalog contains 100 original Pakistani menswear listings: 20 shalwar kameez, kurta-pajama, Pathani, winter-fabric, and waistcoat-set concepts, each paired with five stitch finishes (Resha, Kinari, Tilla, Shadow Panel, and Gulaab) and five selectable colors. Style references were informed by the men's eastern and ethnic-wear collections at [J.](https://www.junaidjamshed.com/collections/men), [Edenrobe](https://edenrobe.com/collections/men-ethnic-wear), [Gul Ahmed](https://www.gulahmedshop.com/collections/mens-clothes-eastern), and [Bonanza Satrangi](https://bonanzasatrangi.com/collections/men-ready-to-wear); names and descriptions here are original, and retailer photos or product copy are not used. The catalog uses 50 distinct Unsplash stock fashion photos as styling references (reused across some finish variants); they do not depict the exact design or selected color. The Admin's “Add 100 Pakistani designs” import is safe to repeat and only adds missing IDs. It hides the 50 known legacy starter listings without deleting them or changing their saved product details; custom products and manager edits remain intact, and hidden listings can be republished. Occasion filters, size selection, and the shopping bag carry each selected style and color through checkout. Cart contents are saved in the current browser and restored after a page refresh; they are not synced across browsers or devices. The server validates order details and calculates prices from the active catalog before saving orders to SQLite. Payment instructions are managed by the Admin; a real card payment requires configuring a hosted checkout with a payment provider. The home page photography and typefaces load from Unsplash and Google Fonts.

A source backup is stored in `backups/Mian-Tailor-And-Design-2026-10-22.zip`.
