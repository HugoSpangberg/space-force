# MASTER PROMPT — RETRO SPACE CO-OP SHOOTER

You are my senior game developer, game designer, multiplayer engineer, and UI/UX designer.

I want you to help me design and implement a new browser-based mobile game.

You should work like an experienced developer inside an existing project, not like a code generator that writes large amounts of code without understanding the overall system.

⸻

1. IMPORTANT: ANALYZE MY EXISTING PROJECTS FIRST

I already have previous projects called:

* music-duel
* world-duel

These projects already contain a design style and visual language that I like.

Before you start building the new game:

1. Inspect the structure of music-duel and world-duel.
2. Identify:
    * color palette
    * typography
    * buttons
    * cards/panels
    * spacing
    * borders
    * shadows
    * gradients
    * animations
    * menus
    * lobby design
    * overall visual identity
3. Reuse the same design DNA in the new game.
4. Do not blindly copy old code if it is poorly structured.
5. Reuse components, design tokens, and patterns where appropriate.
6. The new game should clearly feel like it belongs to the same family/universe as music-duel and world-duel.

Do NOT create a completely different generic sci-fi design.

⸻

2. GAME CONCEPT

The game is a vertical scrolling space shooter designed primarily for mobile devices.

The player controls a spaceship and flies upward through a level.

The game must support:

* solo play
* online multiplayer with friends
* multiple separate mobile devices
* real-time gameplay

Each player uses their own phone.

The game should run directly in the browser without requiring an app installation.

⸻

3. CORE GAMEPLAY

The player’s spaceship:

* is controlled with a finger on the touchscreen
* should follow the player’s finger
* should appear slightly ABOVE the finger so the finger does not cover the spaceship
* should move smoothly and responsively
* should not feel sluggish
* should automatically fire during gameplay

There should be no normal shoot button.

Conceptually:

finger position -> upward offset -> spaceship target position

Use interpolation/smoothing if it improves the feel, but input latency must remain extremely low.

Desktop development should also be supported:

* mouse movement acts as touch input
* mouse position controls the spaceship
* optional keyboard debug controls may be added if useful during development

⸻

4. VERTICAL MOBILE FORMAT

The game is primarily designed for phones in portrait orientation.

Primary target aspect ratio:

9:16

The game should feel natural on:

* iPhone
* Android
* smaller phones
* larger phones

Use responsive scaling.

Different aspect ratios must not break the gameplay area.

Respect mobile safe areas, especially on iPhones.

⸻

5. GAMEPLAY LOOP

Each level consists of several clear phases.

PHASE 1 — ASTEROIDS

Players fly through an asteroid field.

Asteroids should:

* enter from the top of the screen
* vary in size
* vary in speed
* require different numbers of hits
* potentially split into smaller pieces
* damage players on collision
* be destroyable by shooting

Difficulty should gradually increase.

PHASE 2 — ENEMY MOBS

After the asteroid section, enemies begin appearing.

Possible enemy types:

* small fighters
* enemy formations
* suicide enemies
* shooting enemies
* enemies that follow players
* tankier enemies
* enemies with movement patterns
* enemies attacking from the sides
* mini-elites

Enemy waves should be intentionally designed rather than purely random.

PHASE 3 — INTENSE SECTION

The level becomes significantly harder.

Increase:

* bullets
* enemies
* movement patterns
* environmental hazards
* combinations of mechanics

The player should now need to learn patterns rather than simply react.

PHASE 4 — BOSS

Every level ends with a unique boss.

The boss should have:

* multiple attack patterns
* multiple phases
* clear telegraphing
* animations
* a boss health bar
* visible phase transitions
* learnable attack patterns
* high difficulty
* moments where players can attack aggressively
* moments where survival becomes the main focus

The boss fight should be the highlight of the level.

PHASE 5 — LEVEL COMPLETE

When the boss is defeated:

* play a major explosion or special animation
* show score
* show statistics
* show rewards
* mark the level as completed
* unlock the next destination

Then return the player to the level map / galaxy map.

⸻

6. CUPHEAD-INSPIRED DIFFICULTY

I do NOT want a casual mobile game where the player almost always wins.

The game should be difficult.

Take inspiration from Cuphead’s design philosophy:

