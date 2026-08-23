# The application's concept — the part that outlives this video

A video plan describes one video. Almost everything in it that was expensive to work out is not
about the video at all: what this product is for, which capability matters to whom, what the
screen actually says, what has to be true before a flow can run. Write that into the plan and it
dies with the plan. The next video, the next guide, the next test starts from nothing.

So keep it somewhere else. This reference describes the lightest version of that idea worth
having, and how a video plan uses it.

> **This is optional and it degrades.** No concept anywhere? Then do the direct thing — ask what
> the video is for, agree the arc, write the plan. Offer to leave a first concept behind
> afterwards, because you will have learned most of it anyway. Never make a caller produce one
> before you will help them.

## What an application concept is

One short document per capability of the application, describing **how it is meant to behave** —
written as intent ("this is what it should do"), not as a description of what the code currently
does. It is the reusable half: the same document can feed a demo video, a written guide, a test
plan, an onboarding page.

Minimum useful shape:

```markdown
# <Capability>

<Two or three paragraphs: what this is, who it is for, why it is worth their time. Plain prose —
this is what narration and documentation are written from.>

## Before you can use it
- <what must be true first: an account of some kind, some data present, a setting enabled>

## Flow — <name a person would recognise>
1. Do: <one concrete action — name the control as it is labelled on screen>
   See: <the one observable result>
2. Do: …
   See: …

## Words on screen
- "<verbatim label>" — <where it appears>
- "<verbatim heading>" — <where it appears>

## Not this
- <what this capability deliberately does not do, and what people mistake it for>
```

Four things earn their place:

- **The prose** is the source for narration. A video whose voice-over explains *what* is happening
  and never *why it matters* is a screen recording with commentary.
- **The flow** is a sequence a person can actually perform, in the order they would perform it —
  not an assertion sequence and not a feature list.
- **"Words on screen" is the part that is easiest to skip and most costly to lack.** Quoted,
  verbatim, copied from the running application. It is what a capture step can search for, and
  writing it forces whoever authored the concept to have looked. See `plan-and-script.md`,
  "A spotlight target is EVIDENCE".
- **"Not this"** stops the same misunderstanding being re-litigated in every artefact derived from
  the document.

## How the video plan uses it

`PLAN.md` becomes a *projection* rather than an invention:

| PLAN.md field | comes from |
| --- | --- |
| purpose, audience | the concept's prose — narrowed to this video's job |
| the beat list | the flow, trimmed to what this video shows |
| spotlight targets | "Words on screen", quoted |
| out of scope | "Not this", plus whatever this video drops |
| the spoken track | the prose, rewritten to be heard rather than read |

What the plan still owns, because a concept has no opinion about it: the **arc** — which four
things this video shows and in what order — the pacing, the card copy, and the choice of what to
leave out. A concept says what the capability is; a plan says what this video argues.

## Keeping it honest

**Ask rather than infer.** If the concept does not say who the video is for, ask. A concept is
written by people and is allowed to be incomplete; guessing at its gaps and writing the guess into
a plan is how a wrong assumption becomes three artefacts deep.

**Say when you changed it.** If making the video taught you something the concept gets wrong,
update the concept and say so in the same breath. A concept nobody corrects becomes a document
people stop trusting, and then everyone goes back to writing everything from scratch.

**Freshness is a fact about observation, not a claim.** If a concept records when it was last
checked against the running application, that timestamp should be set when someone actually looked
— not when a document was edited. A field that anyone can set without looking will eventually say
"fresh" about something nobody has seen in a year.
