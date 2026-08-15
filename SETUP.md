# Gallery + Print Ordering System — Setup Guide

## What this adds to your site
- `/admin.html` — private dashboard for you to create a new client gallery and upload their photos
- `/gallery.html?g=xxxxx` — the private link each client receives, where they view photos and buy digital downloads or prints
- `/api/*` — the backend logic (serverless functions, run automatically by Vercel)

## 1. Add these files to your repo
Copy everything in this folder into your site's repo root, same way you've been updating the site:
- `admin.html`, `gallery.html` go alongside your existing `index.html`
- `api/` and `lib/` folders go in the repo root too
- `package.json` and `schema.sql` also go in the repo root

Commit and push as usual — Vercel will detect the new `/api` functions automatically on the next deploy.

## 2. Create the required accounts

**Stripe** (payments)
1. Sign up at stripe.com
2. Dashboard -> Developers -> API keys -> copy your **Secret key**
3. Dashboard -> Developers -> Webhooks -> Add endpoint
   - URL: `https://www.matt-crawford.com/api/stripe-webhook`
   - Event to send: `checkout.session.completed`
   - Copy the **Signing secret** shown after creating it

**Resend** (email)
1. Sign up at resend.com
2. Add and verify your domain (matt-crawford.com) under Domains — this lets you send from @matt-crawford.com addresses
3. API Keys -> create one -> copy it

**Vercel Postgres + Blob** (database + photo storage)
1. In your Vercel project -> Storage tab -> Create Database -> Postgres -> follow prompts
2. Storage tab -> Create Store -> Blob -> follow prompts
3. Vercel automatically adds the connection environment variables for both to your project

## 3. Set environment variables
In your Vercel project -> Settings -> Environment Variables, add:

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | from Stripe step above |
| `STRIPE_WEBHOOK_SECRET` | from Stripe webhook step above |
| `RESEND_API_KEY` | from Resend step above |
| `ADMIN_PASSWORD` | any password you choose — this protects /admin.html |

(The Postgres and Blob variables are added automatically by Vercel in step 2 — you don't need to set those manually.)

## 4. Run the database schema
In Vercel -> Storage -> your Postgres database -> Query tab, paste the contents of `schema.sql` and run it once. This creates the tables the system needs.

## 5. Redeploy
Push a small change (or use Vercel's "Redeploy" button) so the new environment variables take effect.

## 6. Test it
1. Go to `https://www.matt-crawford.com/admin.html`
2. Enter your admin password
3. Create a test gallery with your own name/email
4. Upload a couple of test photos
5. Copy the private link it gives you, open it in a new tab
6. Try a test purchase using Stripe's test card: `4242 4242 4242 4242`, any future expiry, any CVC
7. Confirm you get the right email (digital) or that you (contact@matt-crawford.com) get the print-order notification

## How ongoing use works
- **New client**: go to admin.html, create their gallery, upload their photos, copy the link, email it to them yourself (or however you prefer)
- **Digital order**: fully automatic — client pays, gets an email with download links, done
- **Print order**: client pays, you get an email with the shipping address and product details — place that order with whichever print lab you're using, ship it yourself
- **Later**: once you have a professional print lab account, the only file that needs to change is `api/stripe-webhook.js` — swap the manual notification email for an automatic API call to the lab. Everything else in the system stays the same.

## Video support
The system now handles both photos and videos through the same gallery and checkout flow, with a few differences worth knowing:

- **Uploads happen directly from your browser to storage** (not through the server) specifically so large video files don't hit Vercel's serverless request-size limit. This is automatic — you won't notice a difference in admin.html, just longer upload times for big files.
- **Poster frames are generated automatically** — when you upload a video, a preview thumbnail is pulled from partway into the clip, same as a photo thumbnail.
- **Videos can only be sold as digital downloads, never prints** — the print option is automatically disabled for any video you select.
- **Recommended video export settings before uploading**: 1080p, H.264, reasonable bitrate (5-10 Mbps for a couple minutes of footage keeps files in the tens-of-MB to low-hundreds-of-MB range). You *can* upload much larger master files — there's a 5GB per-file ceiling set in the code — but bigger files mean slower uploads for you and slower downloads for clients. Deliver client-ready exports, not raw camera originals.
- **Storage cost reminder**: video is the main reason to migrate from Vercel Blob to Cloudflare R2 sooner rather than later once you're sending real client videos regularly — R2's egress is free, Vercel Blob's isn't. Ask me when you're ready and I'll walk through that migration; it's a small, contained change to two files, not a rebuild.

## Stripe Tax setup
Tax calculation is now built into checkout automatically, but Stripe needs two things from you first:
1. **Dashboard → Tax → Settings** → add your business's "origin address" (where you're based/registered) — this is what Stripe uses to determine tax obligations
2. **Register for tax collection** in whichever states/countries you're required to collect in (Stripe's Tax settings walk you through this — for a small US-based business, this is often just your home state to start, expanding as Stripe flags "economic nexus" thresholds you cross)