* deaths should feel fair
* pattern recognition
* repetition
* mastery
* tight controls
* clear telegraphing
* fast retries
* boss phases
* players improve by learning

Do not copy Cuphead’s art, characters, music, bosses, or specific mechanics.

Use the design philosophy, not the assets.

It is acceptable for players to die often.

Retries should be extremely fast.

⸻

7. MULTIPLAYER

Multiplayer is a core feature and should be designed correctly from the beginning.

The game should support, for example:

* 1 player
* 2 players
* 3 players
* 4 players

The architecture should not make it difficult to increase the player limit later.

Each player:

* plays on their own phone
* sees the same game world
* controls their own spaceship
* sees the other players’ ships in real time

⸻

8. REAL-TIME SYNCHRONIZATION

Multiplayer must be real-time.

Design the networking architecture properly.

Use an authoritative server model.

The server should be authoritative over important game state such as:

* enemy spawning
* enemy health
* boss health
* damage
* player deaths
* important projectiles where necessary
* game phase
* score
* level progression
* random seeds
* victory
* defeat

Clients should primarily send:

* player input
* movement intent
* relevant client state

Do not make clients authoritative over important gameplay because this creates desynchronization and cheating problems.

⸻

9. NETWORKING

Use WebSockets for real-time communication.

If the existing project stack strongly suggests another approach, explain why before changing direction.

The system should handle:

* rooms
* room codes
* joining
* leaving
* reconnecting
* player ready state
* host
* game start
* disconnects
* latency
* interpolation
* snapshots
* synchronization
* game events

Example:

CREATE ROOM

The server creates:

AB7K

Friends open the game and enter:

AB7K

Everyone then joins the same lobby.

⸻

10. LATENCY COMPENSATION

Movement must still feel good over the internet.

Implement appropriate techniques such as:

* client-side prediction
* server reconciliation
* interpolation for remote players
* snapshot buffering
* network tick rate management
* render interpolation

Do NOT send the entire game state 60 times per second unless there is a real reason.

Separate:

* simulation tick
* network tick
* render FPS

For example:

Simulation:

60 Hz

Network snapshots:

10–30 Hz depending on need

Rendering:

requestAnimationFrame / device refresh rate

Optimize based on profiling rather than assumptions.

⸻

11. PLAYER MOVEMENT

Touch movement is extremely important.

The player’s spaceship should feel attached to the finger without being directly underneath it.

Concept:

touchY - PLAYER_TOUCH_OFFSET

The offset should scale reasonably with screen size.

The ship must remain inside the playable area.

Avoid:

* ship moving behind UI
* ship leaving the screen
* jumping when touch starts
* teleporting when the finger first touches the screen

Handle relevant multi-touch edge cases.

⸻

12. AUTO FIRE

The player’s weapon automatically fires.

Example:

5–10 shots/sec depending on weapon

Build the weapon system in a modular way.

Potential future weapon types:

* laser
* spread shot
* plasma
* missiles
* beam
* piercing shot
* chain lightning

Do not implement everything immediately.

Start with one simple primary weapon.

⸻

13. CO-OP DESIGN

Multiplayer should not simply be four people playing independently on the same screen.

Create mechanics that make co-op meaningful.

Potential ideas to evaluate:

* revive system
* shared lives
* proximity buffs
* combo multiplier
* synchronized pickups
* player roles
* assist mechanics
* team ultimate
* boss mechanics requiring positioning

However, keep the first version relatively simple.

Prioritize:

1. multiplayer movement
2. enemies
3. damage
4. boss
5. death/revive
6. progression

⸻

14. DEATH / REVIVE

Design a co-op death system.

Possible approach:

When a player reaches 0 HP:

* the ship explodes
* the player becomes temporarily disabled
* teammates may potentially revive them
* or the player respawns after a delay with a penalty

Do not allow four-player co-op to trivialize the game.

Boss HP and difficulty can scale with player count.

Example starting values:

1 player = 1.0x

2 players = approximately 1.6x

3 players = approximately 2.1x

4 players = approximately 2.5x

These are only starting points.

Balance based on gameplay testing rather than treating these values as final.

⸻

15. RETRO + MODERN VISUAL STYLE

