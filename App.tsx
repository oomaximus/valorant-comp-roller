import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  Alert,
} from "react-native";

/**
 * Valorant Comp Roller (Fun MVP+)
 * - Map selector + Random (✅ includes Corrode)
 * - Mode: Ranked vs Pro (affects weighting + flex tendencies)
 * - Role locks (simple: 1 lock per base role)
 * - Exclude agents
 * - ✅ Dive Duelist REQUIRED on every map
 * - ✅ Comp Style presets: Standard / Double Duelist / Triple Initiator / Double Controller / Double Sentinel / Chaos
 * - ✅ Quick Strats generated from map + comp
 */

type Role = "Duelist" | "Controller" | "Initiator" | "Sentinel";
type Mode = "RANKED" | "PRO";

type CompStyle =
  | "STANDARD"
  | "DOUBLE_DUELIST"
  | "TRIPLE_INITIATOR"
  | "DOUBLE_CONTROLLER"
  | "DOUBLE_SENTINEL"
  | "CHAOS";

type Tag =
  | "flash"
  | "recon"
  | "smokes"
  | "wall"
  | "trap"
  | "stall"
  | "entry"
  | "antiExec"
  | "postplant"
  | "dive";

type Agent = {
  name: string;
  roles: Role[];
  tags: Tag[];
};

type MapName =
  | "Ascent"
  | "Bind"
  | "Haven"
  | "Split"
  | "Lotus"
  | "Sunset"
  | "Icebox"
  | "Breeze"
  | "Fracture"
  | "Pearl"
  | "Corrode"
  | "Random";

type MapNeeds = {
  preferDoubleController: boolean;
  preferRecon: boolean;
  preferFlash: boolean;
  preferTrapSentinel: boolean;
  preferWallController: boolean;
  preferExplosiveEntry: boolean;
};

type MapProfile = {
  name: Exclude<MapName, "Random">;
  needs: Partial<MapNeeds>;
};

// ---- Agent Pool (update anytime) ----
const AGENTS: Agent[] = [
  // Controllers
  { name: "Omen", roles: ["Controller"], tags: ["smokes"] },
  { name: "Brimstone", roles: ["Controller"], tags: ["smokes", "postplant"] },
  { name: "Astra", roles: ["Controller"], tags: ["smokes", "antiExec"] },
  { name: "Viper", roles: ["Controller"], tags: ["smokes", "wall", "postplant"] },
  { name: "Harbor", roles: ["Controller"], tags: ["smokes", "wall"] },
  { name: "Clove", roles: ["Controller"], tags: ["smokes"] },

  // Initiators
  { name: "Sova", roles: ["Initiator"], tags: ["recon"] },
  { name: "Fade", roles: ["Initiator"], tags: ["recon"] },
  { name: "Skye", roles: ["Initiator"], tags: ["flash", "recon"] },
  { name: "KAY/O", roles: ["Initiator"], tags: ["flash", "antiExec"] },
  { name: "Breach", roles: ["Initiator"], tags: ["flash"] },
  { name: "Gekko", roles: ["Initiator"], tags: ["flash", "postplant"] },

  // NEW: Initiator
  { name: "Tejo", roles: ["Initiator"], tags: ["recon"] },

  // Sentinels
  { name: "Killjoy", roles: ["Sentinel"], tags: ["trap", "postplant"] },
  { name: "Cypher", roles: ["Sentinel"], tags: ["trap", "recon"] },
  { name: "Sage", roles: ["Sentinel"], tags: ["stall"] },
  { name: "Deadlock", roles: ["Sentinel"], tags: ["stall", "antiExec"] },
  { name: "Chamber", roles: ["Sentinel"], tags: ["trap"] },

  // NEW: Sentinels
  { name: "Veto", roles: ["Sentinel"], tags: ["trap"] },
  { name: "Vyse", roles: ["Sentinel"], tags: ["stall"] },

  // Duelists (✅ mark dive duelists)
  { name: "Jett", roles: ["Duelist"], tags: ["entry", "dive"] },
  { name: "Raze", roles: ["Duelist"], tags: ["entry", "dive"] },
  { name: "Neon", roles: ["Duelist"], tags: ["entry", "dive"] },
  { name: "Yoru", roles: ["Duelist"], tags: ["flash", "entry", "dive"] },
  { name: "Waylay", roles: ["Duelist"], tags: ["entry", "dive"] },

  // Non-dive duelists (allowed in additional duelist slots)
  { name: "Reyna", roles: ["Duelist"], tags: ["entry"] },
  { name: "Phoenix", roles: ["Duelist"], tags: ["flash", "entry"] },
  { name: "Iso", roles: ["Duelist"], tags: ["entry"] },
];

