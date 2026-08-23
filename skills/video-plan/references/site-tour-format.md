# The site-tour format — a video of a website you do not sign into

Use this when the subject is a **website** rather than an app behind a login: a company's
landing page, a product site, a public documentation portal, a news portal. It is a different
arc from the two-part feature guide, and it starts with questions the guide format never has to
ask.

The companion capture reference is `demo-video → references/foreign-sites.md`. This file is
only about the *plan*.

---

## Step 0 — The three questions that come before the arc

Ask these in your first message, alongside "what is the video FOR". They are not formalities:
each one changes the plan, and the last one changes what may be filmed at all.

**1. Whose site is it?**

| answer | what it means for the plan |
| --- | --- |
| ours | proceed like any demo; the brand is yours |
| a customer's, with a brief | the brief decides the arc; extract their brand from the live page |
| a third party's | write down *why* it appears. A comparison, a review, a teaching example, an "our integration with X" — the reason belongs in `PLAN.md` under purpose, because it is what someone will ask about later |

**2. Where is it published?**

An internal walkthrough and a published ad sit very differently with someone else's
trademarks, screenshots and copy on screen. This is not a legal opinion the skill can give —
it is a question the person commissioning the video has to have answered, and `PLAN.md` is
where the answer lives.

**3. What on the page is personal data?**

Comment threads, author bylines, profile photos, user-generated posts in a feed, a live chat
widget showing someone's name. It records at 4K and it is not yours to publish. Every instance
goes in `PLAN.md` as a **privacy flag** with what to do about it: avoid the region, choose a
different beat, or blur it in the composition.

A site you do not own has no seed data you can substitute, so "we will just use test accounts"
is not available. The answer is usually to pick a different part of the page.

---

## The arc

A website tour is **not** a feature guide. There is no task being taught and nothing to
complete, so the two-part concept-panel-then-action-beat structure does not apply. What holds a
site tour together is a claim.

```
1. Establish     the site as it greets a visitor. One held wide shot, no spotlight.
                 This is the only beat where "it looks like this" is the whole content.

2-5. Evidence    three or four sections, each one making ONE point, each spotlighted.
                 Ordered by the argument, NOT by the page's scroll order — the page is
                 laid out for browsing, your video is making a case.

6. Land          what the viewer should now think or do. Usually the site's own call to
                 action, framed as the natural end of the argument rather than pasted on.
```

Four to six beats total. A tour that walks every section is a scroll recording with music.

**The single most common failure is scroll-order thinking**: opening at the top and working
down, spotlighting whatever appears. It produces a video with no claim, and no way to tell
whether it is finished. Write the claim as one sentence in `PLAN.md` before listing beats, and
drop every beat that does not serve it.

## Beat entries: two extra fields

Each beat in `PLAN.md` carries the usual fields plus two that only matter off your own domain:

- **`find`** — the words that identify the target, **quoted verbatim from the page you actually
  looked at**. Not a selector, never coordinates, and never a phrase you composed because it
  sounds like something that would be there. `findByText(page, /…/)` resolves it at capture time,
  so a quoted string either matches or fails loudly, while an invented one quietly resolves to
  whatever is nearest and the spotlight frames the wrong thing — see
  `plan-and-script.md`, "A spotlight target is EVIDENCE". A class name read off the page today
  will not survive their next deploy either.
- **`motion`** — `freeze` or `live`. A hero video, a live feed or a running animation is
  sometimes the point of the beat and sometimes noise that ruins a freeze-frame. Deciding it in
  the plan means the capture pass does not have to guess. Default `freeze` for any beat you
  intend to freeze-frame or verify by pixel diff; `live` when the movement *is* the claim.

Also flag, per beat: **is this section below the fold with images?** Those are the beats where
the layout moves after the scroll, and the capture pass measures them differently.

## The spoken track

Two things differ from an app guide:

- **Do not narrate the navigation.** "Here we scroll down to the pricing section" describes the
  camera, not the subject. The viewer can see the scroll. Say what the section *means*.
- **Read their words before you write yours.** A site has its own vocabulary for its own things,
  and a tour that renames them is confusing precisely for the audience that already knows the
  site. Quote the page's terms; do not improve them.

## What does NOT change

The concept gate, the two documents, the approval, the copy rules, the read-it-aloud checklist.
A site tour is planned exactly as strictly as anything else — a plan that turns out wrong costs
the same re-shoot either way.
