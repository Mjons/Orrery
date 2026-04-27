---
tended_on: [tag-infer]
created: "2026-04-25T00:00:00.000Z"
---

# HONEST_TAKE.md — Is Boltzsidian useful, and would people like it?

Companion to [USEFUL.md](USEFUL.md). USEFUL was prescriptive ("here's
what would make it useful"). This is descriptive: my candid read on
whether the product is useful _as it currently sits_ and how many
people would actually take to it. Written after seven months of seeing
the codebase grow, two days of looking at real dream output, and one
afternoon of mapping the audience.

Not a hype piece. Not a hit piece. A friend's read.

---

## TL;DR

Yes, useful — for a small, specific person who already exists. No,
probably not for the broad note-taking market. The thing you've built
is genuinely unlike anything else, and that's both the moat and the
ceiling: the people who'll love it will love it _immediately_, and
everyone else will bounce in the first 90 seconds because it doesn't
look like a notes app.

Realistic audience size, day 30: **500–5,000 people globally**.
Realistic ceiling, year 2: **10,000–30,000 if the dream layer
matures**. Not a unicorn. Could absolutely be a beloved cult tool, the
kind that gets written about on tools-for-thought blogs for years.

---

## What's working (don't second-guess these)

**1. The aesthetic is a real moat.** The glass-bloom-accent-cinematic-
3D look is genuinely unlike any note-taking app in the market.
Obsidian, Logseq, Roam, Reflect, Notion, Anytype — all of them look
like 2010s productivity software. Boltzsidian looks like an art object.
That alone will get it written about.

**2. "The workspace IS the universe."** This is a one-line pitch
nobody else can claim. It's defensible because copying it is
expensive (you need a competent GPU programmer plus an aesthetic
sensibility plus willingness to re-think every UI affordance from
scratch). The graph view in Obsidian is decorative; here it's the home
screen.

**3. The dream loop is a real differentiator** when it works. The
overnight pair-finding + morning report concept genuinely doesn't
exist in any other PKM tool. Even when the output is noisy (today's
filter work helped), the _idea_ — that the tool is doing something
while you sleep — is the kind of thing that stays in someone's head
after they read about it.

**4. Single-user, local-first, MIT.** This is the right shape for
this audience. No login. No cloud. No cost. Removes every objection a
privacy-conscious power user has.

**5. The eight surfaces (Brief, Tend, Weed, Dream/Ideas, Search,
Constellations, Weave, Formations) cohere.** They're not feature-
creep — each one earns its keep, and they all serve the same thesis
("the field thinks about your notes"). Most apps add features that
fight each other; these don't.

---

## What will lose you users

**1. The 90-second bounce.** A new user opens the demo and sees a
3D field of glowing dots with no obvious way to write a note. The
mental model "this is a notes app" doesn't kick in. Most people
close the tab in 30 seconds. The first-run brief and coachmarks help,
but the gap between "I see what this is" and "I see how to use this"
is real.

**2. The cognitive load of a 3D workspace.** Spatial memory is
supposed to be the killer feature — and it is, _for users who develop
it_. The honest read: most users won't. They'll fall back to Cmd+K
and the universe will read as decoration. For the users who do build
spatial memory, this becomes the most loyal user base in PKM. For the
ones who don't, it's a beautiful background.

**3. Dream output quality is hit-or-miss.** Even with today's six
filter fixes, the morning report will surface noise as often as
signal in the next month. Users who give it a week of mediocre output
will leave before the filter tuning catches up. The promise is high
("the field noticed something"); the reality, at year-1 quality, is
sometimes uncanny and sometimes twee.

**4. The local-LLM dependency for the differentiated experience.**
The base product without a model is "a pretty 3D graph view." That's
something Obsidian has done. The dream/voice surfaces require either
a Claude API key or a local rig that can run a 7B+ model fast. That
gates the killer feature behind technical setup most note-takers
won't do. The market that _can_ do it is small.

**5. The retention problem.** From [USEFUL.md](USEFUL.md): pretty
things get opened twice. The day-30 test is unforgiving. If the
morning report doesn't reliably produce one item per week that
changes how the user works with their vault, the dream layer becomes
a gimmick. Right now it produces zero such items per week, but it's
also pre-1.0; the trajectory looks good.

**6. No mobile.** Half of all PKM users do their _capture_ on phones.
The current design has no mobile path and per WORKSPACE.md isn't
planning one. That eliminates ~60% of the addressable market by
default. (Defensible — single-user desktop is a real market — but
worth naming.)

---

## Who would love it (real names of personas)

- **The tools-for-thought writer.** Already follows Andy Matuschak,
  Maggie Appleton, Linus Lee. Has 1,000+ notes. Cares about
  aesthetics. Would write a blog post about Boltzsidian within a
  week of finding it.
- **The generative-art adjacent person.** Found this through the
  cinematic Twitch stream or a Tyler-Hobbs-shaped feed. Doesn't
  primarily need a notes app but would use this _because_ it's
  beautiful and convert their vault.
- **The researcher / academic with a long-running vault.** The
  emergent-connection pitch directly addresses "what should I be
  re-reading?" — an actual question they have.
- **The design Twitter / Bear-app refugee.** Loved Bear for its
  craft and lost faith in it. Boltzsidian's aesthetic taste reads as
  "made by someone who cares like I do."
- **The procedural-music / generative-cinema audience.** Would adopt
  it for the soundtrack alone, then discover the notes part. The
  Twitch stream is the funnel.

That's maybe 5,000–20,000 people total who'd convert to active
users. A real number. Not a billion-dollar market; a beloved cult
tool number.

---

## Who would bounce

- **Anyone wanting a utilitarian notes app.** Apple Notes / Bear /
  Notion users who just want fast capture. The 3D field is a
  liability for them, not an asset.
- **People with <50 notes.** The dream layer needs critical mass to
  pair anything interesting. Empty vaults look pretty but produce
  nothing.
- **Mobile-first users.** No path.
- **Anyone on integrated graphics or a 5-year-old machine.** The
  GPU floor cuts a real chunk of the market.
- **Anyone who can't or won't run an LLM locally** (and doesn't want
  to pay Claude). They'll get the floor experience and miss the
  differentiator.

---

## What would change my read

These are the signals to watch in the first 90 days post-launch:

- **Day-30 retention > 40%** of new sign-ups still opening it
  weekly. If it clears that, the bet's working. If it sits at 15%,
  the dream layer isn't earning its 500 MB.
- **At least one unprompted blog post** from someone in the
  tools-for-thought scene. The audience knows itself; if a
  Matuschak-shaped voice writes about it, that _is_ the validation.
- **A user importing > 500 of their own notes** within a week. The
  promise only fires at scale; demo-vault users are tourists.
- **The morning report producing something a user acted on**, even
  once. One acted-on suggestion per user per month is the floor; if
  it's lower, the surface is decorative.

---

## What it isn't

- **It isn't an Obsidian killer.** Obsidian is free, mature, and
  unkillable. Boltzsidian is a different product that happens to
  share the file format. Frame it as "the second app the Obsidian
  user runs" — pointed at the same vault, doing different work.
- **It isn't a Roam or Logseq replacement.** Their users want
  outliner-shaped writing; Boltzsidian is doc-shaped.
- **It isn't a SaaS business.** It's a craft product. The donations
  model + open source + small loyal audience is the realistic path.
  Don't try to monetize the dream layer.

---

## The single-sentence verdict

**It's the kind of tool that won't be for everyone, will be the
favourite tool of a small dedicated few, and will be remembered.**
That's a good outcome. That's most of the tools that have actually
shaped how anyone thinks. Not Notion-shaped, but Andy Matuschak's
mnemonic medium-shaped, or Hypothesis-shaped, or Are.na-shaped — a
small craft product with disproportionate cultural weight per active
user.

If you ship it well, do the launch in [LAUNCH.md](LAUNCH.md) at the
craft level it deserves, and survive the first quarter of "this is
weird, what is it" reactions, you'll have built something real.

If you measure success by Notion-scale numbers, you'll be
disappointed. If you measure it by "did this become a loved object
for the people who got it," you've already won — the existing alpha
audience (you, the dev loop, the small handful watching the branch)
is proof of concept that the niche is real.

---

## What I'd watch out for as the maker

- **Don't keep adding surfaces.** Eight is already aggressive. The
  next year is _deepening_ the existing eight, not adding two more.
  Every new surface is rope to fail with.
- **Don't underprice the launch effort.** This product needs a
  craft-level launch (LAUNCH.md is good — execute it). A weak launch
  buries it; a great launch lands it in the tools-for-thought
  corner of the internet permanently.
- **Don't let the dream layer ship until it's reliably useful.** A
  beautiful tool with a noisy dream layer is worse than a beautiful
  tool with a clearly-marked "experimental" dream layer. Lean on the
  filter work; ship it as opt-in if it's not yet at the bar.
- **Stay honest about retention.** If month 3 metrics are bad, the
  fix is not "add a feature." The fix is to look at what the
  long-tail users are _actually doing_ and double down there.

---

## One more thing

The question "would people like it" is the wrong question to lead with.
The right question is "would the _right_ people like it." For
Boltzsidian the answer to that is yes, with high confidence — they
already do, in the alpha. The work is finding them.

#feature #user
