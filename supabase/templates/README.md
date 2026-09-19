# Email templates

These are pasted into the Supabase dashboard by hand. Supabase has no API for
auth email templates, so they cannot be deployed from here — the file is the
source of truth and the dashboard is a copy of it.

## Reset password

**Already live.** `reset-password.html` is a copy of what is currently
pasted into Supabase. Nothing to do unless you change it.

If you do change it: copy the whole file → Supabase dashboard →
**Authentication → Emails → Templates → Reset password** → paste into
**Message body** → Save. Only the `.html` is ever pasted — this README is
notes for you and goes nowhere near the dashboard.

Suggested subject line:

```
Reset your Reamp password
```

### Before it will work

Two settings outside this file, both under **Authentication → URL
Configuration**:

- **Site URL** must be `https://reamp.store`. The reset link is built from
  it, so if it points anywhere else the email sends people to the wrong
  place.
- **Redirect URLs** must include `https://reamp.store` as well.

### Images

The template loads two images from the live site:

| URL | What it is |
|---|---|
| `https://www.reamp.store/email-logo.png` | the R mark, 240×212, transparent |
| `https://www.reamp.store/email-bg.png` | a 64×64 solid black tile |

Note the `www.` — that is what the live template uses, so `www.reamp.store`
has to resolve, not just the bare domain.

They live in `public/`, so they ship with the app. **If the domain changes,
the URLs in the template have to change with it** — an email cannot use a
relative path.

The black tile exists because of Gmail. Gmail's dark mode recolours
background *colours* but leaves background *images* alone, so a
`bgcolor="#000000"` alone comes out grey for a lot of readers. The tile
holds the black — which is why every cell carries the `background`
attribute and the CSS image as well as `bgcolor`, and why the outer div
declares `color-scheme:dark`. It looks redundant. It is not.

### Why it looks like 2005 HTML

Tables, inline styles, no classes, no `<style>` block, no SVG. Gmail and
Outlook strip all of those. This is the only layout that survives.

### A link that arrives already expired

If someone reports the link is dead the moment they open it, the usual cause
is a mail scanner — corporate Outlook and some Gmail setups fetch every link
in an email to check it's safe, and Supabase recovery links are single-use,
so the scanner spends the token before the person clicks it.

There is no fix in the template. The workaround is to send another one and
have them open it on a phone, or on an account without a scanner in front of
it.