// ---- Maps + preferences (lightweight) ----
const MAPS: MapProfile[] = [
  { name: "Ascent", needs: { preferRecon: true, preferTrapSentinel: true } },
  { name: "Bind", needs: { preferFlash: true, preferTrapSentinel: true } },
  { name: "Haven", needs: { preferRecon: true, preferFlash: true } },
  { name: "Split", needs: { preferFlash: true, preferTrapSentinel: true, preferExplosiveEntry: true } },
  { name: "Lotus", needs: { preferFlash: true, preferRecon: true, preferTrapSentinel: true } },
  { name: "Sunset", needs: { preferRecon: true, preferTrapSentinel: true } },
  { name: "Icebox", needs: { preferWallController: true, preferRecon: true } },
  { name: "Breeze", needs: { preferWallController: true, preferRecon: true, preferDoubleController: true } },
  { name: "Fracture", needs: { preferFlash: true, preferTrapSentinel: true } },
  { name: "Pearl", needs: { preferRecon: true, preferDoubleController: true } },

  // ✅ NEW MAP
  // (Lightweight guess: tends to like info + flash + solid anchoring)
  { name: "Corrode", needs: { preferRecon: true, preferFlash: true, preferTrapSentinel: true } },
];

function resolveNeeds(profile: MapProfile): MapNeeds {
  return {
    preferDoubleController: false,
    preferRecon: false,
    preferFlash: false,
    preferTrapSentinel: false,
    preferWallController: false,
    preferExplosiveEntry: false,
    ...profile.needs,
  };
}

function randInt(maxExclusive: number) {
  return Math.floor(Math.random() * maxExclusive);
}

function pickOne<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  return arr[randInt(arr.length)];
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function hasTag(agent: Agent, tag: Tag) {
  return agent.tags.includes(tag);
}

function isDiveDuelist(agent: Agent) {
  return agent.roles.includes("Duelist") && hasTag(agent, "dive");
}

function roleAgents(role: Role, excluded: Set<string>) {
  return AGENTS.filter((a) => a.roles.includes(role) && !excluded.has(a.name));
}

// Weighted pick: duplicates in pool increase odds (simple & effective)
function weightedPool(base: Agent[], boosts: Array<(a: Agent) => boolean>) {
  const pool: Agent[] = [...base];
  for (const a of base) {
    for (const b of boosts) {
      if (b(a)) pool.push(a);
    }
  }
  return pool;
}

type GeneratedPick = { slot: string; role: Role; agent: string };
type GeneratedComp = {
  map: Exclude<MapName, "Random">;
  mode: Mode;
  style: CompStyle;
  picks: GeneratedPick[];
  notes: string[];
  strats: string[];
};

function styleLabel(style: CompStyle) {
  switch (style) {
    case "STANDARD":
      return "Standard (Balanced)";
    case "DOUBLE_DUELIST":
      return "Double Duelist";
    case "TRIPLE_INITIATOR":
      return "Triple Initiator (Chaos Utility)";
    case "DOUBLE_CONTROLLER":
      return "Double Controller";
    case "DOUBLE_SENTINEL":
      return "Double Sentinel";
    case "CHAOS":
      return "Chaos (Anything Goes)";
  }
}

function getStyleSlots(style: CompStyle): Array<{ role: Role; slot: string; requirements?: "DIVE_DUELIST" }> {
  // Always 5 players
  // ✅ Dive duelist ALWAYS required (either a dedicated slot, or enforced within the first duelist slot)
  switch (style) {
    case "STANDARD":
      // Controller + Initiator + Sentinel + Dive Duelist + Flex-ish (weighted)
      return [
        { role: "Controller", slot: "Controller" },
        { role: "Initiator", slot: "Initiator" },
        { role: "Sentinel", slot: "Sentinel" },
        { role: "Duelist", slot: "Dive Duelist", requirements: "DIVE_DUELIST" },
        { role: "Initiator", slot: "Flex (Utility)" }, // we still pick by logic later; this is a placeholder role
      ];

    case "DOUBLE_DUELIST":
      return [
        { role: "Controller", slot: "Controller" },
        { role: "Initiator", slot: "Initiator" },
        { role: "Sentinel", slot: "Sentinel" },
        { role: "Duelist", slot: "Dive Duelist", requirements: "DIVE_DUELIST" },
        { role: "Duelist", slot: "Duelist 2" },
      ];

    case "TRIPLE_INITIATOR":
      // Fun / chaotic: 3 initiators + controller + dive duelist (no sentinel anchor)
      return [
        { role: "Controller", slot: "Controller" },
        { role: "Duelist", slot: "Dive Duelist", requirements: "DIVE_DUELIST" },
        { role: "Initiator", slot: "Initiator 1" },
        { role: "Initiator", slot: "Initiator 2" },
        { role: "Initiator", slot: "Initiator 3" },
      ];

    case "DOUBLE_CONTROLLER":
      return [
        { role: "Controller", slot: "Controller 1" },
        { role: "Controller", slot: "Controller 2" },
        { role: "Initiator", slot: "Initiator" },
        { role: "Sentinel", slot: "Sentinel" },
        { role: "Duelist", slot: "Dive Duelist", requirements: "DIVE_DUELIST" },
      ];

    case "DOUBLE_SENTINEL":
      return [
        { role: "Controller", slot: "Controller" },
        { role: "Initiator", slot: "Initiator" },
        { role: "Sentinel", slot: "Sentinel 1" },
        { role: "Sentinel", slot: "Sentinel 2" },
        { role: "Duelist", slot: "Dive Duelist", requirements: "DIVE_DUELIST" },
      ];

    case "CHAOS":
    default:
      // Keep at least: controller + dive duelist, then randomize the rest
      return [
        { role: "Controller", slot: "Controller" },
        { role: "Duelist", slot: "Dive Duelist", requirements: "DIVE_DUELIST" },
        { role: "Initiator", slot: "Wildcard 1" },
        { role: "Sentinel", slot: "Wildcard 2" },
        { role: "Duelist", slot: "Wildcard 3" },
      ];
  }
}

