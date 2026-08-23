# Card copy

One short **headline** per beat. That's the whole format: no kicker badge above it, no subtitle
under it, no second line of explanation.

The one hard bar, whichever form you pick: **it has to sound like something a person would
actually say in the video's language** — not stilted, not translated-sounding.

Two forms are equally fine, so pick whichever reads more naturally for that beat:

- a bare topic phrase — "Agents vs. skills.", "Feedback in chat."
- one short natural sentence — "Opens the Skills menu.", "The logo goes home, the bell shows
  notifications."

What it is *not* is a marketing fragment: "One click from the marketplace.", "Organized in
seconds." Those read as ad copy pasted onto a product video.

## The hard rules

Each of these is a revision round that happened, not a preference.

**No kicker.** A short standalone label above the headline (ALWAYS THE SAME, ONCE MORE,
DETACHED) reads fine to the person who wrote it and means nothing to everyone else, because it
depends on context — the headline below it, the beat before it — that a bare label cannot carry.
One build shipped "IMMER GLEICH"; taken alone it is an incomplete comparison (same as *what*?),
and it doubles as the German idiom for "tediously repetitive", the opposite of the reassurance
intended. Expect that second failure in any language: a bare label is exactly the string an idiom
can hijack.

**Never enumerate.** A card listing several items ("Documents, agents, skills and connectors.")
reads like a list pasted onto a card, not something a person would say. Name the topic instead
("Marketplace content.") or split it across separate beats.

**Never state a count or a category of anything the user configures.** "Nine built-in skills" was
wrong twice over: the list also contained skills that customer had built themselves, and the
count changes per tenant. Describe, don't enumerate.

**Every card must stand alone.** "The same list, without leaving the keyboard" sent the reader
hunting for which list — it depended on remembering the previous card. Name the thing: "Opens the
same Skills menu."

**When two cards are alternatives, each must name its own route.** One card said what was *in*
the menu and the other said "type /", so the only actionable instruction in the whole step was
the shortcut — teaching that `/` is the only way in. Give the primary route an imperative too
("Click Skills to see them all").

**ASCII only for numbering.** `1.`, `2.`, `3.` — never circled numerals (①②③). They have no glyph
in the render font and silently fall back to a generic box. This applies to *numbering only*:
body copy, headlines and narration are normal text in the video's language, accents and all.
Writing an accented word in ASCII transliteration is itself a defect.

**No em dashes.**

## Action cards vs state cards

They schedule differently, and getting it wrong is invisible until someone watches the render.

- **Action cards** ("② Pick one", "Three levels") describe what is being *done*. They can run
  over the whole action beat — they cannot be wrong.
- **State cards** ("Blocked / Nothing runs.", "Always execute / No prompts.") assert what the
  screen *shows*. They may only start **once that state is actually on screen**.

Two shipped the wrong way in one session: a "Nothing runs." card sat over an open dropdown for 3s
before anything was blocked, and an "ALWAYS EXECUTE" card landed 1.7s before the toggles went
green. So when you write a card that asserts a state, say in the plan *which moment* it belongs
to — "over the freeze, not over the click".

## Length

Headlines render at ~38px with a two-line budget. Line count depends on the specific words, not
on character count, so a card that reads fine in the script can still overflow. Compound-heavy
languages make headlines noticeably longer than an English draft — check the drafted card
against its budget rather than assuming the translation fits.
