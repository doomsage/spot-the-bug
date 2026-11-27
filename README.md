# Spot the Bug

An 8-question JavaScript "what does this print?" quiz with one real A/B experiment inside it, run with Flagsmith Experimentation. Toggle Wars, Track 1.

**AI disclosure:** this project was built with AI assistance (Instinct, an AI assistant working for Kunal Dewangan). Kunal reviews and can explain the code and the experiment.

## Hypothesis (written before launch)

When a player gets a JavaScript trap question wrong, showing a **hint and letting them retry once** makes them more likely to get the **twin question** (same concept, new numbers) right on the first try, compared with **showing the full explanation immediately**.

## The experiment

- Flag: `wrong_answer_feedback`, multivariate, 50/50 split.
  - `explain_now` (control): after a wrong answer, show the full explanation right away.
  - `hint_then_retry`: after a wrong answer, show a hint, allow one retry, then show the explanation.
- Questions come in 4 concept pairs (sort, var in loops, null vs undefined, map + parseInt). Q1, Q3, Q5, Q7 are the first of each pair. Q2, Q4, Q6, Q8 re-test the same concept.
- Exposure (`$flag_exposure`): sent once per player, at their first wrong answer on Q1, Q3, Q5 or Q7. Players who never miss one are never exposed and never counted.
- Primary metric `paired_followup_correct`: the player missed the first question of a pair and then answers its twin correctly on the first try.
- Guardrail metric `post_mistake_next_attempt`: the player carries on after a mistake instead of quitting. A winning variant must not hurt this.
- Identity: a random UUID in the browser's localStorage. No account, no personal data.
- Each event is sent once per identity, so refreshing or replaying cannot inflate the numbers.
- Test mode (`?test=1`, `?arm=hint_then_retry`, or localhost) never sends events, so our own testing is not in the data.
- The "under the hood" button shows your version, your id and every event the page records.

## Honest reporting

No simulated or padded traffic is mixed into the results. Whatever Flagsmith's results page shows is what we report, including a "not enough data" or "no difference" outcome.

## Prediction

I expect hint_then_retry to win. Having to think about the hint before seeing the answer should make the rule stick, so more players should get the twin question right on the first try, with no drop in players who keep going. Written before launch, before seeing any data. (Kunal Dewangan)

## Run it

Static files, no build step. Serve this folder with any static server and open `index.html`. The environment key in `app.js` is a public client-side Flagsmith key.
