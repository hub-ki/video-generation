# The spoken track

For a narrated guide, `SCRIPT.md` carries the voiceover too — and it is drafted here, not fixed
later. The production skill's `narration.mjs` is a near-verbatim copy of this text, so a defect
written here ships straight through: the fit table checks durations, the level check checks
loudness, the transcript check checks words against *your own file*. None of them checks whether
the sentence is good.

**Cards and narration are different registers, and the defect is almost always the same one: a
card label pasted into the spoken track.** A fragment on a card reads as deliberate; the same
fragment spoken reads like a sentence that got cut off, and the listener waits for an ending that
never comes.

So: **read every line back as a sentence, out loud, as you write it** — not after.

## Twelve failure patterns

Each is a real defect caught only by reading a script aloud. They came out of German builds, but
none of them is German: they are what happens when written UI copy is spoken.

1. **Verb–object agreement in a lifted label.** A label like "Let work" becomes "You let *the
   agent* work" — a transitive verb spoken without its object has nowhere to land.
2. **A verb that doesn't take the construction you gave it.** "In practice that means three
   things" → "In practice there are three of them." Fix the verb, not the noun.
3. **Enumerations that change grammatical shape mid-list.** Two infinitives then a bare noun (or
   the reverse). Make every item the same shape.
4. **Elided auxiliaries with no "and" before the last item.** "…what he asked, …wrote, …ran" is
   grammatical and, spoken, leaves the first two hanging. Add the conjunction before the last
   item.
5. **Collocations that are wrong even though the grammar is fine.** "Place a search" → "what he
   searched for". A phrase can parse and still be something nobody says.
6. **A word doing two jobs in one sentence.** Name the control explicitly instead of reusing one
   word for the button and for the thing it opens.
7. **A verb missing its complement.** "Set" needs an object of its own — say *what* is set.
8. **A personifying verb that overshoots what the subject can do.** "An agent sits here" → "An
   agent works here for you."
9. **A noun paired with the wrong support verb.** "Make intermediate steps" → "Then come the
   intermediate steps."
10. **An object turned into the sentence's subject.** "Files come in via the plus" → "You add
    files via the plus."
11. **A bureaucratic verb where a plain one reads better.** "registers it as an artifact" →
    "shows it as its own card".
12. **A word implying an accident where the action was deliberate.** "what has disappeared" →
    "what you archived".

Deliberate fragments are fine when they are *obviously* a list hanging off a full sentence — "It
has tools for that. A sandbox. Your workspaces. Web search." reads as intended. The test is
whether a listener would wait for more.

## Audience fit

Write for a viewer who has never used the product. Every product noun (Sandbox, Workspace, Skill,
Connector, Artifact) is new to them.

- Don't stack more than ~2 unexplained terms per beat without a concrete anchor.
- Don't let a term silently change function between beats without an explicit bridge sentence.
- Spend the setup cost on **one** metaphor and reuse it for free.
- Check that the first hands-on example actually delivers on the promise made just before it.

## Tone

Read the way a good primary-school teacher explains something new: short, warm, direct sentences,
confident the listener can follow. Never talking down, never padding.

## Timing is a consequence of the copy

In a narrated guide, beat lengths are a function of the line, not the other way round. Write the
line; the production skill measures it and widens the beat. When a line does not fit, the default
fix is a **wider beat**, not shorter copy — reviewers ask for slower pacing, and a beat that is
too short is a worse problem than a video that is ten seconds longer. Only shorten copy when the
beat is footage-limited.

Practical consequence for you: **prefer several short lines over one long one**, and mark in the
script which line belongs to which beat. A single sentence stretched across three beats cannot be
re-timed without a rewrite.

## Proper nouns: note the split, don't write the respelling

TTS engines mispronounce short brand names, acronyms and foreign words. The fix is a phonetic
respelling **in the TTS input only** — and that belongs to the production skill's
`narration.mjs`, not here.

`SCRIPT.md` carries the **real spelling**, because a human reads it for approval, plus one note
where a word is known to need respelling ("brand name is respelled for the voice; on-screen
spelling unchanged"). Never put a phonetic spelling in the script, on a card, or in the plan — if
it reaches a rendered surface, a reviewer catches it immediately.
