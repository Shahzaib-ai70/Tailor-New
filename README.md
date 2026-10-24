# Mian Tailor And Design

A responsive storefront prototype for Pakistani men's shalwar kameez, built with React, TypeScript, Vite, and React Router.

## Pages

- `/` home and featured designs
- `/shop` complete catalog with occasion filters
- `/shop/:productId` individual design details and size selection
- `/craft` stitching and design approach
- `/fitting` appointment request form

## Run locally

```sh
npm install
npm run dev
```

## Admin panel

Open `/admin` to manage product listings, fitting requests, live customer chats, and the WhatsApp contact number. Without Supabase, the panel works in browser demo mode: edits, fitting requests, WhatsApp settings, and chats persist in this browser and synchronize between tabs on this device. Browser mode is not a shared production database or an access-controlled admin account.

1. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL editor.
3. Create an admin user in Supabase Auth and assign `app_metadata.role` to `admin` using a trusted server-side method. Never put a service-role key in the Vite environment.
4. Enable anonymous sign-ins in Supabase Auth settings for customer live chat.
5. Restart the dev server. In Admin > Settings, add the WhatsApp business number with country code and digits only.

With Supabase configured, the storefront reads active products, saves fitting requests, and supports persistent real-time customer conversations. Supabase Realtime is enabled for catalog, appointments, support messages, and WhatsApp settings. Row-level security restricts management to admins and limits customers to their own anonymous support conversations.

## Checks

```sh
npm run build
npm run lint
```

The catalog contains 50 designs: ten shalwar kameez silhouettes crossed with five stitch treatments (Resha, Kinari, Badla, Shadow Panel, and Gulaab), each with five selectable colors. Each catalog design has a distinct Unsplash stock fashion photo; these are styling references and do not depict the exact design or selected color. Occasion filters, size selection, and the client-side shopping bag carry each selected style and color through to the cart. The home page photography and typefaces load from Unsplash and Google Fonts. Cart contents are in memory only, and checkout/payment processing are not connected.

A source backup is stored in `backups/Mian-Tailor-And-Design-2026-10-22.zip`.
