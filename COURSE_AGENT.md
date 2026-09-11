# Course Agent Guide

Use this guide when adding or changing a playable course in Space Force. It describes the current engine contract as implemented by Orbital Graveyard and Nebula Rift. Keep changes small, preserve unrelated work, and verify behavior in the running game; course timing and collision safety cannot be proved by type checking alone.

## Architecture and registration map

The course system is currently explicit rather than data-driven end to end.

| Concern | Source of truth | Required update for a new course |
| --- | --- | --- |
| Course ID and runtime phase data | `src/game/engine.ts`: `CourseId`, `COURSE_CONFIG` | Add the ID and one config entry with `phases`, `durations`, and `bossIndex`. |
| Phase behavior and spawning | `src/game/engine.ts`: `update`, spawn/update helpers, `spawnBoss` | Route each phase index to its updater and select its enemies, hazards, and boss. |
| Course and phase menus | `src/app.tsx`: `COURSE_OPTIONS`, `PHASE_OPTIONS` | Add course copy and one direct-start entry per playable phase, including the boss. |
| Completion, pause, and failure copy | `src/app.tsx`: `MissionComplete`, `GameView` overlays | Add course-specific labels instead of allowing an existing binary conditional to describe the new course incorrectly. |
| Music treatment | `src/game/music.ts`: `PHASE_TREATMENTS` | Register every exact engine phase display string that needs a distinct treatment. Unknown strings use `ASTEROID FIELD`. Music is one continuous shared loop; `setMusicPhase` ramps its treatment without restarting it. |
| Code-drawn art | `src/game/art/index.ts`: `DESIGN_CATALOG`, `DesignId`, renderer map, `drawDesign` | Reuse a design ID or register a new renderer before referring to it from the engine. |

The current config shape is:

```ts
{
  phases: readonly string[]      // HUD/music display strings, including clear
  durations: readonly number[]  // active seconds at the matching indices
  bossIndex: number              // course-specific; never assume index 3
}
```

`Game` clamps `startAtPhase`, reads the selected course config, and spawns the boss immediately when the direct-start index equals `bossIndex`. Keep `phases` and `durations` the same length. The final clear label follows the boss entry; it is not listed as a selectable combat phase in the app.

## Current courses

| Property | Orbital Graveyard | Nebula Rift |
| --- | --- | --- |
| `CourseId` | `graveyard` | `nebula` |
| Phase strings | `ASTEROID FIELD`, `DRONE SQUAD`, `INTERCEPTOR SURGE`, `THE ORBITAL WARDEN`, `SECTOR CLEAR` | `LASER LABYRINTH`, `PRISM LATTICE`, `KAMIKAZE PURSUIT`, `LASER GATES`, `METEOR SLALOM`, `SERPENT RIFT`, `NEBULA CLEAR` |
| Durations | `14, 16, 18, 26, 6` | `18, 20, 24, 22, 24, 34, 8` |
| Boss index | `3` | `5` |
| Regular phases | Falling asteroids; side-entering scout waves; denser scout waves | Moving laser bars; three coordinated laser sentinels; armored kamikaze kiting; warned laser gates; warned meteor corridors |
| Boss | `boss-nemesis`, 1400 HP, bullets/ring beams and later scout support | Long `boss-orochi`, 700 HP, 3/4/5 warned portal dashes at the 66% and 33% thresholds |
| Entrance examples | Asteroids begin above the arena; scouts enter from a side; boss starts at `y = -140` | Sentinels slide down from above; kamikazes start beyond a distant edge; meteors enter from an edge; the serpent trail starts above the arena |

Do not copy a phase number from one course into another. Dispatch must always test both `course` and `phaseIdx`, and boss behavior must use the selected `bossIndex`.

## Phase and entity lifecycle

The steady transition is `active -> exit -> intro -> active`; a new game and a direct phase start begin at `intro`. `PHASE_INTRO` is 1.4 seconds and `PHASE_EXIT` is 1.05 seconds. Active phase duration starts only when intro ends.