function buildQuickStrats(
  map: Exclude<MapName, "Random">,
  agents: Agent[],
  style: CompStyle
) {
  const hasSmokes = agents.some((a) => hasTag(a, "smokes"));
  const hasWall = agents.some((a) => hasTag(a, "wall"));
  const hasFlash = agents.some((a) => hasTag(a, "flash"));
  const hasRecon = agents.some((a) => hasTag(a, "recon"));
  const hasTrap = agents.some((a) => hasTag(a, "trap"));
  const hasPostplant = agents.some((a) => hasTag(a, "postplant"));

  const dive = agents.find((a) => isDiveDuelist(a))?.name ?? "Dive Duelist";

  const strats: string[] = [];

  // Style-specific vibe
  if (style === "TRIPLE_INITIATOR") {
    strats.push("Triple Initiator: play for info + disables + layered flashes; win rounds by setting up unfair fights.");
    strats.push("Defense: avoid solo anchors—stack/trade more and retake as a unit with utility waves.");
  } else if (style === "DOUBLE_DUELIST") {
    strats.push("Double Duelist: take space aggressively—one creates chaos, one trades. Commit fast off first advantage.");
  } else if (style === "DOUBLE_CONTROLLER") {
    strats.push("Double Controller: slow the map down—double smokes/walls isolate fights, then exec clean.");
  } else if (style === "DOUBLE_SENTINEL") {
    strats.push("Double Sentinel: punish flanks/pushes—play contact into traps, then collapse.");
  } else if (style === "CHAOS") {
    strats.push("Chaos: play off your strongest utility combo each round—don’t overthink, just trade and scale.");
  }

  // Simple universal rules
  strats.push(
    `Entry rule: pair ${dive}'s dive with ${hasFlash ? "a flash" : hasRecon ? "recon/info" : "a trade swing"} — no dry dives.`
  );
  strats.push(
    `Attack default: ${hasRecon ? "use info early" : "take contact carefully"}, ${hasSmokes ? "smoke key chokes" : "take space slowly"}, plant, then ${hasPostplant ? "play time + post-plant utility" : "play crossfires + trades"}.`
  );
  strats.push(
    `Defense: ${hasTrap ? "anchor with traps" : "play crossfires"}, ${hasRecon ? "recon for rotates" : "hold sound + timing"}, then retake with ${hasSmokes ? "smokes" : "numbers"} + ${hasFlash ? "flashes" : "trades"}.`
  );

  const mapCalls: Record<Exclude<MapName, "Random">, string[]> = {
    Ascent: [
      "Ascent: contest Mid early; once Mid is yours, split A/B with smokes.",
      "Ascent retake: smoke CT + Heaven/Market, clear close first, then pinch."
    ],
    Bind: [
      "Bind: sell pressure with short utility, then hit fast—TP fakes are huge value.",
      "Bind post-plant: play off-site positions; don’t all sit on site."
    ],
    Haven: [
      "Haven: default for info, then hit the weak site with a fast dive + trade train.",
      "Haven defense: keep a fast rotator; don’t over-stack without info."
    ],
    Split: [
      "Split: Mid is everything—win Mid, then split B (Heaven+Main) or A (Ramps+Main).",
      "Split execute: smoke Heaven/CT, flash close, dive in on contact."
    ],
    Lotus: [
      "Lotus: take A Main control, then pinch through Door/Tree when smokes are up.",
      "Lotus defense: play for info and fast rotates—expect fakes."
    ],
    Sunset: [
      "Sunset: contest Mid early; win Mid → split B/A with smokes and quick trades.",
      "Sunset defense: trap Mid/Market and rotate off first info ping."
    ],
    Icebox: [
      "Icebox: use wall/smokes to cross; dive creates chaos while team plants safely.",
      "Icebox defense: play info then retake together—don’t feed 1v1s."
    ],
    Breeze: [
      "Breeze: long lanes—use wall/smokes to cross, recon to clear, then dive off tags.",
      "Breeze default: slower is fine; punish pushes and hit late with full util."
    ],
    Fracture: [
      "Fracture: pinch attacks—hit from BOTH sides; smokes isolate fights; dive breaks site.",
      "Fracture defense: lean retake setups; collapse with utility when they commit."
    ],
    Pearl: [
      "Pearl: take Mid space, then split; smokes isolate Art/Link fights.",
      "Pearl defense: trap flank, recon mid, rotate early off info."
    ],
    Corrode: [
      "Corrode: take early info, then pick a lane and collapse fast—avoid slow solo lurks.",
      "Corrode defense: play tight spacing for trades; rotate off confirmed info (don’t guess)."
    ],
  };

  strats.push(...(mapCalls[map] ?? []));

  // Utility nudges
  if (!hasRecon) strats.push("No recon: clear angles together and default more—avoid solo face-checks.");
  if (!hasFlash) strats.push("Low flash: take space with smokes + contact, then trade hard (2-man swing).");
  if (hasWall && map !== "Icebox" && map !== "Breeze") strats.push("Wall utility: cut sightlines and force close fights.");

  return strats.slice(0, 8);
}

