# Adding content (the human guide)

Everything visitors read lives in `src/content/` as plain TypeScript data. Change a
file there, push, and **every theme picks it up automatically** — no theme code ever
needs touching for a content change. Draft copy can also go into `CONTENT.md` first
and Claude will transcribe it.

Two rules for all text: keep it in your own voice, and **no em/en dashes** (use
commas, periods or `·` instead — site style rule).

After any change, `npm run test` checks the content (unique slugs, working
cross-links, https links). CI runs it too, so a typo in the data fails the build
instead of showing a broken page.

## Announce something new ("Up next")

File: `src/content/announcements.ts`. Add an entry at the TOP (newest first):

```ts
{
  id: 'my-next-thing',            // unique, lowercase-with-dashes
  title: 'My Next Thing',         // shows on the landing ticker + projects page
  body: 'One or two sentences about what is coming and why it is exciting.',
},
```

Delete entries when they ship (usually when the real project entry appears).

## Add a project

File: `src/content/projects.ts`. Copy an existing entry and edit. The important
fields:

- `slug` — unique, lowercase-with-dashes; becomes the URL `/projects/<slug>`.
- `title`, `category` (`'personal' | 'jam' | 'university'`), `status`
  (`'released'` or `'coming-soon'` — coming-soon entries show via announcements, not
  as cards).
- `year`, `event` (jam or course name), `duration`, `role` — role is required for
  released projects.
- `team` — `{ name, size, members }`, any subset.
- `tools` — list of engines/languages.
- `summary` — 2–4 sentences; this is what cards and subpages show. Numbers and
  results make it stronger.
- `links` — `{ label, url }`, first link becomes the primary button. Executables
  belong on GitHub Releases, games on itch.io.
- `art` — optional fractal identity; leave it out and the theme derives one from the
  slug automatically.

In the julia theme, card sizes live in `CARD_SPAN` in
`src/themes/julia/views.tsx` — add your slug there if you want a specific size
(2/3/4/6 columns), otherwise it defaults to 3.

## Update the CV

File: `src/content/cv.ts`.

- **Education / Experience** — copy an existing entry; `highlights` is the bullet
  list, `tools` shows in the meta line.
- **Proficiencies** — each entry lists `projectSlugs` proving it; slugs must exist in
  projects.ts (the tests check this).
- **Plans** — one string.

## Interests

File: `src/content/interests.ts`. Four sections (books / gaming / skiing / music):
edit `body` text and add `links` (Steam, Spotify already there). Filling the
"coming soon" placeholders = just replacing the body strings.

## Profile & socials

Files: `src/content/meta.ts` (name, tagline, main URLs) and the `socials` list in
`src/content/index.ts` — add LinkedIn there when it exists.

## Where things show up

| Content | Landing | Projects page | Own page |
|---|---|---|---|
| announcements | ticker at the bottom | "Up next" panel on top | — |
| projects | — | card mosaic | `/projects/<slug>` |
| cv | — | — | `/cv` |
| interests | — | — | `/interests` |
