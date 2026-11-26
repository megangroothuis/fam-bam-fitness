# Fam Bam Fitness Challenge

A phone-friendly web app for a family fitness challenge, built around the Party Cast pixel sprites.

- **Log in with a phone number.** Only numbers on the roster can get in.
- **Set flexible goals**, in any combination of:
  - **How often:** every day, certain days (for example Mon/Wed/Fri), N times a week, or N times a month.
  - **How it's tracked:** check it off, or log a number (miles, minutes, reps, oz…).
  - Examples: *Workout 4× a week*, *Run every day*, *Run 20 miles a week*, *10,000 steps every day*, *Yoga Mon · Wed · Fri*, *Bike 10× a month*.
- **Log each day:** check off goals (or enter amounts), add a note to each goal, and add a "how'd the day go" note. You can go back and fill in earlier days.
- **The Fam page** shows everyone's week: a stage of characters with % badges, a ranked board with per-goal progress bars, and a feed of everyone's notes. You can page back to earlier weeks.
- **Photo proof + Feed.** Tap the 📷 on any goal (or "Post a photo") to upload a photo. Attaching it to a check-off goal can also check that goal off. Everyone's photos land in the **Feed** tab, where you can like them by tapping the heart or double-tapping the photo. You can see who liked what, and a red dot on the Feed tab means there are new photos.
- **Your sprite reacts.** It does its signature move when you check something off, and anyone whose goals are all on track celebrates on the Fam page.

There is no build step. It's plain HTML, CSS and JavaScript, so it can be hosted for free on GitHub Pages. The data lives in Supabase, a free hosted Postgres database.

---

## 1. Set up the database (Supabase): about 10 minutes

1. Go to <https://supabase.com>, sign up (free), and click **New project**. Pick any name (e.g. `fam-bam`) and a database password (save it somewhere), then choose the region closest to you.
2. When the project is ready, open **SQL Editor**, then **New query**. Paste in all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. In another new query, paste in all of [`supabase/photos.sql`](supabase/photos.sql) and **Run** it. It creates the photo, like and storage-bucket setup.
4. Open [`supabase/seed.sql`](supabase/seed.sql) and replace the `555-555-01xx` placeholders with each person's real cell number. Remove anyone who isn't playing. Then paste it into a new query and **Run** it.
5. Go to **Project Settings → API** (or **Connect → App frameworks**) and copy:
   - the **Project URL** (`https://xxxx.supabase.co`)
   - the **anon / public** key (newer projects call it the **publishable** key, `sb_publishable_…`)
6. Paste both into [`config.js`](config.js):

   ```js
   SUPABASE_URL: 'https://xxxx.supabase.co',
   SUPABASE_KEY: 'sb_publishable_…',
   ```

   Both values are meant to be public. The tables are locked down: the app can only reach the database through functions that check a logged-in session.

### Managing people later
- **Add someone:** in **Table Editor → members**, insert a row with their `name`, `phone`, and `sprite` (`mark, jaimi, megan, nate, matthew, riley, julia, staci, carol`). You can also re-run `seed.sql`.
- **Change a number:** edit the `phone` cell. Any format works, because it's stored as the last 10 digits.
- Each person's character comes from the `sprite` column on their members row. People can't change it in the app.

> **Heads up on security:** logging in only needs a phone number on the list. That's fine for a family challenge, but anyone who knows a family member's number could log in as them. If you want more, ask Claude to add a PIN or real SMS codes (Supabase phone auth + Twilio).

> **Photos:** they're shrunk on the phone before upload (to about 200 KB each) and stored in a public Supabase Storage bucket under random, unguessable links. Uploading needs a short-lived ticket that only a logged-in person can get. Supabase's free plan includes 1 GB of storage, which is roughly 5,000 photos.

> **Free-tier note:** Supabase pauses free projects after about a week with no activity. Daily use keeps it awake. If it does pause, click **Restore** in the dashboard and your data will still be there.

## 2. Host it (GitHub Pages)

1. Push this folder to a GitHub repo.
2. In the repo, go to **Settings → Pages → Build and deployment**. Set **Source** to *Deploy from a branch*, choose **Branch** `main` and folder `/ (root)`, then click **Save**.
3. After about a minute the site is live at `https://<your-username>.github.io/<repo-name>/`. Text that link to the fam.
4. On a phone, open the link, then use **Share → Add to Home Screen** (iPhone) or **⋮ → Add to Home screen** (Android). It opens like an app, with the Fam Bam icon.

## Try it without a database

If `SUPABASE_URL` in `config.js` is empty, the app runs in **demo mode**. It has fake fam data saved in that browser, and you log in with 555-555-0101 through 555-555-0109.

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## How scoring works

| Goal type | Counts as | Weekly progress |
|---|---|---|
| Every day | a check, or reaching the daily amount | days hit / days in the week (since the goal started) |
| Certain days | same as above | hits / number of scheduled days; a hit on another day makes up for a missed one |
| N per week | each check, or the total amount | count or total / target (Mon–Sun) |
| N per month | each check, or the total amount | count or total / target for the month; the Fam % uses "on pace" for how far into the month you are |

A person's weekly % is the average across their goals, with each goal capped at 100%. A gold badge means every goal is on track.

## Files

```
index.html            app entry
config.js             Supabase URL + key
css/style.css         pixel styling
js/app.js             screens: login, Today, Goals, Fam
js/progress.js        goal cadence + scoring logic
js/api.js             Supabase calls (+ demo backend)
js/sprites.js         sprite animation (48×54 frames, 5 fps)
js/image.js           shrinks photos before upload
js/dates.js           date helpers (weeks run Mon–Sun)
assets/sprites/       character sheets from the Party Cast pack
supabase/schema.sql   tables, security, and API functions
supabase/photos.sql   photos, likes, storage bucket + upload policy
supabase/seed.sql     the roster (names, phones, sprites)
```
