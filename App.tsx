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
 * Valorant Comp Roller (MVP)
 * - Map selector + Random
 * - Mode: Ranked Viable vs Pro-Style
 * - Role locks
 * - Exclude agents
 * - Rules engine ensures: Controller + Initiator + Sentinel always present
 * - ✅ Dive Duelist REQUIRED on every map (Ranked + Pro)
 * - Flex fills missing utility (flash/recon/2nd controller) based on map needs
 * - ✅ Simple "Quick Strats" generated from map + comp
 */

type Role = "Duelist" | "Controller" | "Initiator" | "Sentinel" | "Flex";
type Mode = "RANKED" | "PRO";

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
  roles: Array<"Duelist" | "Controller" | "Initiator" | "Sentinel">;
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

  // Non-dive duelists (still allowed for flex rolls, but dive is REQUIRED once)
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

function roleAgents(role: Exclude<Role, "Flex">, excluded: Set<string>) {
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

type GeneratedPick = { role: Role; agent: string };
type GeneratedComp = {
  map: Exclude<MapName, "Random">;
  mode: Mode;
  picks: GeneratedPick[];
  notes: string[];
  strats: string[];
};

function buildQuickStrats(map: Exclude<MapName, "Random">, agents: Agent[]) {
  const hasSmokes = agents.some((a) => hasTag(a, "smokes"));
  const hasWall = agents.some((a) => hasTag(a, "wall"));
  const hasFlash = agents.some((a) => hasTag(a, "flash"));
  const hasRecon = agents.some((a) => hasTag(a, "recon"));
  const hasTrap = agents.some((a) => hasTag(a, "trap"));
  const hasPostplant = agents.some((a) => hasTag(a, "postplant"));

  const dive = agents.find((a) => isDiveDuelist(a))?.name ?? "Dive Duelist";

  const strats: string[] = [];

  // Simple universal rules
  strats.push(
    `Entry rule: pair ${dive}'s dive with ${hasFlash ? "a flash" : hasRecon ? "recon/info" : "a teammate swing"}—no dry dives.`
  );
  strats.push(
    `Default: ${hasRecon ? "info early, then collapse" : "spread for contact"}, ${hasSmokes ? "smoke chokes" : "take space slow"}, plant, then ${hasPostplant ? "play post-plant utility + time" : "play crossfires and trade"}.`
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
      "Bind: sell pressure with short utility, then hit fast—TP fakes are your best friend.",
      "Bind post-plant: play off-site positions; don’t all sit on site."
    ],
    Haven: [
      "Haven: default for info, then hit the weak site with a fast dive + trade train.",
      "Haven defense: leave a fast rotator; don’t over-stack early without info."
    ],
    Split: [
      "Split: Mid is everything—win Mid, then split B (Heaven+Main) or A (Ramps+Main).",
      "Split execute: smoke Heaven/CT, flash close, dive in on contact."
    ],
    Lotus: [
      "Lotus: take A Main control, then pinch through Door/Tree when smokes are up.",
      "Lotus defense: play for info and fast rotates—fakes happen a lot."
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
  };

  strats.push(...(mapCalls[map] ?? []));

  // Utility nudges
  if (!hasRecon) strats.push("No recon: clear angles together and default more—avoid solo face-checks.");
  if (!hasFlash) strats.push("Low flash: take space with smokes + contact, then trade hard (2-man swing).");
  if (hasWall && map !== "Icebox" && map !== "Breeze") strats.push("Wall utility: use it to cut sightlines and force close fights.");

  return strats.slice(0, 7);
}

function normalizeName(input: string) {
  return input.trim();
}

function findAgentByNameExact(name: string) {
  const n = normalizeName(name);
  return AGENTS.find((a) => a.name === n) ?? null;
}

function generateComp(args: {
  map: MapName;
  mode: Mode;
  lockedRoles: Partial<Record<Exclude<Role, "Flex">, string>>; // role -> agent name
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
  }

  // ✅ If duelist is locked, it MUST be a dive duelist
  if (args.lockedRoles.Duelist) {
    const locked = args.lockedRoles.Duelist;
    const a = findAgentByNameExact(locked);
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

  function forcePick(role: Role, agentName: string) {
    if (chosen.has(agentName)) return false;
    chosen.add(agentName);
    picks.push({ role, agent: agentName });
    return true;
  }

  function pickFrom(
    role: Exclude<Role, "Flex">,
    pool: Agent[],
    boosts: Array<(a: Agent) => boolean>
  ) {
    // If locked for that role, honor it
    const locked = args.lockedRoles[role];
    if (locked) {
      const exists = AGENTS.find((a) => a.name === locked && a.roles.includes(role));
      if (!exists) throw new Error(`Locked agent ${locked} cannot play ${role}.`);
      if (chosen.has(locked)) throw new Error(`Locked agent ${locked} already used by another role.`);
      forcePick(role, locked);
      return;
    }

    const available = pool.filter((a) => !chosen.has(a.name));
    const wPool = weightedPool(available, boosts);
    const picked = pickOne(wPool);
    if (!picked) throw new Error(`No available agents left for role ${role}.`);
    forcePick(role, picked.name);
  }

  // ---- Required core ----
  // Controller
  const controllerBase = roleAgents("Controller", excluded);
  const controllerBoosts: Array<(a: Agent) => boolean> = [
    (a) => hasTag(a, "smokes"),
    (a) => (needs.preferWallController ? hasTag(a, "wall") : false),
    (a) => (resolvedMap === "Ascent" ? a.name === "Omen" : false),
    (a) => ((resolvedMap === "Bind" || resolvedMap === "Split") ? a.name === "Brimstone" : false),
    (a) => ((resolvedMap === "Breeze" || resolvedMap === "Icebox") ? a.name === "Viper" : false),
  ];
  pickFrom("Controller", controllerBase, controllerBoosts);

  // Initiator
  const initiatorBase = roleAgents("Initiator", excluded);
  const initiatorBoosts: Array<(a: Agent) => boolean> = [
    (a) => (needs.preferRecon ? hasTag(a, "recon") : false),
    (a) => (needs.preferFlash ? hasTag(a, "flash") : false),
    (a) => (resolvedMap === "Ascent" ? a.name === "Sova" : false),
  ];
  pickFrom("Initiator", initiatorBase, initiatorBoosts);

  // Sentinel
  const sentinelBase = roleAgents("Sentinel", excluded);
  const sentinelBoosts: Array<(a: Agent) => boolean> = [
    (a) => (needs.preferTrapSentinel ? hasTag(a, "trap") : false),
    (a) => (resolvedMap === "Ascent" ? a.name === "Killjoy" : false),
    (a) => (resolvedMap === "Breeze" ? a.name === "Cypher" : false),
  ];
  pickFrom("Sentinel", sentinelBase, sentinelBoosts);

  // ✅ DIVE DUELIST (always required)
  {
    const duelBaseAll = roleAgents("Duelist", excluded);

    // Only allow dive duelists in the required slot
    const divePool = duelBaseAll.filter(isDiveDuelist);

    const duelBoosts: Array<(a: Agent) => boolean> = [
      (a) => (needs.preferExplosiveEntry ? a.name === "Raze" : false),
      (a) => ((resolvedMap === "Ascent" || resolvedMap === "Haven") ? a.name === "Jett" : false),
      (a) => (resolvedMap === "Split" ? a.name === "Raze" : false),
      (a) => (resolvedMap === "Breeze" ? a.name === "Jett" : false),
    ];

    pickFrom("Duelist", divePool, duelBoosts);
  }

  // ---- FLEX logic ----
  const pickedAgents = picks
    .map((p) => AGENTS.find((a) => a.name === p.agent)!)
    .filter(Boolean);

  const hasFlash = pickedAgents.some((a) => hasTag(a, "flash"));
  const hasRecon = pickedAgents.some((a) => hasTag(a, "recon"));
  const hasWall = pickedAgents.some((a) => hasTag(a, "wall"));

  let flexPreference: "SecondController" | "SecondInitiator" | "SecondDuelist" | "SecondSentinel" =
    "SecondInitiator";

  if (needs.preferDoubleController) flexPreference = "SecondController";
  if (needs.preferWallController && !hasWall) flexPreference = "SecondController";
  if (needs.preferFlash && !hasFlash) flexPreference = "SecondInitiator";
  if (needs.preferRecon && !hasRecon) flexPreference = "SecondInitiator";

  if (args.mode === "PRO") {
    // Pro leans utility, but sometimes goes double-duelist
    if (hasFlash && hasRecon) {
      flexPreference = needs.preferDoubleController
        ? "SecondController"
        : Math.random() < 0.5
        ? "SecondController"
        : "SecondInitiator";
    } else {
      flexPreference = "SecondInitiator";
    }
    if (Math.random() < 0.25) flexPreference = "SecondDuelist";
  } else {
    // Ranked: small chance for double controller
    if (Math.random() < 0.15) flexPreference = "SecondController";
  }

  function pickFlexFromRole(role: Exclude<Role, "Flex">, reasonBoost: Array<(a: Agent) => boolean>) {
    const base = roleAgents(role, excluded).filter((a) => !chosen.has(a.name));
    const pool = weightedPool(base, reasonBoost);
    const picked = pickOne(pool);
    if (!picked) throw new Error(`No available agents left for Flex as ${role}.`);
    forcePick("Flex", picked.name);
  }

  if (flexPreference === "SecondController") {
    pickFlexFromRole("Controller", [
      (a) => (needs.preferWallController ? hasTag(a, "wall") : false),
      (a) => a.name === "Viper" && needs.preferWallController === true,
    ]);
  } else if (flexPreference === "SecondInitiator") {
    pickFlexFromRole("Initiator", [
      (a) => (!hasFlash ? hasTag(a, "flash") : false),
      (a) => (!hasRecon ? hasTag(a, "recon") : false),
      (a) => (needs.preferFlash ? hasTag(a, "flash") : false),
      (a) => (needs.preferRecon ? hasTag(a, "recon") : false),
    ]);
  } else if (flexPreference === "SecondDuelist") {
    pickFlexFromRole("Duelist", [
      (a) => (needs.preferExplosiveEntry ? a.name === "Raze" : false),
      (a) => (a.name === "Jett" && (resolvedMap === "Haven" || resolvedMap === "Ascent")),
      (a) => (a.name === "Yoru" && (needs.preferFlash || resolvedMap === "Bind")),
    ]);
  } else {
    pickFlexFromRole("Sentinel", [
      (a) => (needs.preferTrapSentinel ? hasTag(a, "trap") : false),
      (a) => hasTag(a, "stall"),
    ]);
  }

  // Notes
  const finalAgents = picks.map((p) => AGENTS.find((a) => a.name === p.agent)!).filter(Boolean);
  const notes: string[] = [];

  notes.push("Core satisfied: smokes + initiator support + sentinel anchor.");
  notes.push("Dive Duelist guaranteed: you always have a true entry option.");

  if (finalAgents.some((a) => hasTag(a, "flash"))) notes.push("Has flash utility to break angles and enable entries.");
  if (finalAgents.some((a) => hasTag(a, "recon"))) notes.push("Has recon/info to take space safely and support retakes.");
  if (finalAgents.some((a) => hasTag(a, "wall"))) notes.push("Has wall control for long sightlines / site takes.");
  if (finalAgents.some((a) => hasTag(a, "postplant"))) notes.push("Has post-plant tools for securing rounds.");

  // Ensure uniqueness
  const names = picks.map((p) => p.agent);
  if (uniq(names).length !== names.length) throw new Error("Internal error: duplicate agent generated.");

  const strats = buildQuickStrats(resolvedMap, finalAgents);

  return {
    map: resolvedMap,
    mode: args.mode,
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
  const [selectedMap, setSelectedMap] = useState<MapName>("Random");

  // Role locks: you can lock by typing agent name (simple MVP)
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
    const obj: Partial<Record<Exclude<Role, "Flex">, string>> = {};
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
        lockedRoles,
        excludedAgents,
      });
      setResult(comp);
      setHistory((h) => [comp, ...h].slice(0, 8));
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
        <Text style={styles.title}>Valorant Champions Comp Roller</Text>
        <Text style={styles.subtitle}>
          Structured randomness: every roll keeps the roles needed to be viable — and always includes a dive duelist.
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
              ? "Ranked: Controller + Initiator + Sentinel + Dive Duelist + Flex"
              : "Pro-style: still forces Dive Duelist; Flex leans utility but can roll double duelist sometimes."}
          </Text>
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
              </Text>
            </Text>

            {result.picks.map((p, idx) => (
              <View key={`${p.role}-${p.agent}-${idx}`} style={styles.resultRow}>
                <Text style={styles.resultRole}>{p.role}</Text>
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
                  {h.map} • {h.mode === "RANKED" ? "Ranked" : "Pro"}
                </Text>
                <Text style={styles.historyLine}>
                  {h.picks.map((p) => `${p.role}:${p.agent}`).join(" | ")}
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

  resultHeader: { color: "#d7deea" },
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