The game should combine:

RETRO

* arcade
* 80s/90s inspiration
* pixel-art influence
* CRT inspiration
* subtle scanlines
* retro HUD
* arcade typography
* nostalgic sound effects
* classic explosion feel

MODERN

* smooth animations
* modern shaders
* particles
* bloom
* glow
* screen shake
* impact frames
* distortion
* polished transitions
* responsive UI
* high-quality motion design

The goal is:

a nostalgic retro arcade game built with modern polish

Not:

a cheap pixel game

And not:

generic neon cyberpunk

⸻

16. VISUAL JUICE

Gameplay should feel impactful.

When a bullet hits:

* hit flash
* particles
* subtle screen shake
* hit sound
* clear enemy damage feedback

When an asteroid explodes:

* fragments
* particles
* flash
* explosion
* subtle camera shake

When a boss receives heavy damage:

* stronger hit feedback
* screen effects
* layered sound effects

However, keep the game readable.

Players must always be able to clearly see enemy bullets.

Gameplay readability is more important than visual chaos.

⸻

17. GAME WORLD

The player constantly flies upward.

The background should create the illusion of forward movement.

Use multiple layers, for example:

* distant stars
* closer stars
* nebula
* planets
* debris
* foreground particles

Use parallax.

Future levels could include:

1. Earth’s Orbit
2. Asteroid Belt
3. Red Nebula
4. Abandoned Space Station
5. Ice Moon
6. Alien Sector
7. Black Hole
8. Enemy Homeworld

Make the level architecture data-driven so new levels can easily be added.

⸻

18. LEVEL MAP

After completing a level, the player returns to a world map.

Take inspiration from the feeling of Cuphead’s overworld:

* levels are represented as destinations
* players choose destinations to play
* new areas unlock when bosses are defeated

For this game, use a:

GALAXY MAP

Example:

Earth
  ↓
Moon
  ↓
Asteroid Belt
 ↙   ↓   ↘
Station  Nebula
    ↓
   Boss

The player should feel like they are traveling through the galaxy.

Do not make progression just:

LEVEL 1

LEVEL 2

LEVEL 3

Make progression visual.

⸻

19. MENU

Example game flow:

Splash Screen
↓
Main Menu
PLAY
SETTINGS
↓
Mode Select
SOLO
MULTIPLAYER
↓
Multiplayer
CREATE GAME
JOIN GAME
↓
Lobby
↓
Galaxy Map
↓
Level
↓
Results
↓
Galaxy Map

The design should match my existing Duel projects.

⸻

20. LOBBY

The lobby should show:

ROOM CODE
AB7K

Players:

🚀 Hugo — READY
🚀 Player 2 — READY
🚀 Player 3 — NOT READY

Host:

START MISSION

It should also be easy to share:

* room code
* optional invite URL

Example:

/join/AB7K

⸻

21. TECH STACK

First inspect the current workspace and repository structure.

If there are no strong reasons to choose something else, I recommend approximately:

Frontend / Game

* TypeScript
* React for app/menu/lobby
* Phaser 3 for 2D gameplay
* Vite

Server

* Node.js
* TypeScript
* WebSocket-based real-time server
* for example Socket.IO or ws, depending on the needs

Shared package

* TypeScript types
* network messages
* game constants
* shared schemas

Possible monorepo structure:

space-game/
  apps/
    client/
    server/
  packages/
    shared/
    game-core/
  docs/

However:

DO NOT change the project architecture just to follow this example.

Inspect what already exists first.

⸻

22. GAME ENGINE

For gameplay rendering, Phaser is recommended unless the existing project strongly suggests otherwise.

Use React for:

* menus
* lobby
* settings
* galaxy map UI where appropriate
* account/UI systems

Use Phaser for:

* gameplay
* entities
* collisions
* bullets
* enemies
* bosses
* particles
* camera
* touch input

Do not attempt to render bullet-hell gameplay using React DOM elements.

⸻

23. GAME ARCHITECTURE

Avoid one massive Game.ts file.

Split the game into focused systems.

Example:

game/
  scenes/
    BootScene
    MenuScene
    GameScene
    BossScene
  entities/
    Player
    Enemy
    Asteroid
    Projectile
    Boss
  systems/
    InputSystem
    WeaponSystem
    SpawnSystem
    CollisionSystem
    DamageSystem
    NetworkSystem
    AudioSystem
    EffectsSystem
  levels/
    level-01.ts
    level-02.ts
  bosses/
    boss-01/
  networking/
    messages.ts
    interpolation.ts
    prediction.ts

Prefer composition over deep inheritance trees.

⸻

24. DATA-DRIVEN LEVELS

I should be able to create additional levels easily.

Do not hardcode the entire level progression inside GameScene.

For example:

{
  id: "earth-orbit",
  duration: ...,
  sections: [
    {
      type: "asteroid-wave",
      ...
    },
    {
      type: "enemy-wave",
      ...
    },
    {
      type: "boss",
      boss: "guardian-01"
    }
  ]
}

Design the exact interfaces yourself.

⸻

25. BOSS SYSTEM

Bosses should be modular.

Example:

Boss
 ├── Phase 1
 │   ├── Pattern A
 │   └── Pattern B
 │
 ├── Phase 2
 │   ├── Pattern C
 │   └── Pattern D
 │
 └── Phase 3
     └── Enrage

Attack patterns should be reusable.

Examples:

* radial bullets
* aimed bursts
* spiral patterns
* sweeping laser
* missiles
* charge attack
* asteroid summon
* enemy summon

The boss system should support clear telegraphing before dangerous attacks.

⸻

26. COLLISION

Plan collision layers clearly.

Example:

Player
Enemy
PlayerProjectile
EnemyProjectile
Environment
Pickup

Avoid unnecessary collision checks.

Optimize high projectile counts using:

* pooling
* object reuse
* spatial partitioning where relevant

Do not create thousands of garbage-collected objects every second.

Mobile performance matters.

⸻

27. PERFORMANCE

Target:

60 FPS on reasonably modern phones

Be especially careful with:

* particle count
* bloom
* shader usage
* DOM overlays
* projectile count
* garbage collection
* network serialization
* physics

Profile before performing micro-optimizations.

⸻

28. AUDIO

Plan support for:

* background music
* boss music
* shooting
* explosions
* hit sounds
* UI sounds
* low-health warnings
* boss transitions

Audio settings should include:

* Master
* Music
* SFX

Remember browser autoplay restrictions.

The AudioContext may need to start after the player’s first interaction.

⸻

29. MOBILE UX

Mobile is the primary platform.

Avoid:

* hover-only interactions
* buttons that are too small
* desktop-centric menus
* text that is too small
* browser scrolling during gameplay
* pull-to-refresh during gameplay
* accidental text selection
* double-tap zoom
* unwanted browser gestures

The gameplay area should capture touch events correctly.

⸻

30. LOCAL DEVELOPMENT

I should be able to run everything locally on my computer.

Prefer a simple startup process.

For example:

npm install
npm run dev

Or the equivalent workspace command.

It should start:

* frontend
* multiplayer server

Show clearly:

Client:
http://localhost:5173
Server:
ws://localhost:3001

Use .env for configuration.

Example:

VITE_GAME_SERVER_URL=ws://localhost:3001

⸻

31. TESTING WITH MULTIPLE PHONES LOCALLY

I want to test the game using devices such as:

* computer
* iPhone
* Android phone
* another mobile device

on the same Wi-Fi network.

The development server must therefore be able to bind to:

0.0.0.0

not only:

localhost

If practical, clearly display the computer’s LAN IP when starting development.

Example:

Local:
http://localhost:5173
Network:
http://192.168.1.45:5173

⸻

32. PUBLIC / CLOUD SHARING

I also want to easily expose my local development version so friends can test it over the internet.

Design the application so it works correctly with HTTPS/WSS and reverse proxies/tunnels.

It should be compatible with services such as:

* Cloudflare Tunnel
* similar secure tunnel solutions
* normal cloud deployment later

WebSocket connections must:

* work through reverse proxies
* support wss://
* not have localhost hardcoded
* derive the server URL from environment/configuration

I want to be able to send a normal URL to a friend, let them open it on their phone, and play.

⸻

33. ROOM LIFECYCLE

Implement clear room states.

Example:

WAITING
READY
STARTING
PLAYING
RESULTS
CLOSED

The server owns room state.

Handle:

* host disconnect
* player disconnect
* reconnect
* duplicate player IDs
* game already started
* room full
* invalid room
* room timeout
* cleanup

⸻

34. NETWORK PROTOCOL

Network messages should be typed.

Avoid patterns like:

socket.emit("thing", anything)

throughout the codebase.

Centralize network message definitions.

Example:

Client → Server

room:create
room:join
player:ready
game:start
player:input
player:respawn

Server → Client

room:state
game:start
game:snapshot
entity:spawn
entity:destroy
player:damage
boss:phase
game:complete

Design this properly before implementation.

⸻

35. SECURITY / VALIDATION

Client input should never automatically be trusted.

The server should validate:

* room codes
* player IDs
* movement
* message shapes
* game state transitions

Use schema validation where appropriate.

A player should not be able to send something like:

bossHealth = 0

and instantly win the game.

⸻

36. DEVELOPMENT PHILOSOPHY

Do NOT build the entire game in one giant step.

Work iteratively.

After every major step:

1. verify the implementation
2. run the relevant build
3. run tests
4. check for TypeScript errors
5. check runtime errors
6. fix problems before continuing

Do not leave the project in a broken intermediate state.

⸻

37. IMPLEMENTATION ORDER

Work approximately in this order.

MILESTONE 1 — PROJECT ANALYSIS

* inspect music-duel
* inspect world-duel
* analyze the current stack
* identify the reusable design system
* identify coding conventions
* propose the architecture

Write a short implementation plan before changing code.

⸻

MILESTONE 2 — GAME SHELL

Create:

* main menu
* solo/multiplayer selection
* responsive portrait game container
* basic design based on the Duel projects

⸻

MILESTONE 3 — PLAYER PROTOTYPE

Implement:

* player spaceship
* touch movement
* finger offset
* desktop mouse development mode
* automatic shooting
* basic starfield

At this point, controlling the ship should already feel good.

⸻

MILESTONE 4 — ASTEROIDS

Implement:

* asteroid spawning
* HP
* shooting
* collisions
* explosions
* score

⸻

MILESTONE 5 — ENEMIES

Implement:

* enemy system
* wave definitions
* movement patterns
* enemy shooting
* damage
* player HP

⸻

MILESTONE 6 — FIRST BOSS

Create the first real boss with:

* at least 3 attack patterns
* at least 2 phases
* health bar
* telegraphing
* death animation

The boss should be difficult but fair.

⸻

MILESTONE 7 — LEVEL COMPLETE

Implement:

* game results
* score
* level completion
* next-level unlock

⸻

MILESTONE 8 — GALAXY MAP

Implement:

* progression map
* destinations
* locked/unlocked levels
* visually connected nodes

⸻

MILESTONE 9 — MULTIPLAYER LOBBY

Implement:

* create room
* room code
* join
* players
* ready state
* host
* start

⸻

MILESTONE 10 — REAL-TIME MULTIPLAYER

Implement:

* authoritative game server
* synchronized player movement
* synchronized enemies
* synchronized damage
* synchronized boss
* interpolation
* prediction where appropriate
* basic reconnect handling

⸻

MILESTONE 11 — POLISH

Implement:

* particles
* hit effects
* screen shake
* improved audio
* boss transitions
* animations
* UI polish

⸻

38. MVP

Do not try to build ten levels immediately.

The first real MVP should contain:

* functioning portrait mobile gameplay
* touch-controlled spaceship
* automatic shooting
* asteroid phase
* enemy phase
* at least 2–3 enemy types
* one boss
* player death
* fast retry
* solo
* multiplayer
* lobby
* real-time synchronization
* level completion
* simple galaxy map
* local development
* ability to expose the game externally through a tunnel

ONE excellent level is more important than ten unfinished levels.

⸻

39. FIRST LEVEL

Use the working title:

SECTOR 01 — ORBITAL GRAVEYARD

Theme:

The players leave a planet and fly through an area filled with destroyed satellites, space debris, and asteroids.

Section 1

Calm introduction.

Stars and a planet in the background.

A small number of asteroids.

⸻

Section 2

Asteroid density increases.