- During `intro`, present the phase and move entities from fully outside the arena toward their start positions. Attacks and damaging collision stay disabled until the phase is `active` and the entity is visibly established.
- During `active`, advance the phase timer, spawning, attacks, collision, score, and normal cleanup.
- When duration expires, enter `exit`, stop new spawns, call the course cleanup path, grant transition invulnerability, and let visible entities fly fully offscreen. Do not delete visible mobs in place.
- Advance only after the exit time has elapsed and the retiring entity list is empty. Reset all course-specific counters and timers before the next intro.
- Hazards without a retiring entity, such as gates and pending meteor warnings, must visibly power down or clear during exit. Enemy bullets or other carried state must not create an untelegraphed hit in the next phase.

All mobs and bosses must enter from outside the visible canvas. Reinforcements follow the same rule. Fade can support motion but must not replace it. Delay attacks until the entrance and telegraph complete. Exit velocity must remove the whole rendered footprint, not merely its center. This rule also applies to direct-start testing.

Pausing must freeze gameplay timers because `Game.update` is skipped while paused. Resizing must keep phase state valid, preserve a reachable path, and recompute future positions from current `w` and `h`; never advance a stage or fire an attack because dimensions changed. Test direct start for every menu entry because it bypasses preceding phases and their incidental setup.

## Gameplay construction rules

### Spawning and telegraphs

- Spawn beyond a validated edge with enough margin for the rendered design size. Choose entrances away from the player when immediate trapping is possible.
- Use an explicit warning timer and render the warning from the same state used to enable damage. Never maintain separate visual and collision clocks.
- Cap concurrent enemies and define a release cadence. The cap includes persistent enemies unless the phase intentionally separates them.
- Provide recovery time after dense patterns and before a boss begins another multi-part attack.

### Collision and reachable space

- Derive visible beam endpoints and collision from the same origin, angle, finite length, width, warning window, and firing window. A drawn segment must never damage beyond its endpoint.
- For fast hazards and portal dashes, test the swept path between previous and current positions. Frame-by-frame point overlap can skip through the player.
- Hidden or tunnelled boss segments are invisible and non-damaging. Portal entrances and exits need a warning path, safe clearance from the player, and enough arena room for the rendered body.
- Authored obstacle patterns must leave at least one reachable corridor after accounting for ship radius, obstacle thickness, warning time, and maximum player travel during the warning. Scale positions and gaps from `w`/`h` with minimum pixel clearances.
- Contact enemies must resolve contact exactly once. Kamikazes explode and are removed even if shield or invulnerability prevents damage; the visual explosion must not imply an undocumented second damage radius.

### Enemy and boss lifecycle

An enemy needs one spawn path, entrance/warning state, active movement and attack state, collision behavior, death/score handling, exit behavior, and offscreen cleanup. Shooting, laser, and contact enemies must be separated so a new kind does not inherit an unrelated attack.

A boss needs an offscreen entrance, HP and phase thresholds, telegraphed attack states, collision geometry, death sequence, course clear transition, and direct-start initialization. Nebula's serpent uses `warning -> dash -> recovery`, a screen-diagonal trail with code-drawn head/body/tail segments, and 3/4/5 dashes as its HP pattern rises. Graveyard's Nemesis follows the conventional single-body `drawDesign` path. Do not reuse Nemesis projectile logic for a snake unless the design explicitly calls for it.

Use `drawDesign(ctx, { id, x, y, size, time, rotation, energy, thrust, articulation })` for catalog art. It is resolution-independent and animated by caller-supplied seconds and normalized motion values. `size` includes exhaust and moving appendages, while gameplay hitboxes are independent. Document and tune the hitbox against the rendered silhouette.

## Adding a third course