function generateComp(args: {
  map: MapName;
  mode: Mode;
  style: CompStyle;
  lockedRoles: Partial<Record<Role, string>>; // role -> agent name (simple)
  excludedAgents: Set<string>;
}): GeneratedComp {
  // Resolve map
  const resolvedMap =
    args.map === "Random"
      ? MAPS[randInt(MAPS.length)].name
      : (args.map as Exclude<MapName, "Random">);

  const profile = MAPS.find((m) => m.name === resolvedMap)!;
  const needs = resolveNeeds(profile);

  const excluded = new Set(args.excludedAgents);

  // If locked agent is excluded, error early
  for (const [role, agent] of Object.entries(args.lockedRoles)) {
    if (agent && excluded.has(agent)) {
      throw new Error(`Locked agent ${agent} is excluded. Remove it from excluded list.`);
    }
    if (agent) {
      const exists = AGENTS.find((a) => a.name === agent && a.roles.includes(role as Role));
      if (!exists) throw new Error(`Locked agent ${agent} cannot play ${role}.`);
    }
  }

  // ✅ If duelist is locked, it MUST be a dive duelist (because we guarantee one)
  if (args.lockedRoles.Duelist) {
    const locked = args.lockedRoles.Duelist;
    const a = AGENTS.find((x) => x.name === locked);
    if (!a) throw new Error(`Locked agent ${locked} not found.`);
    if (!a.roles.includes("Duelist")) throw new Error(`Locked agent ${locked} is not a Duelist.`);
    if (!isDiveDuelist(a)) {
      throw new Error(
        `Dive Duelist required on every map. "${locked}" is not marked as a dive duelist. Try: Jett, Raze, Neon, Yoru, Waylay.`
      );
    }
  }

  const chosen = new Set<string>();
  const picks: GeneratedPick[] = [];

  // If a role repeats (double controller, etc.), we only apply the lock once to avoid duplicates
  const lockUsed = new Set<Role>();

  function forcePick(role: Role, slot: string, agentName: string) {
    if (chosen.has(agentName)) return false;
    chosen.add(agentName);
    picks.push({ role, slot, agent: agentName });
    return true;
  }

  function pickFrom(role: Role, slot: string, pool: Agent[], boosts: Array<(a: Agent) => boolean>, mustDive = false) {
    // honor lock only once per base role
    const locked = !lockUsed.has(role) ? args.lockedRoles[role] : undefined;
    if (locked) {
      lockUsed.add(role);
      const exists = AGENTS.find((a) => a.name === locked && a.roles.includes(role));
      if (!exists) throw new Error(`Locked agent ${locked} cannot play ${role}.`);
      if (chosen.has(locked)) throw new Error(`Locked agent ${locked} already used by another slot.`);
      if (mustDive) {
        const lockedA = AGENTS.find((a) => a.name === locked)!;
        if (!isDiveDuelist(lockedA)) {
          throw new Error(
            `Dive Duelist required. Locked duelist "${locked}" is not a dive duelist. Use Jett/Raze/Neon/Yoru/Waylay.`
          );
        }
      }
      forcePick(role, slot, locked);
      return;
    }

    const available = pool.filter((a) => !chosen.has(a.name));
    const filtered = mustDive ? available.filter(isDiveDuelist) : available;

    const wPool = weightedPool(filtered, boosts);
    const picked = pickOne(wPool);
    if (!picked) throw new Error(`No available agents left for ${slot} (${role}).`);
    forcePick(role, slot, picked.name);
  }

  const slots = getStyleSlots(args.style);

  // Precompute some role pools
  const controllerBase = roleAgents("Controller", excluded);
  const initiatorBase = roleAgents("Initiator", excluded);
  const sentinelBase = roleAgents("Sentinel", excluded);
  const duelistBase = roleAgents("Duelist", excluded);

  const controllerBoosts: Array<(a: Agent) => boolean> = [
    (a) => hasTag(a, "smokes"),
    (a) => (needs.preferWallController ? hasTag(a, "wall") : false),
    (a) => (resolvedMap === "Ascent" ? a.name === "Omen" : false),
    (a) => ((resolvedMap === "Bind" || resolvedMap === "Split") ? a.name === "Brimstone" : false),
    (a) => ((resolvedMap === "Breeze" || resolvedMap === "Icebox") ? a.name === "Viper" : false),
  ];

  const initiatorBoosts: Array<(a: Agent) => boolean> = [
    (a) => (needs.preferRecon ? hasTag(a, "recon") : false),
    (a) => (needs.preferFlash ? hasTag(a, "flash") : false),
    (a) => (resolvedMap === "Ascent" ? a.name === "Sova" : false),
  ];

  const sentinelBoosts: Array<(a: Agent) => boolean> = [
    (a) => (needs.preferTrapSentinel ? hasTag(a, "trap") : false),
    (a) => (resolvedMap === "Ascent" ? a.name === "Killjoy" : false),
    (a) => (resolvedMap === "Breeze" ? a.name === "Cypher" : false),
  ];

  const duelistBoostsDive: Array<(a: Agent) => boolean> = [
    (a) => (needs.preferExplosiveEntry ? a.name === "Raze" : false),
    (a) => ((resolvedMap === "Ascent" || resolvedMap === "Haven") ? a.name === "Jett" : false),
    (a) => (resolvedMap === "Split" ? a.name === "Raze" : false),
    (a) => (resolvedMap === "Breeze" ? a.name === "Jett" : false),
    (a) => (resolvedMap === "Bind" ? a.name === "Yoru" : false),
  ];

  const duelistBoostsGeneral: Array<(a: Agent) => boolean> = [
    (a) => (needs.preferExplosiveEntry ? a.name === "Raze" : false),
    (a) => (resolvedMap === "Bind" ? hasTag(a, "flash") : false),
  ];

  // Track utility coverage as we build (helps STANDARD "Flex (Utility)")
  function currentPickedAgents() {
    return picks.map((p) => AGENTS.find((a) => a.name === p.agent)!).filter(Boolean);
  }

   // Fill slots in order (✅ switch avoids TS "no overlap" comparison warnings)
  for (const s of slots) {
    switch (s.role) {
      case "Controller": {
        pickFrom("Controller", s.slot, controllerBase, controllerBoosts, false);
        break;
      }

      case "Initiator": {
        // Special case: STANDARD has a "Flex (Utility)" placeholder
        if (s.slot === "Flex (Utility)" && args.style === "STANDARD") {
          const pickedAgents = currentPickedAgents();
          const hasFlash = pickedAgents.some((a) => hasTag(a, "flash"));
          const hasRecon = pickedAgents.some((a) => hasTag(a, "recon"));
          const hasWall = pickedAgents.some((a) => hasTag(a, "wall"));

          let flexPref: "Controller" | "Initiator" | "Sentinel" | "Duelist" = "Initiator";

          // Map needs influence
          if (needs.preferDoubleController) flexPref = "Controller";
          if (needs.preferWallController && !hasWall) flexPref = "Controller";
          if (needs.preferFlash && !hasFlash) flexPref = "Initiator";
          if (needs.preferRecon && !hasRecon) flexPref = "Initiator";

          // ✅ (optional) allow second sentinel sometimes so flexPref can truly be "Sentinel"
          if (needs.preferTrapSentinel && Math.random() < 0.12) flexPref = "Sentinel";

          // Mode influence
          if (args.mode === "PRO") {
            if (hasFlash && hasRecon) {
              flexPref = needs.preferDoubleController
                ? "Controller"
                : Math.random() < 0.5
                ? "Controller"
                : "Initiator";
            } else {
              flexPref = "Initiator";
            }
            if (Math.random() < 0.25) flexPref = "Duelist";
          } else {
            if (Math.random() < 0.15) flexPref = "Controller";
          }

          if (flexPref === "Controller") {
            pickFrom("Controller", "Flex (Controller)", controllerBase, [
              (a) => (needs.preferWallController ? hasTag(a, "wall") : false),
              (a) => a.name === "Viper" && needs.preferWallController === true,
            ]);
          } else if (flexPref === "Duelist") {
            pickFrom("Duelist", "Flex (Duelist)", duelistBase, duelistBoostsGeneral);
          } else if (flexPref === "Sentinel") {
            pickFrom("Sentinel", "Flex (Sentinel)", sentinelBase, [
              (a) => (needs.preferTrapSentinel ? hasTag(a, "trap") : false),
              (a) => hasTag(a, "stall"),
            ]);
          } else {
            pickFrom("Initiator", "Flex (Initiator)", initiatorBase, [
              (a) => (!hasFlash ? hasTag(a, "flash") : false),
              (a) => (!hasRecon ? hasTag(a, "recon") : false),
              ...initiatorBoosts,
            ]);
          }
        } else {
          pickFrom("Initiator", s.slot, initiatorBase, initiatorBoosts, false);
        }
        break;
      }

      case "Sentinel": {
        pickFrom("Sentinel", s.slot, sentinelBase, sentinelBoosts, false);
        break;
      }

      case "Duelist": {
        const mustDive = s.requirements === "DIVE_DUELIST";
        pickFrom(
          "Duelist",
          s.slot,
          duelistBase,
          mustDive ? duelistBoostsDive : duelistBoostsGeneral,
          mustDive
        );
        break;
      }

      default: {
        // Exhaustive safety
        const _exhaustive: never = s.role;
        throw new Error(`Unknown role slot: ${_exhaustive}`);
      }
    }
  }
  // Ensure uniqueness
  const names = picks.map((p) => p.agent);
  if (uniq(names).length !== names.length) throw new Error("Internal error: duplicate agent generated.");

  // Notes
  const finalAgents = picks.map((p) => AGENTS.find((a) => a.name === p.agent)!).filter(Boolean);
  const notes: string[] = [];

  const hasAnyController = finalAgents.some((a) => a.roles.includes("Controller"));
  const hasAnyInitiator = finalAgents.some((a) => a.roles.includes("Initiator"));
  const hasAnySentinel = finalAgents.some((a) => a.roles.includes("Sentinel"));
  const hasDive = finalAgents.some(isDiveDuelist);

  notes.push(`Style: ${styleLabel(args.style)}.`);
  if (hasAnyController) notes.push("Smokes present: you can take space + retake with structure.");
  if (hasDive) notes.push("Dive duelist guaranteed: you have a true entry option every game.");

  if (hasAnyInitiator) {
    if (finalAgents.some((a) => hasTag(a, "recon"))) notes.push("Info present: easier clears + safer retakes.");
    if (finalAgents.some((a) => hasTag(a, "flash"))) notes.push("Flash present: better entries and angle-breaking.");
  }

  if (hasAnySentinel) {
    if (finalAgents.some((a) => hasTag(a, "trap"))) notes.push("Trap sentinel: strong flank control + anchoring.");
    if (finalAgents.some((a) => hasTag(a, "stall"))) notes.push("Stall tools: buy time and disrupt execs.");
  } else {
    notes.push("Warning: no sentinel anchor—play tighter spacing and trade more (this is a fun style).");
  }

  if (finalAgents.some((a) => hasTag(a, "wall"))) notes.push("Wall utility: helps crosses / cuts sightlines.");
  if (finalAgents.some((a) => hasTag(a, "postplant"))) notes.push("Post-plant tools: play time after plant.");

  const strats = buildQuickStrats(resolvedMap, finalAgents, args.style);

  return {
    map: resolvedMap,
    mode: args.mode,
    style: args.style,
    picks,
    notes,
    strats,
  };
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
    >
      <Text
        style={[
          styles.pillText,
          active ? styles.pillTextActive : styles.pillTextInactive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>("RANKED");
  const [style, setStyle] = useState<CompStyle>("STANDARD");
  const [selectedMap, setSelectedMap] = useState<MapName>("Random");

  // Role locks: lock by typing agent name (simple MVP)
  const [lockController, setLockController] = useState("");
  const [lockInitiator, setLockInitiator] = useState("");
  const [lockSentinel, setLockSentinel] = useState("");
  const [lockDuelist, setLockDuelist] = useState("");

  const [excludedText, setExcludedText] = useState(""); // comma-separated
  const excludedAgents = useMemo(() => {
    const set = new Set<string>();
    excludedText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((name) => set.add(name));
    return set;
  }, [excludedText]);

  const lockedRoles = useMemo(() => {
    const obj: Partial<Record<Role, string>> = {};
    if (lockController.trim()) obj.Controller = lockController.trim();
    if (lockInitiator.trim()) obj.Initiator = lockInitiator.trim();
    if (lockSentinel.trim()) obj.Sentinel = lockSentinel.trim();
    if (lockDuelist.trim()) obj.Duelist = lockDuelist.trim();
    return obj;
  }, [lockController, lockInitiator, lockSentinel, lockDuelist]);

  const [result, setResult] = useState<GeneratedComp | null>(null);
  const [history, setHistory] = useState<GeneratedComp[]>([]);

  function onRoll() {
    try {
      const comp = generateComp({
        map: selectedMap,
        mode,
        style,
        lockedRoles,
        excludedAgents,
      });
      setResult(comp);
      setHistory((h) => [comp, ...h].slice(0, 10));
    } catch (e: any) {
      Alert.alert("Couldn’t roll a comp", e?.message ?? "Unknown error");
    }
  }

  const agentNames = useMemo(() => AGENTS.map((a) => a.name).sort(), []);
  const diveDuelists = useMemo(
    () => AGENTS.filter(isDiveDuelist).map((a) => a.name).sort(),
    []
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Valorant Comp Roller</Text>
        <Text style={styles.subtitle}>
          Structured randomness + fun presets. Every roll includes a dive duelist. (✅ Corrode added)
        </Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Mode</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Pro-Style Toggle</Text>
            <Switch
              value={mode === "PRO"}
              onValueChange={(v) => setMode(v ? "PRO" : "RANKED")}
            />
          </View>
          <Text style={styles.helper}>
            {mode === "RANKED"
              ? "Ranked: more standard + slightly safer flex choices."
              : "Pro-style: leans utility and sometimes goes spicier (double duelist odds)."}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Comp Style</Text>
          <Text style={styles.helper}>Pick a preset for fun variations.</Text>
          <View style={styles.pillsWrap}>
            <Pill
              label="Standard"
              active={style === "STANDARD"}
              onPress={() => setStyle("STANDARD")}
            />
            <Pill
              label="Double Duelist"
              active={style === "DOUBLE_DUELIST"}
              onPress={() => setStyle("DOUBLE_DUELIST")}
            />
            <Pill
              label="Triple Initiator"
              active={style === "TRIPLE_INITIATOR"}
              onPress={() => setStyle("TRIPLE_INITIATOR")}
            />
            <Pill
              label="Double Controller"
              active={style === "DOUBLE_CONTROLLER"}
              onPress={() => setStyle("DOUBLE_CONTROLLER")}
            />
            <Pill
              label="Double Sentinel"
              active={style === "DOUBLE_SENTINEL"}
              onPress={() => setStyle("DOUBLE_SENTINEL")}
            />
            <Pill
              label="Chaos"
              active={style === "CHAOS"}
              onPress={() => setStyle("CHAOS")}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Map</Text>
          <View style={styles.pillsWrap}>
            <Pill
              label="Random"
              active={selectedMap === "Random"}
              onPress={() => setSelectedMap("Random")}
            />
            {MAPS.map((m) => (
              <Pill
                key={m.name}
                label={m.name}
                active={selectedMap === m.name}
                onPress={() => setSelectedMap(m.name)}
              />
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Role Locks (optional)</Text>
          <Text style={styles.helper}>
            Type an agent name exactly. Duelist lock must be a dive duelist.
            Locks apply once per role even if the style repeats roles.
          </Text>

          <View style={styles.lockRow}>
            <Text style={styles.lockLabel}>Controller</Text>
            <TextInput
              value={lockController}
              onChangeText={setLockController}
              placeholder="e.g., Omen"
              placeholderTextColor="#777"
              style={styles.input}
            />
          </View>
          <View style={styles.lockRow}>
            <Text style={styles.lockLabel}>Initiator</Text>
            <TextInput
              value={lockInitiator}
              onChangeText={setLockInitiator}
              placeholder="e.g., Sova"
              placeholderTextColor="#777"
              style={styles.input}
            />
          </View>
          <View style={styles.lockRow}>
            <Text style={styles.lockLabel}>Sentinel</Text>
            <TextInput
              value={lockSentinel}
              onChangeText={setLockSentinel}
              placeholder="e.g., Killjoy"
              placeholderTextColor="#777"
              style={styles.input}
            />
          </View>
          <View style={styles.lockRow}>
            <Text style={styles.lockLabel}>Duelist</Text>
            <TextInput
              value={lockDuelist}
              onChangeText={setLockDuelist}
              placeholder={`Dive only: ${diveDuelists.join(", ")}`}
              placeholderTextColor="#777"
              style={styles.input}
            />
          </View>

          <Text style={styles.smallListTitle}>Agent names:</Text>
          <Text style={styles.smallList}>{agentNames.join(", ")}</Text>

          <Text style={styles.smallListTitle}>Dive duelists:</Text>
          <Text style={styles.smallList}>{diveDuelists.join(", ")}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Exclude Agents (optional)</Text>
          <Text style={styles.helper}>
            Comma-separated list. Example: Reyna, Iso, Harbor
          </Text>
          <TextInput
            value={excludedText}
            onChangeText={setExcludedText}
            placeholder="e.g., Reyna, Iso"
            placeholderTextColor="#777"
            style={styles.input}
          />
        </View>

        <Pressable onPress={onRoll} style={styles.rollBtn}>
          <Text style={styles.rollBtnText}>ROLL COMP</Text>
        </Pressable>

        {result && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Result</Text>
            <Text style={styles.resultHeader}>
              Map: <Text style={styles.resultStrong}>{result.map}</Text> • Mode:{" "}
              <Text style={styles.resultStrong}>
                {result.mode === "RANKED" ? "Ranked" : "Pro-Style"}
              </Text>{" "}
              • Style: <Text style={styles.resultStrong}>{styleLabel(result.style)}</Text>
            </Text>

            {result.picks.map((p, idx) => (
              <View key={`${p.slot}-${p.agent}-${idx}`} style={styles.resultRow}>
                <Text style={styles.resultRole}>{p.slot}</Text>
                <Text style={styles.resultAgent}>{p.agent}</Text>
              </View>
            ))}

            <Text style={styles.sectionTitle}>Why it works</Text>
            {result.notes.map((n, i) => (
              <Text key={i} style={styles.note}>
                • {n}
              </Text>
            ))}

            <Text style={styles.sectionTitle}>Quick Strats</Text>
            {result.strats.map((s, i) => (
              <Text key={i} style={styles.note}>
                • {s}
              </Text>
            ))}
          </View>
        )}

        {history.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Recent Rolls</Text>
            {history.map((h, i) => (
              <View key={i} style={styles.historyItem}>
                <Text style={styles.historyTitle}>
                  {h.map} • {h.mode === "RANKED" ? "Ranked" : "Pro"} • {styleLabel(h.style)}
                </Text>
                <Text style={styles.historyLine}>
                  {h.picks.map((p) => `${p.slot}:${p.agent}`).join(" | ")}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0b0f14" },
  container: { padding: 16, gap: 12 },
  title: { color: "white", fontSize: 22, fontWeight: "800" },
  subtitle: { color: "#b8c0cc", marginTop: 4, lineHeight: 18 },

  card: {
    backgroundColor: "#121a24",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1c2a3a",
    gap: 10,
  },
  sectionTitle: { color: "white", fontSize: 16, fontWeight: "700" },
  label: { color: "#d7deea", fontSize: 14 },
  helper: { color: "#98a5b5", fontSize: 12, lineHeight: 16 },

  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },

  pillsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  pillActive: { backgroundColor: "#2a3b52", borderColor: "#4a6a92" },
  pillInactive: { backgroundColor: "#0f1620", borderColor: "#223245" },
  pillText: { fontSize: 12, fontWeight: "700" },
  pillTextActive: { color: "white" },
  pillTextInactive: { color: "#b8c0cc" },

  lockRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  lockLabel: { width: 80, color: "#d7deea", fontSize: 13, fontWeight: "700" },

  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#243246",
    backgroundColor: "#0f1620",
    color: "white",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },

  smallListTitle: { color: "#d7deea", fontSize: 12, fontWeight: "700", marginTop: 6 },
  smallList: { color: "#98a5b5", fontSize: 12, lineHeight: 16 },

  rollBtn: {
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  rollBtnText: { color: "white", fontWeight: "900", letterSpacing: 1 },

  resultHeader: { color: "#d7deea", lineHeight: 18 },
  resultStrong: { color: "white", fontWeight: "800" },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1c2a3a",
  },
  resultRole: { color: "#b8c0cc", fontWeight: "800" },
  resultAgent: { color: "white", fontWeight: "900" },

  note: { color: "#d7deea", lineHeight: 18 },

  historyItem: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#1c2a3a" },
  historyTitle: { color: "white", fontWeight: "800" },
  historyLine: { color: "#98a5b5", marginTop: 4, lineHeight: 16 },
});