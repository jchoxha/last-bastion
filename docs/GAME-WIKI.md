# Last Bastion field guide

## Start here

A living frontier built around exploration, character growth, and settlements that need people to function. This guide describes the current playable implementation, with separate design notes for maintaining it.

### Your first expedition

- Choose New game, optionally enter a seed, then choose Knight, Ranger, or Pyromancer. A blank seed creates a random world.
- Begin at a secured friendly portal with a cleared courtyard, a homestead, walls, a courtyard gate, and two arrow towers. The usual starting crew is two laborers, one knight, and two ranger operators.
- Your starting stock is 260 gold, 140 wood, 100 stone, 50 ore, and one portal kit. The player starts at level 1 with only their basic ability unlocked.
- Explore nearby terrain, defeat monsters for gold and experience, and return to manage your residents. Use E near people and structures to see available actions.
- Build housing and training facilities before expanding your defense network. A finished tower still needs the correct operator.
- Place another portal, prepare its defenses, and begin its five-wave defense through its interaction menu. Destroy hostile portals to stop their reinforcements.

### What progress means

Progress belongs to the saved run: character levels, learned talents, resources, structures, residents, explored terrain, and landmark rewards. The current frontier continues after securing claims; the original prototype's four-claim victory goal is not the current settlement loop. Losing every friendly portal ends the run. There is no implemented multiplayer or account-wide character progression.

### Reading this guide

Numbers are baseline values before relics, upgrades, enemy scaling, and saved-run differences. A source link at the end of each chapter identifies where the behavior is implemented. The Maintenance notes chapter explicitly identifies legacy rules and current limitations; those are not promised features.