Larger asteroids require more hits.

⸻

Section 3

Enemy fighters appear.

Simple formations.

⸻

Section 4

More advanced enemies begin shooting.

⸻

Section 5

A short, intense combat wave.

⸻

Boss

Working title:

THE ORBITAL WARDEN

A massive old automated defense satellite / combat station.

Possible boss design:

Phase 1

* aimed cannon bursts
* rotating turrets

Phase 2

* radial bullet patterns
* missile launchers

Phase 3

The boss becomes damaged and enraged.

* faster patterns
* sweeping laser
* increased pressure

Design the boss so players can learn the attacks over repeated attempts.

⸻

40. ART DIRECTION

Develop a consistent art direction combining the design language of my Duel projects with:

* arcade space
* retro sci-fi
* CRT aesthetics
* old arcade cabinets
* pixel-art influence
* modern motion graphics
* modern lighting
* subtle neon
* chunky arcade UI
* dramatic bosses

Avoid excessive generic AI-looking visuals.

Do not make every UI element glow.

Contrast and readability are more important.

⸻

41. PLACEHOLDER ASSETS

We probably will not have final assets at the beginning.

Use simple placeholders where necessary.

However, structure the project so assets can easily be replaced later.

Example:

assets/
  ships/
  enemies/
  bosses/
  projectiles/
  backgrounds/
  effects/
  audio/
  ui/

Do NOT create hundreds of unnecessary assets during prototyping.

⸻

42. DEBUG TOOLS

Add development-only debug tools where useful.

Examples:

* FPS
* ping
* server tick
* client tick
* number of entities
* current level section
* boss phase
* invincibility toggle
* spawn boss
* skip section
* reset level

Debug UI should never be enabled automatically in production.

⸻

43. TESTING

Write tests for gameplay logic where practical.

Prioritize testing:

* level progression
* damage calculations
* boss state transitions
* room logic
* multiplayer protocol
* reconnect behavior
* validation

Do not excessively unit-test rendering code.

⸻

44. CODE QUALITY

Requirements:

* TypeScript strict mode
* clear interfaces
* small focused modules
* avoid any
* avoid magic numbers
* use constants/configuration where appropriate
* comments should explain WHY, not obvious code
* remove dead code
* avoid huge files without a good reason

Be pragmatic.

Overengineering is just as bad as poor architecture.

⸻

45. IMPORTANT RULES WHILE WORKING

Do NOT:

* rewrite the entire project without a good reason
* change the package manager without a good reason
* change the tech stack before inspecting the project
* install large dependencies for trivial functionality
* create multiple competing implementations simultaneously
* leave old and new versions running in parallel unnecessarily
* fill the project with mock data instead of real functionality
* claim something works without verifying it

⸻

46. WHEN YOU ARE UNCERTAIN

Make a reasonable senior engineering decision and continue.

Only ask me when the decision:

* radically changes the product
* risks data loss
* requires credentials
* requires a paid external service
* presents two fundamentally different product directions

Small implementation details should be solved independently.

⸻

47. YOUR FIRST TASK

DO NOT START BY IMPLEMENTING EVERYTHING.

First do the following:

1. Inspect the repository/workspace.
2. Find music-duel and world-duel.
3. Analyze their design and project structure.
4. Identify which parts can be reused.
5. Determine what frontend/backend stack is already being used.
6. Propose the final architecture for the new game.
7. Explain how real-time multiplayer should work.
8. Explain how touch controls should be implemented.
9. Explain how the project can run:
    * locally on my computer
    * from mobile devices on the same local network
    * externally through a secure tunnel / cloud sharing solution
10. Create a concrete implementation plan split into small milestones.

Present the plan first.

After the plan, you may begin implementing Milestone 1 / Milestone 2 if the repository and task are sufficiently clear.

Continue working incrementally and verify the project continuously.

⸻

FINAL GOAL

The final product should feel like:

A difficult, modern retro-arcade space shooter that can be opened directly on a phone and played with friends in real time.

The core gameplay loop should be:

touch → dodge → auto-shoot → survive → learn patterns → destroy boss → unlock next destination

The game should be easy to understand the first time someone opens it, but difficult to master.

It should feel like a real game, not a technical multiplayer demo.
