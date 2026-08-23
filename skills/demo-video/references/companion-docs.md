# Companion docs

Optional, and only when the user asks for them: a `workshop/` folder next to `index.html`
holding standalone reference documentation a trainee reads on its own, independent of the
video. `SCRIPT.md` is the source of truth for the content — never invent a feature, menu label,
or flow it doesn't document.

They are written in the **video's language** (`brand.json` → `language`), not in English by
default, and they use the brand's written name exactly as `brand.json` gives it.

## Files

- `00-overview.md` — one overview page for the whole video.
- `01-...md`, `02-...md`, … — chapter files, typically one concepts chapter (Part 1, no app
  footage) plus one or more app-usage chapters (Part 2), split by theme. Match the granularity
  of a short, single-session read — not a mega-document.

## Voice and shape (applies to every file)

Each file reads like a training module, not a wiki article:

1. **One motivating intro sentence at the very start**, addressing the reader directly. It
   frames why the chapter is worth reading, not what it contains. *"Before you create a
   workspace yourself, it's worth looking at how one is put together."*
2. **The body is never flowing prose.** Bullets, short tables, and numbered steps only. Convert
   every explanatory paragraph into a list. Continuous text is allowed *only* in that opening
   sentence and, if needed, one closing sentence — never in the middle.
3. **One consolidated quick check per video, in the LAST chapter file only** — not one per
   chapter. A handful of comprehension questions covering the video as a whole, each with the
   answer right after it, so the file is self-checking rather than a quiz with hidden answers.
   Earlier chapter files end with their last content section.
   ```
   ## Quick check

   1. **What happens when you delete a subpage?** → Only that page is removed; the rest of the
      workspace stays.
   2. **How do you share a workspace with a whole team?** → Through "Share" → Groups.
   ```
4. **Only what helps someone operate the product.** Cut trivia, background rationale, and
   anything a user doesn't need in order to act. If a fact doesn't change what the reader does
   next, it doesn't belong here.
5. **No duplication across files.** The overview's glossary and chapter table exist once; a
   chapter must not restate a definition already given there, and two chapters must not both
   explain the same concept. When restructuring an existing draft, actively hunt for and remove
   repeated content — this is the most common defect in a first draft of these docs.
6. **Direct address throughout**, not third-person description ("you do X", never "the user
   does X"). In a language with a formal/informal split, pick the one the product's own UI uses
   and hold it across every file.

## `00-overview.md` shape

```
# <Feature>

<one direct, motivating sentence — why this matters, addressed to the reader>

## What's covered

| Chapter | What it's about |
|---|---|
| [01 · ...](01-....md) | ... |

## Glossary

| Term | Meaning |
|---|---|
| **...** | ... |
```

No closing summary paragraph — the overview's job is to orient and link, not to teach; the
teaching (and its quick check) lives in the chapters.

## Hard rules

- **The product's own vocabulary, verbatim.** Read labels off the running app or its
  translation catalog, never from memory. A doc that renames a menu item teaches wrong.
- No meta talk about the video itself ("in this video you'll see…") — write as standalone
  reference documentation.
- No references to other videos in the series.
- No em dashes.