Once that's set, every checkout automatically calculates and adds the correct tax — no code changes needed if your tax obligations change later, just update it in the Stripe Dashboard.

## Automatic Invoicing
Every order — digital or print — now automatically generates a real Stripe invoice at the moment of payment (via `invoice_creation` on the checkout session). No separate invoicing workflow needed:
- The invoice/receipt link is included in the confirmation email (both the client's digital-download email and your print-order notification email)
- Every invoice is also viewable anytime in your Stripe Dashboard → Invoices
- The `orders` table now stores each order's `stripe_invoice_id` and `invoice_url` for your own records

If you later want *standalone* invoicing (billing a client directly for a custom shoot, outside the gallery/checkout flow entirely), that's a separate feature — let me know if you want that built too.

## Automated Print Fulfillment (Prodigi)
Print orders are now sent to Prodigi automatically the moment payment clears — no manual step, no placing orders yourself. Here's how to get it live:

### 1. Create a Prodigi account
- Sign up at prodigi.com — no application/approval process, works immediately
- In your dashboard, find **API Keys** (there are separate keys for **Sandbox** and **Production** — start with Sandbox)

### 2. Confirm your product SKUs
The code currently uses placeholder SKUs (`GLOBAL-FAP-8x10`, `GLOBAL-FAP-11x14`, `GLOBAL-FAP-16x20`) in `api/stripe-webhook.js` under `PRODIGI_SKU_MAP`. Before going live:
- Browse Prodigi's product catalog in your dashboard for the paper/finish you actually want to sell
- Update the three SKU values in `PRODIGI_SKU_MAP` to match exactly

### 3. Set environment variables in Vercel
| Variable | Value |
|---|---|
| `PRODIGI_API_KEY` | your Sandbox key, to start |
| `PRODIGI_API_URL` | `https://api.sandbox.prodigi.com/v4.0` (Sandbox) — leave unset to default to this |

### 4. Test with a real (sandbox) order first
Run a full $1 test purchase that includes a print. Check:
- You get an email confirming it was sent to Prodigi (green success message), or a clear "ACTION NEEDED" email if something went wrong
- Log into Prodigi's Sandbox dashboard and confirm the order actually appears there with the correct image, size, and shipping address

### 5. Go live
Once a sandbox order looks right end-to-end:
- Get your **Production** API key from Prodigi
- Update `PRODIGI_API_KEY` in Vercel to the production key
- Update `PRODIGI_API_URL` to `https://api.prodigi.com/v4.0`
- Redeploy

### If a Prodigi order ever fails
You'll still get an email — just with an "ACTION NEEDED" subject line and the actual error message instead of a success confirmation, so nothing gets fulfilled silently or lost. You'd place that specific order manually, same as before this automation existed.

### A quality note, carried over from our earlier conversation
Prodigi is a self-serve, no-approval-needed service — it's what makes true day-one automation possible, but it's a notch below what a dedicated professional photo lab (WHCC, Bay Photo, Miller's) produces. If you later get approved with one of those, swapping fulfillment providers only means changing the `createProdigiOrder` function in `stripe-webhook.js` — everything else in the system stays the same.

## Pricing
Current prices are set in `api/create-checkout.js` (the `PRICES` object). Edit the dollar amounts there any time — no other changes needed.
