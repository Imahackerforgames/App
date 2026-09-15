/**
 * Queen K Beauty Etc — send every booking straight to the owner's Google Calendar.
 *
 * This runs inside the owner's own Google account as a Google Apps Script web
 * app. It is free, there is no server to rent and nothing to maintain. The
 * website posts a booking here and this creates the calendar event.
 *
 * Because the script runs AS the owner, the event lands on the owner's
 * calendar no matter who booked or what device they used.
 *
 * SETUP — see README.md in this folder. Takes about two minutes.
 */

/* Which calendar to write to. 'primary' is the account's main calendar.
   To use a different one, open Google Calendar → the calendar's Settings →
   "Integrate calendar" → copy the Calendar ID and paste it here. */
const CALENDAR_ID = 'primary';

/* A password shared with the website so nobody else can post events into the
   calendar. Replace it with anything long and random, then put the SAME value
   in calendarSecret in the site's data.js. */
const SHARED_SECRET = 'CHANGE-THIS-TO-SOMETHING-RANDOM';

/* How long an appointment runs if the booking does not say. */
const DEFAULT_MINUTES = 60;

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return reply({ ok: false, error: 'No booking data received.' });
    }

    const data = JSON.parse(e.postData.contents);

    if (SHARED_SECRET && data.secret !== SHARED_SECRET) {
      return reply({ ok: false, error: 'Wrong secret.' });
    }
    if (!data.start || !data.title) {
      return reply({ ok: false, error: 'Booking is missing a title or a start time.' });
    }

    const tz = data.timeZone || Session.getScriptTimeZone();

    /* The site sends the appointment's wall-clock time plus the salon's
       timezone, so the event is correct regardless of where the client was
       sitting when they booked. */
    const start = Utilities.parseDate(data.start, tz, "yyyy-MM-dd'T'HH:mm:ss");
    const end = data.end
      ? Utilities.parseDate(data.end, tz, "yyyy-MM-dd'T'HH:mm:ss")
      : new Date(start.getTime() + DEFAULT_MINUTES * 60000);

    const calendar = CALENDAR_ID === 'primary'
      ? CalendarApp.getDefaultCalendar()
      : CalendarApp.getCalendarById(CALENDAR_ID);

    if (!calendar) {
      return reply({ ok: false, error: 'Could not open that calendar. Check CALENDAR_ID.' });
    }

    const event = calendar.createEvent(data.title, start, end, {
      description: data.details || '',
      location: data.location || ''
    });

    return reply({ ok: true, eventId: event.getId() });

  } catch (err) {
    /* Failures are logged so they can be read in the Apps Script dashboard
       under Executions, rather than disappearing silently. */
    console.error('Booking failed: ' + err);
    return reply({ ok: false, error: String(err) });
  }
}

/* Opening the web app URL in a browser hits this, which is a quick way to
   check the deployment is live. */
function doGet() {
  return reply({ ok: true, note: 'Queen K booking endpoint is live.' });
}

function reply(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