Sources: [Starting settlement](https://github.com/jchoxha/last-bastion/blob/main/game/settlement.js), [Starting crews](https://github.com/jchoxha/last-bastion/blob/main/game/expedition-ai.js), [Campaign lifecycle](https://github.com/jchoxha/last-bastion/blob/main/game/frontier-war.js).

## Controls and camera

The game is designed for keyboard and mouse. This wiki adapts to a phone-sized screen; the game does not yet have a complete touch control scheme.

### Essential controls

| Input                         | Current action                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| W / A / S / D                 | Move; third-person A / D turn unless right mouse is held                               |
| Shift                         | Sprint; climb faster while attached to a wall                                          |
| Left mouse drag               | Orbit freely around the character in third person without changing its facing          |
| Right mouse drag              | Turn the third-person camera and character together; rotate the overhead camera        |
| Hold both mouse buttons       | Move forward in third person                                                           |
| Mouse wheel                   | Adjust camera distance                                                                 |
| V                             | Cycle overhead, third person, and first person                                         |
| Space                         | Jump; hold Space + W against a climbable wall to climb                                 |
| E                             | Interact with the nearest or aimed eligible object; close the interaction menu         |
| 1–6                           | Select an unlocked ability; press the selected slot again to cast                      |
| Left mouse                    | Cast the selected move, confirm an area, or place/help build according to context      |
| Right-click an ability button | Toggle automatic use for that ability                                                  |
| Tab                           | Cycle targets                                                                          |
| B                             | Enter or leave build mode                                                              |
| F                             | Place a blueprint in build mode; help a nearby aimed construction plan                 |
| R / T                         | With wall stairs selected: rotate wall side / reverse ascent                           |
| N                             | Open talents                                                                           |
| Alt, held                     | Release first-person mouse capture to use the interface                                |
| Escape                        | Cancel building/targeting and close interaction UI; use Menu or Pause to pause the run |
| F2                            | Open testing tools                                                                     |

### Aiming and interaction

The active move appears on the action bar. Target selection and automatic-use checkboxes are separate from moving the character. A target can be locked from its portrait menu. A selected enemy still needs to be in range; projectiles and sight checks respect physical terrain and scenery. Automatic abilities are attempted only when unlocked and ready.

First-person mouse capture may depend on browser permissions. Clicking back into the game recaptures the cursor when available. Third person follows World of Warcraft's core camera convention: left-drag is free look, right-drag steers the character with the camera, both buttons move forward, A/D turn without right mouse and strafe while right mouse is held. A click without a drag still selects or casts. The third-person camera shortens its distance when terrain or props obstruct it. In overhead view, the pointer is used for ground aiming. A menu that merely opens a cursor is not necessarily a simulation pause.

Sources: [Current input and targeting](https://github.com/jchoxha/last-bastion/blob/main/game/controls.js), [Talent and construction input](https://github.com/jchoxha/last-bastion/blob/main/game/frontier-ui.js), [Stair controls](https://github.com/jchoxha/last-bastion/blob/main/game/expedition-geometry.js).

## World and traversal

New games use connected plateaus with natural ramps, rounded cliff rims, slight surface variation, and a 2× terrain scale. Earlier saves retain their saved terrain mode and scale.

### Terrain dimensions and growth

The initial map is 64 × 64 tiles. At the current default scale, a tile is 12 metres wide and one elevation level is 6 metres high. The seed controls generation; hilliness and tree settings exist in the engine but the current new-world menu exposes only the seed.

Approaching the edge requests another 16 tiles of width and depth, adding an eight-tile border around the previous world. Existing actors and terrain remain in their world positions while cell indices shift. Plateau and rolling worlds have no configured terminal size. They still consume more memory and produce larger saves as exploration continues; this is not unlimited hardware capacity.

The connected terrain graph supplies ramps between levels. Grass, bushes, flowers, meadow/desert/frost/wetland coloring, and a procedural sky provide visual variety. Biomes currently affect presentation and foliage density; do not assume temperature, thirst, farming seasons, or survival meters.

### Jumping, climbing, and stairs

- Natural ramps provide continuous walkable slopes. A diagonal corner where two high platforms touch does not count as a supported bridge.
- Hold Space + W at a cliff or suitable constructed wall to attach. W climbs up, S descends, and A / D traverse sideways. Release Space to drop.
- Climbing uses a 100-point stamina pool. Holding position costs 4 per second; moving costs 18, or 32 while using Shift. Upward speed is 2.1 metres/second, or 3.4 with Shift.
- A grounded rest restores 25 stamina per second after the recovery delay. Exhaustion releases the wall; regain stamina and release Space before trying again.
- Climbing mantles onto an unblocked upper landing. A blocked landing or unsupported section prevents movement.
- Build Wall stairs for a reusable route up one terrain level. They run alongside a cliff and preserve the tile's ground surface. Natural ramps and stairs are usable by NPC navigation; NPCs do not use the player's stamina-climbing mechanic.

### Exploration landmarks

World generation attempts to place suitable landmarks on clear terrain. More regional landmarks can appear as you explore. Placement can be skipped when no valid clearing exists; a particular count is not guaranteed for every seed.

Sources: [World generation](https://github.com/jchoxha/last-bastion/blob/main/lib/world.ts), [Expansion trigger](https://github.com/jchoxha/last-bastion/blob/main/game/integration.js), [Plateau surfaces](https://github.com/jchoxha/last-bastion/blob/main/game/rounded-plateaus.js), [Climbing](https://github.com/jchoxha/last-bastion/blob/main/game/traversal-performance.js), [Regional discovery](https://github.com/jchoxha/last-bastion/blob/main/game/rolling-world.js).

## Classes and abilities

Each class has six action-bar slots. Slot 1 is available immediately; the remaining five are learned through the talent tree. Cooldowns below are base seconds, and distances are nominal metres. Damage depends on the move, character statistics, and active modifiers.

### Starting class statistics

| Class      | Health | Melee stat | Ranged stat | Movement speed | Role                                  |
| ---------- | ------ | ---------- | ----------- | -------------- | ------------------------------------- |
| Knight     | 130    | 20         | 6           | 6.6            | Close-range control and protection    |
| Ranger     | 85     | 9          | 15          | 7.8            | Mobile ranged attacks and positioning |
| Pyromancer | 95     | 8          | 12          | 6.8            | Burning areas and grouped enemies     |

### Knight moves

| Slot | Move            | Cooldown | Range / area | Behavior                                                                |
| ---- | --------------- | -------- | ------------ | ----------------------------------------------------------------------- |
| 1    | Cleave          | 0.55     | 3            | Frontal melee sweep with knockback                                      |
| 2    | Shield guard    | 8        | Self         | Reduce incoming damage by 80% for 3 seconds                             |
| 3    | Shield bash     | 5        | 4            | Wide strike with strong knockback                                       |
| 4    | Whirlwind       | 8        | 4.5 radius   | Strike the surrounding pack and push it outward                         |
| 5    | Rally           | 18       | Self         | Restore 35 health, capped at maximum                                    |
| 6    | Charging strike | 7        | Up to 8      | Move over 0.4 seconds and hit enemies crossed; terrain stops the charge |

### Ranger moves

| Slot | Move           | Cooldown | Range / area        | Behavior                                                    |
| ---- | -------------- | -------- | ------------------- | ----------------------------------------------------------- |
| 1    | Piercing arrow | 0.65     | 38                  | Arrow can hit multiple aligned enemies                      |
| 2    | Split shot     | 3        | 30                  | Five arrows in a fan                                        |
| 3    | Gust arrow     | 4        | 30                  | Heavy projectile knockback                                  |
| 4    | Snare field    | 9        | 26 cast; 4.5 radius | Seven-second field slows enemies by 70%                     |
| 5    | Steady focus   | 14       | Self                | Piercing arrow and Split shot gain 75% damage for 6 seconds |
| 6    | Evasive roll   | 5        | Up to 6             | Brief evade window; solid terrain blocks travel             |

### Pyromancer moves

| Slot | Move         | Cooldown | Range / area        | Behavior                                                             |
| ---- | ------------ | -------- | ------------------- | -------------------------------------------------------------------- |
| 1    | Firebolt     | 0.8      | 28                  | Explosive fire projectile                                            |
| 2    | Flamethrower | 5        | 7                   | Two-second channel with repeated flame hits and burning              |
| 3    | Blast wave   | 6        | 5 radius            | Outward blast with heavy knockback                                   |
| 4    | Meteor storm | 10       | 28 cast; 4.5 radius | Impact after 1.1 seconds, followed by four seconds of burning ground |
| 5    | Combustion   | 12       | 16 radius           | Detonate remaining burn on nearby burning enemies                    |
| 6    | Cinder blink | 7        | Up to 7             | Move to clear terrain and leave burning ground behind                |

### Combat rules worth knowing

Knockback can move creatures off ledges, and hard landings can damage them. Larger creatures resist displacement; hostile portals and watchtowers remain anchored. Healing cannot exceed maximum health. Abilities cannot be used while dead, paused, building, or choosing a draft reward. The current action bar is not an equipment inventory: weapons are part of the class kit.

Sources: [Class statistics](https://github.com/jchoxha/last-bastion/blob/main/game/last-bastion-original.html), [Final move definitions and effects](https://github.com/jchoxha/last-bastion/blob/main/game/rework.js), [Move descriptions](https://github.com/jchoxha/last-bastion/blob/main/game/portals.js), [Combat and physics](https://github.com/jchoxha/last-bastion/blob/main/game/combat.js).

## Progression and rewards

Character experience, talent choices, and draft rewards are separate progression systems inside the same run.

### Experience and talent branches

The next level costs current level × 35 XP; excess XP carries forward. Each level gives one talent point, adds 5 maximum health, and heals up to 20 health. A choice costs one point. Branch tiers require levels 2, 4, and 6 and the previous node in that branch. You can mix branches.

| Class      | First branch: tiers 1 / 2 / 3                         | Second branch: tiers 1 / 2 / 3                             |
| ---------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| Knight     | Vanguard: Shield guard / Whirlwind / Rally            | Battle captain: Shield bash / Charging strike / Unyielding |
| Ranger     | Sharpshooter: Split shot / Snare field / Steady focus | Pathfinder: Gust arrow / Evasive roll / Quickdraw          |
| Pyromancer | Inferno: Flamethrower / Meteor storm / Combustion     | Spellweaver: Blast wave / Cinder blink / Kindled           |

Unyielding adds 30 maximum and current health. Quickdraw multiplies successful ability cooldowns by 0.8. Kindled increases the ranged statistic used while casting by 20%; its label says spell damage, but it is not a blanket multiplier on every damage path.

Typical kill XP is 8; Stonehide Brutes give 18 and Siege Lords give 80. Securing a claim gives 70 XP and 80 gold. Ruins and dungeon caches grant their own rewards. Defeated enemies also pay gold based on species and modifiers.

### Draft upgrades

Draft screens offer choices and a skip action; rerolling costs 15 gold. These upgrades are distinct from spending talent points. The prototype upgrade pool still contains some legacy entries, so consult Maintenance notes for effects that no longer reach the current combat path.

| Upgrade        | Effect represented in the upgrade data                              |
| -------------- | ------------------------------------------------------------------- |
| Sharper Arrows | Arrow tower damage multiplier × 1.25                                |
| Hotter Coals   | Brazier multiplier × 1.3                                            |
| Deeper Frost   | Add 0.12 to the frost modifier                                      |
| Heavy Bolts    | Ballista multiplier × 1.3                                           |
| Veteran Guards | Legacy guard multiplier × 1.3; not trained resident damage          |
| Barbed Spikes  | Legacy spike multiplier × 1.35; current resettable trap bypasses it |
| Vigor          | +30 maximum health and a full heal                                  |
| Swift Blade    | +6 melee statistic                                                  |
| Steady Aim     | +5 ranged statistic                                                 |
| Haste          | Movement × 1.15; basic attack cooldown statistics × 0.85            |
| Treasury       | +60 gold immediately                                                |

### Relic reference

Relics are named run modifiers in the draft pool. The following table distinguishes useful current hooks from descriptions inherited from older systems; it does not promise every legacy description works unchanged.

| Relic            | Rule or current caveat                                                                 |
| ---------------- | -------------------------------------------------------------------------------------- |
| Ember Heart      | Brazier synergy: each brazier adds 30% to the brazier heat factor                      |
| Miser's Ledger   | Wave reward interest: 10% of gold, capped at 60                                        |
| Twin Springs     | Legacy double-spike effect; current resettable spike path bypasses it                  |
| Frostbite        | Slowed enemies take 45% more damage through the shared damage function                 |
| Bloodlust        | Melee hits handled by the basic melee path heal 3 per hit                              |
| Marksman         | Arrow towers gain 2 range and 20% damage                                               |
| Bounty Board     | +2 gold per kill                                                                       |
| Iron Core        | Legacy portal health/healing hooks; later portal creation resets base health to 400    |
| Overclock        | Legacy tower firing cadence × 0.75; resettable traps do not use that timer             |
| Wind Bolts       | Ballista projectile piercing                                                           |
| Warcry           | Legacy guard-tower bonus; not a trained-resident aura                                  |
| Glass Cannon     | Player damage modifier and a 30-health maximum penalty                                 |
| Echo Stone       | Legacy tower firing path has a 20% repeat-fire chance                                  |
| Pitch Kindling   | Legacy tar/burn interaction; current resettable tar does not create the old tar marker |
| Guild Discount   | Gold construction cost × 0.8; material recipes are unchanged                           |
| Second Wind      | Immediate player revival rather than the usual death delay and penalty                 |
| Surveyor's Chain | New portal claim radius gains two tiles                                                |
| Salvage Rights   | Old secure-claim refund is bypassed by the current settlement secure function          |

Sources: [Talents and XP](https://github.com/jchoxha/last-bastion/blob/main/game/frontier-ui.js), [Draft and relic hooks](https://github.com/jchoxha/last-bastion/blob/main/game/last-bastion-original.html), [Current trap path](https://github.com/jchoxha/last-bastion/blob/main/game/expedition-ai.js), [Current securing reward](https://github.com/jchoxha/last-bastion/blob/main/game/settlement.js).

## Resources and economy

Wood, stone, ore, and gold are shared settlement resources. In source files, wood is named `logs`. A worker's carried cargo is not available in shared stock until delivered.

### Gathering and production

Environmental trees supply wood; rocks become stone or ore nodes. Claiming terrain registers existing natural resources instead of creating artificial resource piles. Trees hold 24 units, rocks 32. Exhausted registered nodes regrow after 300 seconds of simulation time. Trees deliberately cleared from the starter courtyard and approach are removed from the work list.

Hand harvesting takes up to 2 units per click with a one-second cooldown. Laborers harvest up to 4 units after 3 seconds of work, then deliver to their portal. Travel, obstacles, duty priorities, and returning with cargo affect actual throughput.

| Production building | Required worker                  | Base yield after 10 seconds of on-site work |
| ------------------- | -------------------------------- | ------------------------------------------- |
| Tree farm           | Laborer with wood duty enabled   | 3 wood                                      |
| Mine                | Laborer with mining duty enabled | 1 ore and 2 stone                           |

Staffed production does not consume natural nodes. Assigning a worker does not teleport them to the building: they must reach it. Saved tool upgrades accelerate gathering/production work by a factor of 1 + 0.3 × tool level. The current settlement browser no longer exposes the older research controls; see Maintenance notes.

### Portal kits and trade

Crafting a portal kit costs 80 gold, 40 wood, 30 stone, and 20 ore. Use a friendly portal's interaction menu to craft. Placing a portal consumes one kit. Kits can also be bought from merchants or found through exploration rewards.

| Merchant item | Buy price | Sell return per unit |
| ------------- | --------- | -------------------- |
| Wood          | 2 gold    | 1 gold               |
| Stone         | 3 gold    | 1 gold               |
| Ore           | 6 gold    | 3 gold               |
| Portal kit    | 180 gold  | 90 gold              |

Trades require a living merchant within 8 metres, enough stock, and enough gold or resources. Merchants carry finite stock; selling replenishes that stock. Traveling caravans have escorts and a gold banner. Independent villages also have settled merchants.

Sources: [Gathering and sales](https://github.com/jchoxha/last-bastion/blob/main/game/controls.js), [Natural nodes and kits](https://github.com/jchoxha/last-bastion/blob/main/game/settlement.js), [Worker production](https://github.com/jchoxha/last-bastion/blob/main/game/frontier-npcs.js), [Trading](https://github.com/jchoxha/last-bastion/blob/main/game/frontier-war.js).

## Building catalog

Press B, choose a category and blueprint, point at a valid location, and use left mouse or F. Most purchases create unfinished plans; they do not immediately function.

### Prices and construction

The gold price is round(base cost × discount × (1 + 0.12 × current placed count of that building type)). Guild Discount changes the discount factor to 0.8; otherwise it is 1. Material recipes do not rise with placed count. Starter buildings already count toward later prices. The tables show base gold, fixed materials, and required work units, not guaranteed elapsed completion times.

Laborers with building enabled walk to plans and contribute work. Several workers and player help can speed completion. From within 4 metres of the construction interaction point, each player tap contributes 0.65 work with a 0.16-second cooldown. Holding the key is not automatic construction. Plans appear translucent until finished.

### Defenses

| Building     | Base gold | Wood | Stone | Ore | Work | Operation                                                 |
| ------------ | --------- | ---- | ----- | --- | ---- | --------------------------------------------------------- |
| Arrow tower  | 40        | 8    | 2     | 0   | 18   | Stationed ranger; 7m base range                           |
| Brazier      | 55        | 0    | 8     | 2   | 18   | Stationed pyromancer; 4.2m base range                     |
| Frost shrine | 50        | 0    | 8     | 3   | 18   | Stationed pyromancer; 4.5m base range                     |
| Ballista     | 95        | 14   | 0     | 4   | 18   | Stationed ranger; 11m base range                          |
| Gale pylon   | 90        | 0    | 10    | 5   | 18   | Stationed pyromancer; 9m base range                       |
| Spike trap   | 30        | 6    | 0     | 0   | 18   | One trigger, then reset; 7 base damage per affected enemy |
| Tar pit      | 35        | 0    | 5     | 0   | 18   | One trigger, then reset; 75% slow for 6 seconds           |
| Barbed wire  | 25        | 2    | 0     | 5   | 12   | Passive edge hazard; no operator                          |

### Structures, housing, and work buildings

| Building       | Base gold | Wood | Stone | Ore | Work    | Purpose                                             |
| -------------- | --------- | ---- | ----- | --- | ------- | --------------------------------------------------- |
| Wall           | 20        | 4    | 1     | 0   | 10      | Blocks a shared tile edge                           |
| Courtyard gate | 35        | 8    | 3     | 2   | 16      | Friendly proximity opens a passage                  |
| Wall stairs    | 30        | 10   | 6     | 0   | 30      | Connect a lower tile to a level above               |
| Homestead      | 65        | 24   | 10    | 0   | 24      | Six additional beds and laborer recruitment         |
| Warrior lodge  | 90        | 25   | 20    | 8   | 35      | Train a knight                                      |
| Ranger school  | 90        | 35   | 10    | 5   | 35      | Train a ranger                                      |
| Ember academy  | 120       | 15   | 30    | 15  | 45      | Train a pyromancer                                  |
| Mine           | 85        | 20   | 15    | 5   | 30      | Staffed ore and stone production                    |
| Tree farm      | 75        | 20   | 8     | 0   | 28      | Staffed wood production                             |
| Portal gate    | 1 kit     | —    | —     | —   | Instant | New claim, travel connection, and defense objective |

### Placement and refunds

Ordinary buildings use free placement snapped to quarter-metre increments, subject to physical footprints and ground checks. Walls and courtyard gates use tile edges; either side of a shared edge refers to the same position. Multiple edges of a tile can be occupied independently. Wire offers Ground, On wall, and In front layers; the latter two require a wall or gate on that edge.

Wall stairs need suitable neighboring terrain one level higher and clear flight/landing space. R chooses the wall side and T reverses ascent. Portal placement has its own claim and route validation. Read the placement message when a plan is blocked; having enough resources is only one requirement.

Sell a building through its interaction menu to recover rounded 60% of its paid gold and floored 60% of each recorded material cost. Enemy destruction is not a sale. Lost structures stop blocking or supporting travel after collision data is rebuilt.

Sources: [Base defenses and cost formula](https://github.com/jchoxha/last-bastion/blob/main/game/last-bastion-original.html), [Recipes](https://github.com/jchoxha/last-bastion/blob/main/game/portals.js), [Settlement buildings](https://github.com/jchoxha/last-bastion/blob/main/game/settlement.js), [Edge structures](https://github.com/jchoxha/last-bastion/blob/main/game/frontier-structures.js), [Stairs](https://github.com/jchoxha/last-bastion/blob/main/game/expedition-geometry.js).

## Residents and staffing

Residents are persistent people with a home portal, health, role, current order, and work state. Housing capacity and gold determine recruitment; a portal does not summon unlimited new workers.

### Recruitment and training

Each portal has two base resident slots. Every completed homestead adds six. A homestead can recruit a laborer every 90 seconds for 15 gold, provided recruitment is not paused, the home portal is alive and secured, there is a free bed, and an arrival point is available.

A training building converts an existing living laborer. Training costs 35 gold and 5 ore and requires 30 seconds at the completed building. The chosen worker can be busy or following you; carried cargo is delivered first. Giving another order cancels training and refunds the uncompleted fraction of the training cost, rounded down. Knights finish with 120 health; trained rangers and pyromancers finish with 85.

### Orders and priorities

Use E near a resident to order Follow me, Patrol home portal, Guard here, Guard a position/object, or Work using priorities. Work duties have independent Building, Mining, Wood collecting, and Combat checkboxes. Enabled tasks use High, Normal, or Low priority, with distance breaking ties. Disabling a duty prevents that work; it is different from making it low priority.

Guard pursuit choices are 6, 12, 20, or 30 metres. Guards return to their anchor when no qualifying target remains. Followers maintain space around you. Trained residents default to patrol when they have no other assignment. Laborers below 35% health with a nearby threat retreat toward a courtyard and stop retreating above 80%. Nearby safe home portals heal ordinary residents at 4 health/second; stationed operators use a separate update path.

Blocked workers retry paths, then temporarily skip unreachable destinations. A worker shown as walking has not begun gathering or production yet. Make approach routes and gates usable before treating an idle-looking NPC as a staffing failure.

### Operating defenses and traps

Arrow towers and ballistas need rangers. Braziers, frost shrines, and gale pylons need pyromancers. Assign them through E at the tower. The correct living operator must actually arrive; another command releases the assignment. The starter arrow towers have ranger crews assigned already. A captured arrow tower still needs staffing.

Spike and tar traps trigger on nearby enemies within 2.3 metres, then become spent. Reset a trap from within 4 metres with three interaction taps, or let an eligible laborer with building enabled perform three seconds of reset work. Wire is passive: nearby enemies take 6 damage every 0.75 seconds and receive a 65% slow refreshed for 1.2 seconds.

### Settlement browser and transfers

The Settlement button lists residents and buildings by portal. It is a browser, not unrestricted remote command: its Interact action requires the object to be within 8 metres. Resident transfer uses living portal connections and destination housing. Stand near the destination portal, and return the resident to within 10 metres of their source gate before transferring.

Sources: [Resident simulation](https://github.com/jchoxha/last-bastion/blob/main/game/frontier-npcs.js), [Housing and transfers](https://github.com/jchoxha/last-bastion/blob/main/game/settlement.js), [Operators and traps](https://github.com/jchoxha/last-bastion/blob/main/game/expedition-ai.js), [Orders interface](https://github.com/jchoxha/last-bastion/blob/main/game/frontier-ui.js).

## Portals and sieges

A friendly portal is both a settlement anchor and a combat objective. A courtyard gate is a buildable doorway; it is not the same thing as a portal gate.

### Claim lifecycle

- A new portal consumes a kit and establishes a claim with a normal radius of nine tiles: approximately 108 metres at 2× scale. Surveyor's Chain adds two tiles to new claims.
- Newly founded campaign portals have 400 health. An alive portal immediately suppresses ordinary spawning within 6 metres.
- Pending claims wait for activation; active claims alternate preparation and fighting. Use E within 8 metres of the new portal to begin each defense wave.
- Each claim requires five waves. The starting settlement is already secured.
- Securing a claim suppresses spawning throughout its radius, awards 80 gold and 70 XP, and advances to another pending claim or exploration.

### Attack composition and completion

Scheduled attackers arrive from around the perimeter. The queue contains 32 + 10 × zero-based wave index entries: 32, 42, 52, 62, then 72. Entries are spaced by 0.45 seconds; placement and spawn checks can prevent individual spawns. Each wave also seeks a reachable location for a hostile portal inside the claim. If none can be found, the wave returns to preparation with an explanation.

A siege portal attempts four reinforcements every 8 seconds; an outpost portal uses 12 seconds. Hostile portals continue operating between waves. Early waves can finish after their scheduled assault units are cleared even if portals remain. The fifth wave requires every enemy associated with that claim, including its hostile portals, to be defeated. Destroy portals early instead of allowing reinforcements to accumulate. Clearing a wave heals the player by up to 30% of maximum health and opens a draft reward.

### Protection, travel, and failure

The ward prevents spawning; it does not make residents, walls, or the player invulnerable to enemies that travel into the area. Friendly portals also fire magical attacks at visible nearby enemies. Courtyard gates open when living friendlies approach and can be forced open through their management controls.

Use a living portal's interaction menu to teleport to another living friendly portal. The destination needs a clear arrival point. You can also spend 10 stone to repair 20 portal integrity, capped at its maximum. Portals can be destroyed: their visual ward and protection are removed, and losing the last friendly portal ends the run.

Sources: [Claim creation](https://github.com/jchoxha/last-bastion/blob/main/game/portals.js), [Siege scheduler and portal damage](https://github.com/jchoxha/last-bastion/blob/main/game/frontier-war.js), [Securing and wards](https://github.com/jchoxha/last-bastion/blob/main/game/settlement.js), [Friendly travel](https://github.com/jchoxha/last-bastion/blob/main/game/frontier-npcs.js).

## Enemies and encounters

The wilderness has roaming monsters, hostile portal reinforcements, and settlement defenders. Baseline species statistics below are not a guarantee of a spawned enemy's health: spawn paths apply scaling.

### Bestiary

| Enemy                 | Base health | Base speed | Base hit damage | Base gold | Distinct behavior                                |
| --------------------- | ----------- | ---------- | --------------- | --------- | ------------------------------------------------ |
| Ashborn Grunt         | 32          | 2.3        | 6               | 4         | Basic melee pressure                             |
| Briar Runner          | 18          | 4.3        | 4               | 3         | Fast, fragile attacker                           |
| Stonehide Brute       | 130         | 1.45       | 14              | 13        | Heavy melee; resists knockback                   |
| Hollow Shaman         | 55          | 2.1        | 5               | 11        | Heals nearby mobile allies within 5m             |
| The Siege Lord        | 950         | 1.15       | 25              | 90        | Large, durable elite; strongly resists knockback |
| Dusk Stalker          | 40          | 4.1        | 9               | 6         | Rushes faster when close to its goal             |
| Venom Spitter         | 50          | 2          | 7               | 8         | Ranged attacks apply poison                      |
| Ironhide Bulwark      | 210         | 1.2        | 16              | 18        | Receives 60% of incoming damage                  |
| Cinder Bomber         | 28          | 3.4        | 24              | 7         | Detonates near a target, adding an area hit      |
| Rime Wraith           | 60          | 2.5        | 6               | 9         | Ranged chill reduces player movement             |
| Monster Portal Gate   | 450         | 0          | 0               | 60        | Anchored reinforcement source                    |
| Settlement Watchtower | 180         | 0          | 12              | 25        | Anchored ranged hostile structure                |

### Threat and positioning

Monsters use sight checks to acquire nearby friendlies and can target portals in their territory. Being damaged creates short-lived threat, so an attacked creature can pursue even when its ordinary acquisition check would choose differently. Pursuit is bounded by distance and home position. Closed gates and nearby blocking defenses can be attacked when movement is obstructed.

Spitter poison lasts three seconds and is processed at 2 damage/second through friendly damage rules. Wraith chill lasts two seconds and multiplies player speed by 0.65. Bulwark armor is a shared incoming-damage multiplier. These effects are independent of visual model color.

### Capturing monster settlements

Destroy the settlement's hostile portal and all its mobile defenders, then interact within 8 metres of its former portal position. Surviving watchtower structures convert into friendly buildings in a secured claim. Destroyed buildings are not reconstructed. Preserve structures you want to inherit, and provide operators for captured defenses.

Sources: [Baseline species](https://github.com/jchoxha/last-bastion/blob/main/game/last-bastion-original.html), [Campaign species and encounters](https://github.com/jchoxha/last-bastion/blob/main/game/frontier-war.js), [Threat retention](https://github.com/jchoxha/last-bastion/blob/main/game/expedition-ai.js).

### Creature forge

Open Creature forge from the main menu. **Generate creatures on GitHub** works from the published Pages site with this PC off. Store the Tripo key as the repository Actions secret `TRIPO_API_KEY`; connect the forge with a separate GitHub token restricted to this repository with Actions read/write permission. The GitHub token stays in memory only. Alternatively, use the linked GitHub workflow form with your GitHub login. Only the repository owner can dispatch generation on `main`.

Choose an existing Chimera roster ID (start with `voltfang`), a compatible body plan, form and seed. The default **Card art → low-poly spec → 3D** route preserves or generates a full-bleed flat Chimera illustration, then spends one image task on a neutral, anatomy-separated low-poly specification before modeling. **Text directly to 3D** and **card art directly to 3D** remain labeled experiments because the Voltfang comparison lost either identity, anatomical consistency or full animation compatibility. The worker checks riggability, rigs and animates the result, validates the asset, commits it to `main` and requests Pages deployment. The September 13, 2026 estimates are $0.55 for text, $0.60 for direct image and $0.70 for an existing card plus one specification image, including rig and one provider walk. New concepts also need the card image task. Each new job can incur charges even with a repeated seed. After deployment, click **Refresh published creatures** to inspect the model; normal game startup also loads published assets. The testing menu labels rigs as **full animations** or **provider walk only**.

Follow the GitHub run links for progress. Failed jobs retain task IDs and models as artifacts for 30 days; **Resume saved tasks** reuses them. Do not use GitHub's Re-run jobs action for paid generation; it is blocked. Missing recovery artifacts and uncertain submissions require checking Tripo before starting another job. If generation succeeded but publishing failed, recover the installed-assets artifact without regenerating. Anatomical rig quality still requires inspection.

The optional local **Chimera model pipeline** reads Chimera Cards' definitions and available artwork while keeping all integration code and overrides in Last Bastion. Project-owned card illustrations under `public/creatures/card-art/` can replace an imported portrait. The default route preserves or generates the original flat, outlined Chimera card illustration, derives a second neutral low-poly specification image with separated anatomy, then generates the textured mesh from that specification. The first image is retained as card art; the second is retained as the target portrait and model provenance. The worker requests the matching quadruped or biped rig, adds provider animation and the shared full set only for compatible canine rigs, validates the GLB and installs it in the local game library. Text inference is required only for new concepts; Tripo credentials/credits are required for image/model tasks. Jobs persist while the menu is closed and can resume from saved task IDs after a worker restart.

Installed models load automatically in the preview and game. They become eligible for ordinary wilderness grunt slots and can also be spawned explicitly for testing; scripted enemy selections remain unchanged. When several versions share a creature name, inspection and play-as-creature controls show the generation seed so each model remains identifiable. Technical validation catches malformed assets and body-type mismatches, but cannot certify anatomical joint placement. Inspect the actual walk and skeleton before considering a model finished. The first live Voltfang text-to-3D job was installed on September 13, 2026 with 18,896 triangles and 31 bones. Its mesh was reused after fixing a provider-storage download rejection. On September 14 it received the shared 26-animation canine set; other body plans retain their provider animation until they have a compatible library.

The first live card-to-spec Voltfang test on September 14 preserved the original card illustration and produced a much cleaner low-poly target portrait with four separated legs, level feet, a straight body/head alignment and one isolated tail. Its 1.14 MB textured mesh has 19,684 triangles, one mesh, one material and three textures; Tripo's rig check explicitly accepted it as a quadruped. It is intentionally not installed yet: Tripo stopped before rig creation because the account lacked enough credits, so the saved job contains no skin or animation. [Run 8](https://github.com/jchoxha/last-bastion/actions/runs/34883079449) records the exact provider result and can be resumed from its retained artifact after credits are available without repeating the completed art, specification, mesh or rig-check stages.

The separate **Creature blueprint** tools remain available offline. Choose body types, a family or manifestation, attunements, descriptive subtypes, a size form, combat role and physical body plan. Generate locally produces the same definition for identical inputs; it retains concept text as a description rather than making a detailed mesh. Optional AI authoring in that older section authors names, descriptions and colors only.

Canine and humanoid body plans also have animated procedural prototypes. Inspect rest, idle and walk poses, toggle the skeleton, or export a prototype GLB, rig contract and reference brief. Other plans remain concepts and cannot be spawned. The procedural rigs use rigid weights and are distinct from the generated-model pipeline. Missing generated assets fall back to these procedural visuals; the preview reports load failures. The local worker or deployed asset files must remain accessible for generated meshes to load after a save is restored.

For generated models and prototypes, **Playback speed** offers 0.1×, 0.25×, 0.5× and 1×. Select a **Preview motion** to inspect animation, then pause, step backward/forward or restart the clip at time zero. Each frame step samples 1/30 second and pauses; loops wrap around the clip boundary, while one-shot actions hold their final pose. Playing an ended one-shot restarts it. The counter shows current time and duration. Orbit and skeleton controls remain available while paused. Static poses disable frame stepping. These controls affect the preview only and do not change gameplay speed.

The **Preview motion** selector offers the 16 core gameplay motions: **idle, walk, run, attack, hit, death, turn left, turn right, turn around, charge, leap, cast, stagger, jump, land and spawn**. The 26-clip canine library also exposes an alternate attack and run, five additional idle performances, two greetings and talk/vocalization. Rest still shows the original bind pose.

Eighteen clips come from the DIMOS Lost Ark wolf pack, used with direct project permission reported by the repository owner on September 14, 2026. They supply locomotion, attacks, a howl, spawn and social/idle performances. Quaternius's CC0 wolf supplies hit, death, stagger, jump and landing fallbacks; Last Bastion supplies the three initial pivot clips. Donor meshes and textures are excluded. Voltfang's reviewed head and tail calibration is applied across the set; future generated faces still need their own calibration. Compatible generation jobs build the same set automatically without additional Tripo calls.

During play, creatures idle, walk/run, turn, spawn, attack, react to hits and finish a death animation before disappearing. They slow on gentle turns and pivot for sharp changes of direction. The preview illustrates pivots by rotating the creature while it steps. Melee attacks have a wind-up: damage occurs 40% through the clip and only if the target remains in range. Strong knockback can stagger a creature and cancel its pending attack. Dead creatures cannot attack or be targeted; their visual corpses are temporary, with at most 16 visible.

Charge, leap, cast, jump and landing are available for animation review and future abilities. They do not yet add new enemy abilities or jump navigation. Charge, leap, casting/howling and spawning now use the licensed authored wolf motions; pivots remain initial procedural animations. Foot locking and terrain contact remain unfinished, so inspect the actual feet and transitions before considering a generated creature complete. Incompatible rigs keep their provider animation with a recorded skip reason. Testing currently covers one real generated canine and synthetic rig variants. The forge does not yet offer arbitrary animation imports or a calibration editor.

Save definitions in the separate device library (48 creatures), or export/import individual creature JSON files. The library does not travel with a game save. To test an enemy, first start a run, select a class, move outside the protected settlement, return to the menu and open the forge. Spawn test enemy places a hostile creature near you while the run remains paused. Resume to fight it. The normal enemy cap applies; a run can hold 64 custom species including the older creature lab. Spawned creatures and their definitions are included when you save that run.

During a run, open **Testing** with F2 and use **Play as a creature** to replace the class hero's appearance with any installed 3D creature. Movement, sprinting, turning, jumping, landing and combat select the matching creature animations while class statistics and abilities remain active. The animation override can play every installed clip directly, including one-shot and looping performances; **Use movement animations** returns control to gameplay. **Restore class hero** removes the testing form. Possession is session-only and is not written to the save. Close the testing panel with its pinned **Close testing menu** button, Escape, F2, or a click on the dark backdrop.

Generated enemies currently use basic melee behavior and role-based health, damage and speed; form affects health, damage and physical scale. They award no gold. Attunements, subtypes and archetypes are identity metadata in this prototype, not additional spells or resistances. Companions are not implemented. Removing a device-library entry does not remove an enemy already in a run or uninstall a model from the generated asset manifest.

Sources: [Creature pipeline and service setup](https://github.com/jchoxha/last-bastion/blob/main/docs/CREATURE-PIPELINE.md), [Creature definitions](https://github.com/jchoxha/last-bastion/blob/main/lib/creatures/core.ts), [Prototype rigs](https://github.com/jchoxha/last-bastion/blob/main/lib/creatures/actor.ts).

## Landmarks and exploration rewards

Landmarks persist in the save. Interact near their central point; discovering a location and claiming its reward are separate actions.

### Pools, ruins, and villages

| Landmark            | Minimap color | Current interaction                                                                       |
| ------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| Springwater pool    | Blue          | Wading slows movement to 65%; a safe drink restores 25 health with a 30-second cooldown   |
| Old-world ruins     | Pale stone    | One-time 45 gold, 15 stone, 40 XP, and a shrine draft                                     |
| Wayfarer settlement | Gold          | Trade with the market merchant or hire a ranger for 100 gold if a friendly home has space |
| Ashvault dungeon    | Purple        | Three chamber encounters followed by a one-time vault cache                               |

A safe drink requires no living enemy within 12 metres. A village hire joins through the receiving friendly portal's arrival logic; it is not a new controllable player character. Biome color alone does not grant a resource bonus.

### Ashvault dungeons

Interact to enter the next chamber. The three stages attempt 3, 4, and 5 guardian spawns; the third includes a Siege Lord. The next stage stays unavailable while that dungeon's living guardians remain. Once all three stages are cleared, collect 200 gold, 30 ore, and 120 XP. A claimed cache cannot be collected again in that saved run.

### Other discoveries

The game also retains chest, shrine, and discovery systems from its earlier exploration layers. Their rewards and draft choices can coexist with the newer named landmarks. Generation is constrained by clear terrain and spacing; lack of a landmark nearby is not evidence of an undiscovered mandatory quest.

Sources: [Landmarks, interactions, and rewards](https://github.com/jchoxha/last-bastion/blob/main/game/expedition-world.js), [Regional placement](https://github.com/jchoxha/last-bastion/blob/main/game/rolling-world.js), [Earlier discoveries](https://github.com/jchoxha/last-bastion/blob/main/game/settlement.js).

## Saving, pausing, and recovery

There is one browser save slot, plus manual JSON export/import. The game has no cloud-save service.

### Save workflow

- Save from the in-game toolbar. Autosave attempts run every 30 seconds while a live run is not menu-paused.
- Menu pauses the game and attempts a save before showing the main menu. Opening this wiki from that menu keeps the existing session paused and intact.
- Resume game returns to the in-memory run. Load saved game constructs a session from the stored snapshot.
- Export save downloads the currently held saved snapshot. Save the live run first if you want its newest state.
- Import save validates a JSON file and makes it available to Load saved game. Import alone does not start the run or immediately persist it into browser storage.
- Keep exported backups before changing devices, browsers, hosting origins, or standalone HTML locations. Those can have different storage contexts.

### What is stored

Saves include world configuration and cells, player progression, settlements, buildings, residents, resources, enemies, and persistent exploration state. Rendering meshes are reconstructed when loading. Route jobs, unfinished terrain streaming jobs, ray caches, and climbing contact are runtime data rather than durable save content. Loading a player who was climbing does not restore an attached wall contact.

Imported files larger than 12,000,000 bytes are rejected by the menu, and the parser validates shape and limits. Browser storage can fill as a world grows. A failed save displays a notice; keep the current run open and use an available saved export as a backup.

### Falling in combat

The inherited player-death path normally hides the character for four seconds, then restores full health at a respawn point. Outside an active fight it removes up to 15 gold; during a fight it damages the active core by 8. Second Wind provides an immediate revival path. These rules are separate from losing the final friendly portal, which ends the run. Legacy respawn-point selection is listed for review in Maintenance notes.

Sources: [Main menu and storage bridge](https://github.com/jchoxha/last-bastion/blob/main/app/bastion.tsx), [Save validation](https://github.com/jchoxha/last-bastion/blob/main/lib/save-game.ts), [Game snapshots](https://github.com/jchoxha/last-bastion/blob/main/game/integration.js), [Player death](https://github.com/jchoxha/last-bastion/blob/main/game/last-bastion-original.html).

## Troubleshooting

Use the current interaction and placement messages first. They usually distinguish missing resources, inaccessible terrain, and missing staffing.

### A tower does not shoot

Check that construction is complete, the assigned NPC is alive and the required class, and the NPC has reached the tower. Reassigning that resident to follow, guard somewhere else, train, or work releases the tower assignment. Enemies must also be in range and physically targetable. Spike and tar traps instead need a reset after triggering.

### Workers are not producing

Check the relevant duty checkbox, home portal, production assignment, and a walkable approach. Cargo must be delivered before it enters shared stock. A worker may be training, following an explicit order, resetting a trap, retreating, or waiting for a route search. Homestead recruitment additionally requires a secured living portal, a bed, 15 gold, and its recruitment interval.

### A wave will not end

Clear scheduled assault enemies. On the final wave, destroy every hostile portal and remaining enemy associated with the claim. Portals keep generating reinforcements between waves. A wave that refuses to start may lack a valid reachable hostile-portal spawn location; inspect the message and surrounding terrain.

### Movement or construction is blocked

A narrow-looking opening can still be too small for an actor's physical footprint. Use the courtyard doorway, a natural ramp, or correctly oriented wall stairs. Terrain platforms touching at a corner are not walkable bridges. For a plan, check overlapping props, flatness, edge occupancy, materials, gold, and route constraints. Climbing requires stamina and a clear upper landing.

### The game stutters

Terrain streaming and route searches are spread over frames, but initial world setup, construction-triggered terrain rebuilds, some encounter creation, save serialization, rendering, and memory pressure can still cause pauses. The current optimization is not an all-purpose frame-rate guarantee. For a useful report, include seed, browser, camera view, approximate resident/enemy counts, what you were doing, and an exported save if possible.

Sources: [Regression coverage](https://github.com/jchoxha/last-bastion/blob/main/tests/README.md), [Streaming and scheduler](https://github.com/jchoxha/last-bastion/blob/main/game/frame-pacing.js), [Current worker recovery](https://github.com/jchoxha/last-bastion/blob/main/game/expedition-ai.js).

## Design and source map

This chapter is for changing the game. The design descriptions below summarize the current implementation; they are not a roadmap or a claim that every system is finished.

### Systems and their connections

Exploration supplies experience, gold, discoveries, and new settlement sites. Experience unlocks character abilities. Resources and gold buy plans, housing, training, and portal kits. People build and gather, while trained residents operate defenses. Defenses help secure portals; secured portals protect a wider area, support recruitment, and connect travel. Terrain and collision constrain every part of that loop.

Keep these dependencies in mind when balancing. Reducing a tower price alone may not make it available earlier if ranger training remains the bottleneck. Increasing world scale changes travel distances, wall spans, claim size, and geometry workload even when character sizes are unchanged.

### Runtime architecture

The React application owns the menu, wiki, save storage, and iframe lifecycle. The Three.js game runs in an iframe whose source is assembled from the original prototype and a specific sequence of gameplay scripts. Many later scripts wrap or replace functions declared earlier. To identify the live rule, follow that load order through the last assignment instead of reading the first matching definition.

| Source                                             | Responsibility                                                 |
| -------------------------------------------------- | -------------------------------------------------------------- |
| app/bastion.tsx                                    | Menu, session controller, pause/resume, storage bridge         |
| app/bastion/game-wiki.tsx                          | Wiki navigation, search, and readable presentation             |
| docs/GAME-WIKI.md                                  | Editable single source for this guide                          |
| scripts/build-wiki.mjs                             | Compile guide content into the bundled wiki data               |
| lib/world.ts                                       | Seeded connected terrain and incremental world generation      |
| lib/save-game.ts                                   | Outer save types and validation                                |
| game/last-bastion-original.html                    | Prototype constants, base combat, renderer, draft pools        |
| game/integration.js                                | Save/load, bridge, initial terrain integration, movement hooks |
| game/spatial.js and game/navigation.js             | Physical footprints, flow fields, strategic routes             |
| game/combat.js and game/portals.js                 | Abilities, effects, economy and portal foundations             |
| game/controls.js                                   | Current input, targeting, interaction, sales                   |
| game/settlement.js                                 | Buildings, residents, natural resources, starting settlement   |
| game/frontier-structures.js                        | Edges, gates, wire, construction help, destruction             |
| game/frontier-npcs.js                              | Duties, orders, production, training, resident movement        |
| game/frontier-war.js                               | Campaign enemies, sieges, merchants, outpost capture           |
| game/frontier-ui.js                                | Build categories, settlement browser, talent branches          |
| game/expedition-geometry.js                        | Wall stairs and physical terrain clearance                     |
| game/expedition-ai.js                              | Reachability recovery, threat, staffing and trap reset         |
| game/voxel-models.js                               | Articulated actor recipes and animations                       |
| game/expedition-world.js                           | Biomes, sky, landmarks and dungeon rewards                     |
| game/rolling-world.js and game/rounded-plateaus.js | Terrain modes, foliage, regional discoveries, cliff surfaces   |
| game/traversal-performance.js                      | Climbing, physical rays, actor level of detail                 |
| game/frame-pacing.js                               | Resumable terrain, route scheduling, expansion, HUD throttling |
| scripts/integrate-bastion.cjs                      | Exact script order and prototype substitutions                 |
| lib/bastion-source.ts                              | Generated iframe source; edit the inputs instead               |
| playable/last-bastion-world-lab.html               | Generated self-contained playable build                        |

### Save and simulation boundaries

`G` holds the active game; `G.economy.settlement` stores much of the later campaign state. Physical positions remain stable during incremental expansion, while cell references shift. Save packing strips render objects and selected transient fields. A new gameplay field needs an explicit decision: persist it, rebuild it on load, or discard it. A new building also needs rendering, collision, placement, construction, ownership, destruction, and save behavior—not just a catalog entry.

Sources: [Integration order](https://github.com/jchoxha/last-bastion/blob/main/scripts/integrate-bastion.cjs), [Repository source map](https://github.com/jchoxha/last-bastion/blob/main/README.md).

## Maintenance notes

These are observed implementation boundaries and review targets. They are documented here to make updates easier, not presented as working player features.

### Historical rules that are no longer authoritative

- The expedition guide's 4× default was superseded by 2× plateaus. Old saves can still use older scales and rolling terrain.
- The internal building ID `ramp` now represents Wall stairs for new construction. Older completed ramp saves still exist.
- The old Guard tower is retired. Trained knights are residents, not instances of that tower type.
- Fixed ability unlock levels were superseded by two talent branches per class. The old constants still exist in earlier modules.
- Old always-active spike and tar behavior was replaced by single-trigger traps requiring reset.
- Summoning generic workers and creating artificial claim resource caches were replaced by homestead recruitment and natural resources.

### Known seams to review before balancing

Legacy relics and upgrades still appear in draft data even where later overrides bypass their original effects. Examples include guard-tower bonuses, the old spike multiplier, old tar markers, and the old secure-claim salvage refund. The progression chapter labels these explicitly. Do not balance against the tooltip text alone.

The current Settlement browser replaced older research buttons. `harvestLevel` and `defenseLevel` still exist in saves and calculations, but the newer browser does not expose those earlier upgrade controls. Portal-kit crafting remains available through portal interaction.

The original respawn selector searches stored sites without filtering every destroyed portal. Player death can also subtract core health through an older path. These should be unified with the newer friendly-portal lifecycle in a future change. This documentation update does not alter those rules.

The creature laboratory creates seeded visual/statistical variants through testing tools. Custom species inherit a base species; unique attacks require additional behavior code. F2 tools can bypass normal balance and spawn restrictions.

### Performance design

Plateau terrain is drawn in four-by-four-tile chunks. Streaming builds a patch across tile-sized steps and attaches it only when complete; overlapping chunks are retained. The normal terrain work budget is 2ms, checked between steps rather than a hard maximum on all work. Foliage replacement is also staged. Expansion grows cell storage without serializing and reloading every actor.

Navigation jobs are resumable and shared through a revision-aware cache; collision changes invalidate routes. Frame-level pumping limits repeated scheduler work. The full HUD update chain respects an approximately 0.07-second refresh interval, while explicit actions can request an immediate refresh. None of these budgets include every browser rendering cost.

### Safe update checklist

- Start by checking the final loaded function and relevant regression tests. Record whether a change affects existing saves, new runs, or both.
- Keep the behavior, UI explanation, and this guide synchronized. Update tables whenever costs, cooldowns, controls, or staffing rules change.
- Add a meaningful regression for a new rule or fixed bug. Check persistence and collision when touching structures, NPC tasks, or terrain.
- Run the relevant tests and build the standalone game. Generated files are outputs of their source scripts, not the place to patch gameplay.
- Review the diff and follow the repository's owner-approved workflow: commit tested changes and push directly to main without force-pushing.

### Commands and publishing

Use Node.js 22.13 or newer; GitHub Pages currently builds on Node.js 24. Install dependencies with npm ci. Build the menu, wiki, and game together with npm run build:standalone. The wiki compiler also runs during the normal build/development commands; its source is this Markdown file.

| Command                     | Purpose                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| npm run build:wiki          | Regenerate the bundled wiki from docs/GAME-WIKI.md                                            |
| npm run build:standalone    | Rebuild the integrated game and self-contained playable HTML                                  |
| npm run test:world          | Seeded connectivity, ramp, growth, and preservation checks                                    |
| npm run test:game           | Current simulation regressions, including frame pacing                                        |
| npm run test:wiki           | Guide structure and live catalog consistency checks                                           |
| node tests/browser-wiki.cjs | Browser checks for menu access, search, links, mobile layout, and paused-session preservation |
| npx tsc --noEmit            | Type-check the application                                                                    |
| npm run build:pages         | Stage the standalone game and deployment metadata                                             |

Every push to main triggers the GitHub Pages workflow. The wiki ships inside the app and the downloaded standalone file, so reading it does not require a separate wiki server. Source links point to GitHub and need a connection.

Sources: [Repository workflow](https://github.com/jchoxha/last-bastion/blob/main/AGENTS.md), [Tests](https://github.com/jchoxha/last-bastion/blob/main/tests/README.md), [Pages deployment](https://github.com/jchoxha/last-bastion/blob/main/.github/workflows/deploy.yml), [Frame pacing](https://github.com/jchoxha/last-bastion/blob/main/game/frame-pacing.js).