1. Choose the course ID, exact uppercase phase display strings, active durations, boss phase index, menu copy, completion copy, and which existing art/behaviors are reused.
2. Extend `CourseId` and add the `COURSE_CONFIG` entry. Keep arrays aligned and include the clear phase after the boss.
3. Add course-and-index dispatch for every phase. Create isolated spawn/update/render helpers where behavior differs; do not broaden Graveyard or Nebula conditionals accidentally.
4. Implement entrance, active, exit, and cleanup behavior for each entity and hazard. Reset every new timer/counter at a phase transition and initialize it for direct start.
5. Implement the boss lifecycle and select it in `spawnBoss` by course. Use `bossIndex`; do not encode a universal boss index.
6. Add the course and its selectable combat phases to `COURSE_OPTIONS` and `PHASE_OPTIONS`. Add pause, success, and failure copy for the new ID.
7. Register each exact phase display string in `PHASE_TREATMENTS` when it needs a treatment. Confirm the shared loop ramps without restarting and that fallback is acceptable for any unregistered clear label.
8. Add or reuse catalog art. Pass animation state through `drawDesign`; keep hitboxes explicit in the engine.
9. Run the checks below and correct failures before reporting completion.

## Verification checklist

Use only commands documented by this repository:

```sh
npm run build
npm run dev
```

`npm run build` runs TypeScript checking followed by the Vite production build. With the dev server, test the full course and every direct-start menu entry at desktop size, mobile portrait, mobile landscape, and after resize. Pause and resume during intro, active play, exit, warnings, and boss attacks.

During development, `window.__game` points to the active `Game` instance. Call `window.__game.getDebugSnapshot()` for a detached, serializable view of the current course, phase lifecycle, enemies, bullets, hazards, meteor telegraphs, and boss portal state. Use the snapshot for assertions only; never mutate engine fields through the debug reference.

Confirm all of the following:

- The configured phase order, durations, boss index, menu indices, HUD strings, music keys, and completion text agree.
- No mob appears inside the arena, attacks during entrance, freezes visibly on exit, or disappears before its complete footprint leaves.
- Every laser warning, rendered beam, active window, and finite collision segment stays synchronized at low and uneven frame rates.
- Every obstacle pattern retains a reachable corridor at supported sizes.
- Kiting enemies can turn slowly enough to pass the player and cannot pin the player indefinitely in a corner.
- Portal routes are telegraphed, do not spawn on the player, hide tunnelled segments, and do not clip or skip collision during fast travel.
- Direct start initializes all counters, boss state, art, music treatment, and transition protection without depending on an earlier phase.
- Graveyard and Nebula still complete and retain their course-specific bosses after shared-engine changes.

## Local Qwen collaboration

Codex or the current main agent owns architecture, integration, and final verification. Local Qwen may handle one bounded proposal or review at a time. Use the runtime's OpenAI-compatible local server endpoint; discover its loaded model with `/v1/models` instead of hardcoding a model name or filesystem path. Run Qwen tasks sequentially. Send only the necessary source excerpts and acceptance criteria, then review every proposal before applying it. Do not assume the model has shell, filesystem, browser, or other tool access.

Pay special attention in Qwen review to frame-based laser desynchronization, corner-stuck kiting, enemy pop-in, portal clipping, unusual characters, and documentation/schema drift.

Reusable prompt:

```text
You are a bounded implementation/review assistant for Space Force.

Goal: <one concrete course task>
Acceptance criteria: <observable criteria with exact names/counts/timings>
Evidence: <only relevant excerpts and verified current behavior>
Ownership: <at most one large source file or two small source files>
Verification: <npm run build and/or named manual scenarios from COURSE_AGENT.md>

Constraints:
- Do not edit or propose changes outside ownership.
- Preserve unrelated edits and adapt to concurrent work; do not revert it.
- Do not use Git, HANDOFF files, subagents, or another AI client.
- Do not assume tool access. Return an applicable patch or a focused review.
- Keep phase strings, menu indices, config arrays, music keys, and documentation aligned.
- Stop when this bounded task is complete or a concrete blocker is identified.

End with exactly:
{
  "status": "completed | needs_revision | blocked | cancelled",
  "reason": "none | loop_detected | context_overflow | compaction_failed | provider_error | user_cancelled | budget_exhausted",
  "changed_paths": [],
  "verification": [],
  "next_action": ""
}
```
