# Send bookings to the owner's Google Calendar

This makes every booking land on the owner's calendar **by itself** — no
server, no monthly cost, nothing to maintain. It works because the script
runs inside the owner's own Google account, so the event is created as
them, whoever did the booking.

Do this once. It takes about two minutes.

## 1. Create the script

1. Sign in to Google **as the account whose calendar should receive the
   bookings** (for Queen K that is `queenkbeautyetc@gmail.com`, not a
   personal account).
2. Go to **https://script.google.com** and click **New project**.
3. Delete whatever is in the editor and paste in the whole of `Code.gs`
   from this folder.
4. Near the top, replace `CHANGE-THIS-TO-SOMETHING-RANDOM` with a long
   random string of your own. Keep it handy — it goes in the website too.
5. Click the **save** icon.

## 2. Publish it

1. **Deploy** → **New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** *Me* — this is what puts events on your calendar
   - **Who has access:** *Anyone*
4. Click **Deploy**, then **Authorize access** and allow the calendar
   permission it asks for. Google shows a warning because the script is
   your own and unreviewed — choose **Advanced** → **Go to (project name)**.
5. Copy the **Web app URL**. It looks like
   `https://script.google.com/macros/s/AKfy.../exec`.

## 3. Point the website at it

Open `../data.js` and fill in the two values:

```js
calendarWebhookUrl: "https://script.google.com/macros/s/AKfy.../exec",
calendarSecret:     "the same random string you put in Code.gs",
```

Then rebuild: `node build.mjs`

That is it. Every completed booking now appears on the calendar with the
service, the time, the client's name and phone, and what they paid.

## Checking it works

- Paste the web app URL into a browser. It should answer
  `{"ok":true,"note":"Queen K booking endpoint is live."}`.
- Make a booking on the site, then look at the calendar.
- If nothing appears, open the Apps Script project → **Executions** in the
  left sidebar. Every attempt is listed there with its error.

## One honest limitation

Google redirects the response, which browsers will not let a web page
read. So the site sends the booking and shows its confirmation without
waiting to hear back — if the script were to fail, the client would still
see a normal confirmation. The **Executions** list above is where you
check, and the Add to Google Calendar button on the confirmation is the
backup.

## The alternative, if you would rather not set this up

Acuity already syncs to Google Calendar on its own: **Acuity → Integrations
→ Google Calendar → connect**. That covers every booking made through her
scheduler and needs none of the above. This script is for bookings taken by
the website's own payment screen.
