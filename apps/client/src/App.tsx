import { useEffect, useRef, useState } from "react";
import {
  BRAND,
  CONFIG,
  COLORS,
  SHIPS,
} from "../../../packages/shared/src/config";
import type { Envelope, Site, Plan } from "../../../packages/shared/src/types";
import { socket, command } from "./net";
import { ShipArt } from "./Art";
import { tone } from "./audio";
const stored = () => {
  try {
    return JSON.parse(sessionStorage.getItem("salvage-session") || "null") as {
      code: string;
      resumeToken: string;
    } | null;
  } catch {
    return null;
  }
};
const codeFrom = (value: string) => {
  try {
    if (value.includes("/"))
      return new URL(value).pathname.split("/").at(-1)!.toUpperCase();
  } catch {
    /*Treat a non-URL as a code.*/
  }
  return value.trim().toUpperCase();
};
export function App() {
  const [state, setState] = useState<Envelope | null>(null),
    [connected, setConnected] = useState(socket.connected),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [replaced, setReplaced] = useState(false),
    [mode, setMode] = useState<"create" | "join">(
      location.pathname.startsWith("/room/") ? "join" : "create",
    ),
    [name, setName] = useState(localStorage.getItem("salvage-name") || ""),
    [ship, setShip] = useState<string>(
      localStorage.getItem("salvage-ship") || "tug",
    ),
    [code, setCode] = useState(location.pathname.split("/")[2] || ""),
    [help, setHelp] = useState(false),
    [leaveConfirm, setLeaveConfirm] = useState(false),
    [sound, setSound] = useState(
      localStorage.getItem("salvage-sound") === "on",
    ),
    [copied, setCopied] = useState(false),
    [draft, setDraft] = useState<number[]>([0, 0, 0]),
    [time, setTime] = useState(Date.now()),
    [offset, setOffset] = useState(0),
    [roster, setRoster] = useState(false);
  const latest = useRef<Envelope | null>(null),
    lastRound = useRef(""),
    lastPhase = useRef(""),
    retryPlan = useRef<Plan | null>(null),
    joining = useRef(false),
    lowWarn = useRef("");
  useEffect(() => {
    const update = (next: Envelope) => {
      if (
        latest.current?.public.code === next.public.code &&
        next.public.revision < latest.current.public.revision
      )
        return;
      latest.current = next;
      setState(next);
      setOffset(next.serverNow - Date.now());
      setCode(next.public.code);
      history.replaceState(null, "", `/room/${next.public.code}`);
      if (next.public.match?.roundId !== lastRound.current) {
        lastRound.current = next.public.match?.roundId || "";
        setDraft([0, 0, 0]);
        retryPlan.current = null;
        setError("");
      }
      if (next.private.lockedAllocation) {
        const bids = next.private.lockedAllocation.bids;
        setDraft(
          next.public.match!.sites.map(
            (s) => bids.find((b) => b.siteId === s.id)?.drones ?? 0,
          ),
        );
        retryPlan.current = null;
      }
      if (lastPhase.current !== next.public.phase) {
        if (next.public.phase === "REVEAL") tone("reveal");
        if (next.public.phase === "RESULTS") tone("end");
        lastPhase.current = next.public.phase;
      }
    };
    const connect = async () => {
      setConnected(true);
      setError("");
      const saved = stored();
      if (saved && !joining.current) {
        const ack = await command("room:resume", saved);
        if (!ack.ok) {
          setError(ack.message);
          if (["ROOM_NOT_FOUND", "SESSION_EXPIRED"].includes(ack.code)) {
            sessionStorage.removeItem("salvage-session");
            latest.current = null;
            setState(null);
          }
        }
      }
    };
    const disconnect = () => setConnected(false);
    const replace = () => {
      setReplaced(true);
      setError("This captain is active in another tab.");
      sessionStorage.removeItem("salvage-session");
    };
    const notice = (n: { code: string; message: string }) => {
      setError(n.message);
      if (n.code === "ROOM_EXPIRED") {
        sessionStorage.removeItem("salvage-session");
        latest.current = null;
        setState(null);
      }
    };
    socket.on("state:update", update);
    socket.on("connect", connect);
    socket.on("disconnect", disconnect);
    socket.on("session:replaced", replace);
    socket.on("server:notice", notice);
    socket.on("connect_error", disconnect);
    socket.connect();
    const timer = setInterval(() => setTime(Date.now()), 200);
    const request = () => {
      if (socket.connected && stored()) void command("state:request");
    };
    window.addEventListener("focus", request);
    document.addEventListener("visibilitychange", request);
    return () => {
      clearInterval(timer);
      socket.off("state:update", update);
      socket.off("connect", connect);
      socket.off("disconnect", disconnect);
      socket.off("session:replaced", replace);
      socket.off("server:notice", notice);
      socket.off("connect_error", disconnect);
      window.removeEventListener("focus", request);
      document.removeEventListener("visibilitychange", request);
    };
  }, []);
  const pub = state?.public,
    match = pub?.match,
    me = pub?.players.find((p) => p.id === state!.private.playerId),
    host = me?.id === pub?.hostId,
    locked = !!state?.private.lockedAllocation;
  const seconds = Math.max(
    0,
    Math.ceil(((match?.phaseEndsAt || 0) - (time + offset)) / 1000),
  );
  const phase = pub?.phase;
  const cost = (match?.sites ?? []).reduce(
      (n, s, i) => n + (draft[i] || 0) * s.cost,
      0,
    ),
    drones = draft.reduce((n, x) => n + x, 0);
  useEffect(() => {
    if (
      phase === "PLANNING" &&
      seconds <= 5 &&
      lowWarn.current !== match?.roundId
    ) {
      lowWarn.current = match?.roundId || "";
      document.getElementById("time-announcement")!.textContent =
        "Five seconds to lock orders.";
    }
  }, [seconds, phase, match?.roundId]);
  async function act(
    event: string,
    data: Record<string, unknown> = {},
    requestId?: string,
  ) {
    if (pending || !connected || replaced) return;
    setPending(true);
    setError("");
    const ack = await command(event, data, requestId);
    setPending(false);
    if (!ack.ok) setError(ack.message);
    else tone("click");
    return ack;
  }
  async function enter() {
    if (pending) return;
    joining.current = true;
    const ack = await act(mode === "create" ? "room:create" : "room:join", {
      name: name.trim(),
      shipId: ship,
      ...(mode === "join" ? { code: codeFrom(code) } : {}),
    });
    joining.current = false;
    if (ack?.ok && ack.data?.resumeToken) {
      sessionStorage.setItem(
        "salvage-session",
        JSON.stringify({
          code: ack.data.code,
          resumeToken: ack.data.resumeToken,
        }),
      );
      localStorage.setItem("salvage-name", name.trim());
      localStorage.setItem("salvage-ship", ship);
      if (!localStorage.getItem("salvage-learned")) {
        setHelp(true);
        localStorage.setItem("salvage-learned", "1");
      }
    }
  }
  async function lock() {
    if (!match || !me || locked) return;
    const fingerprint = JSON.stringify(draft);
    if (
      !retryPlan.current ||
      JSON.stringify(retryPlan.current.bids.map((b) => b.drones)) !==
        fingerprint
    )
      retryPlan.current = {
        requestId: crypto.randomUUID(),
        matchId: match.id,
        roundId: match.roundId!,
        bids: match.sites.map((s, i) => ({ siteId: s.id, drones: draft[i] })),
      };
    const plan = retryPlan.current;
    const ack = await act(
      "round:submit",
      { matchId: plan.matchId, roundId: plan.roundId, bids: plan.bids },
      plan.requestId,
    );
    if (ack?.ok) {
      tone("lock");
      retryPlan.current = null;
    } else if (ack?.code !== "TRANSPORT") retryPlan.current = null;
  }
  async function leave() {
    const ack = await act("room:leave");
    if (ack?.ok) {
      sessionStorage.removeItem("salvage-session");
      latest.current = null;
      setState(null);
      setLeaveConfirm(false);
      lastRound.current = "";
      history.replaceState(null, "", "/");
    }
  }
  const change = (i: number, n: number) => {
    if (!me || locked || pending || me.forfeited) return;
    const value = Math.max(0, Math.min(8, Math.floor(n || 0)));
    const newCost =
      cost -
      (draft[i] || 0) * match!.sites[i].cost +
      value * match!.sites[i].cost;
    if (newCost > me.power) return;
    setDraft((d) => d.map((v, k) => (k === i ? value : v)));
  };
  const result = match?.lastResolution;
  const elapsed = match ? time + offset - match.phaseStartedAt : 0;
  const ordered = [...(pub?.players ?? [])].sort(
    (a, b) => b.score - a.score || a.identitySlot - b.identitySlot,
  );
  const inactive = !connected || pending || replaced;
  return (
    <div className="app">
      <header className="topbar">
        <a
          className="wordmark"
          href="/"
          onClick={(e) => {
            if (state) {
              e.preventDefault();
              setHelp(true);
            }
          }}
        >
          <span className="brand-symbol">✦</span> SALVAGE RIGHTS
          <span className="edition">SECTOR 07</span>
        </a>
        <div className="utilities">
          <button
            className="quiet"
            aria-pressed={sound}
            onClick={() => {
              const on = !sound;
              setSound(on);
              localStorage.setItem("salvage-sound", on ? "on" : "off");
              tone("click");
            }}
          >
            {sound ? "Sound on" : "Sound off"}
          </button>
          <button className="quiet" onClick={() => setHelp(true)}>
            How to play
          </button>
          {state && (
            <button
              className="quiet"
              onClick={() =>
                phase === "LOBBY" || phase === "RESULTS"
                  ? void leave()
                  : setLeaveConfirm(true)
              }
            >
              Leave
            </button>
          )}
        </div>
      </header>
      <div id="time-announcement" className="sr-only" aria-live="polite" />
      <div className="sr-only" aria-live="polite">
        {phase ? `Phase: ${phase.toLowerCase()}` : ""}
      </div>
      {!connected && (
        <div className="connection" role="status">
          {state
            ? "Signal lost. Reconnecting… Match timers continue."
            : "Connecting to the sector…"}
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            className="quiet"
            onClick={() => setError("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}
      {!state ? (
        <main className="landing">
          <section className="landing-title">
            <div className="eyebrow">INDEPENDENT SALVAGE AUTHORITY / 07</div>
            <h1>
              ONE SECTOR.
              <br />
              NO HONOR
              <br />
              <span>AMONG FRIENDS.</span>
            </h1>
            <p>
              The wrecks are abandoned.
              <br />
              The competition isn’t.
            </p>
            <div className="landing-ship">
              <ShipArt kind="barge" label="Patched industrial salvage barge" />
              <div className="scan-label">
                <span>SCANNING FOR UNCLAIMED PROPERTY</span>
                <span>▰ ▰ ▰ ▱</span>
              </div>
            </div>
            <p className="fine">2–6 captains · about 5 minutes · no account</p>
          </section>
          <section className="entry panel">
            <div className="panel-heading">
              <span className="eyebrow">CAPTAIN’S TERMINAL</span>
              <span className="tag">PRIVATE ROOMS</span>
            </div>
            <h2>Make your claim.</h2>
            <p>
              Send drones in secret. Reveal together.
              <br />
              Every drone costs you—even when you lose.
            </p>
            <div className="mode-tabs" role="tablist" aria-label="Room entry">
              <button
                role="tab"
                aria-selected={mode === "create"}
                onClick={() => setMode("create")}
              >
                Create room
              </button>
              <button
                role="tab"
                aria-selected={mode === "join"}
                onClick={() => setMode("join")}
              >
                Join room
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enter();
              }}
            >
              <label htmlFor="callsign">Your callsign</label>
              <input
                id="callsign"
                autoComplete="nickname"
                required
                minLength={2}
                maxLength={16}
                placeholder="e.g. Captain Scrap"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {mode === "join" && (
                <>
                  <label htmlFor="code">Room code or invite link</label>
                  <input
                    id="code"
                    autoComplete="off"
                    placeholder="ABC234"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </>
              )}
              <fieldset className="ships">
                <legend>
                  Choose your ship <span>Cosmetic only</span>
                </legend>
                {SHIPS.map((s) => (
                  <button
                    type="button"
                    aria-pressed={ship === s}
                    className={ship === s ? "selected" : ""}
                    key={s}
                    onClick={() => setShip(s)}
                  >
                    <ShipArt kind={s} />
                    <span>{s}</span>
                  </button>
                ))}
              </fieldset>
              <button
                className="primary wide"
                disabled={inactive || name.trim().length < 2}
              >
                {pending
                  ? "Opening channel…"
                  : mode === "create"
                    ? "Create salvage crew"
                    : "Join salvage crew"}
              </button>
            </form>
            <div className="terminal-note">
              NO REGISTRATION. NO MERCY.
              <br />
              <span>Keep the invite link among your crew.</span>
            </div>
          </section>
        </main>
      ) : (
        <main
          className="game-main"
          data-phase={phase}
          data-round={match?.roundNumber}
        >
          {phase === "LOBBY" || phase === "STARTING" ? (
            <>
              <div className="section-top">
                <div>
                  <div className="eyebrow">CREW ASSEMBLY / SECTOR 07</div>
                  <h1>
                    {phase === "STARTING"
                      ? "Launch sequence."
                      : "Your crew. Your competition."}
                  </h1>
                  <p>
                    {phase === "STARTING"
                      ? `Launching in ${seconds}…`
                      : "Invite a few friends. Then see who comes home rich."}
                  </p>
                </div>
                <div className="room-code">
                  <span className="eyebrow">ROOM CODE</span>
                  <strong>{pub!.code}</strong>
                  <button
                    className="quiet"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `${location.origin}/room/${pub!.code}`,
                        );
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2200);
                      } catch {
                        setError(
                          "Copy this address from your browser to invite friends.",
                        );
                      }
                    }}
                  >
                    {copied ? "Link copied" : "Copy invite link"}
                  </button>
                </div>
              </div>
              <div className="crew-grid">
                {pub!.players.map((p) => (
                  <article
                    className="captain panel"
                    key={p.id}
                    style={
                      {
                        "--captain-color": COLORS[p.identitySlot],
                      } as React.CSSProperties
                    }
                  >
                    <div className="captain-head">
                      <span className="captain-number">
                        0{p.identitySlot + 1}
                      </span>
                      <span className="tag">
                        {p.id === pub!.hostId
                          ? "HOST"
                          : p.id === me!.id
                            ? "YOU"
                            : "CAPTAIN"}
                      </span>
                    </div>
                    <ShipArt kind={p.shipId} />
                    <h2>{p.name}</h2>
                    <span className={p.connected ? "" : "muted"}>
                      {p.connected
                        ? p.ready
                          ? "✓ Ready to salvage"
                          : "Awaiting clearance"
                        : "Away · seat reserved"}
                    </span>
                  </article>
                ))}
                {Array.from({ length: 6 - pub!.players.length }, (_, i) => (
                  <div className="empty-seat" key={i}>
                    <span>+</span>
                    <p>OPEN CHANNEL</p>
                    <small>Waiting for a captain</small>
                  </div>
                ))}
              </div>
              <div className="lobby-bottom panel">
                <p>
                  <strong>
                    {pub!.players.filter((p) => p.ready).length} /{" "}
                    {pub!.players.length} cleared
                  </strong>
                  <span>Everyone must be connected and ready to launch.</span>
                </p>
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={inactive || phase === "STARTING"}
                    onClick={() =>
                      void act("player:ready", { ready: !me!.ready })
                    }
                  >
                    {me!.ready ? "Cancel ready" : "Ready to salvage"}
                  </button>
                  {host && (
                    <button
                      className="primary"
                      disabled={
                        inactive ||
                        phase === "STARTING" ||
                        pub!.players.length < 2 ||
                        pub!.players.some((p) => !p.ready || !p.connected)
                      }
                      onClick={() => void act("game:start")}
                    >
                      Launch crew
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="match-top">
                <div>
                  <div className="eyebrow">
                    {phase === "RESULTS"
                      ? "SECTOR SWEEP COMPLETE"
                      : `ROUND ${match!.roundNumber.toString().padStart(2, "0")} / 08`}
                  </div>
                  <h1>
                    {phase === "PLANNING"
                      ? "Pick your battles."
                      : phase === "REVEAL"
                        ? "Claims on the table."
                        : phase === "SUMMARY"
                          ? "Tally the haul."
                          : "The richest haul."}
                  </h1>
                </div>
                <div className="instruments">
                  <div>
                    <span>Your credits</span>
                    <strong>
                      {me!.score}
                      <small> CR</small>
                    </strong>
                  </div>
                  <div>
                    <span>
                      {phase === "PLANNING"
                        ? "Available power"
                        : "Power aboard"}
                    </span>
                    <strong>
                      {me!.power}
                      <small> / 12</small>
                    </strong>
                  </div>
                  {phase !== "RESULTS" && (
                    <div
                      className={
                        seconds <= 5 && phase === "PLANNING"
                          ? "timer warning"
                          : "timer"
                      }
                    >
                      <span>
                        {phase === "PLANNING" ? "Lock within" : "Next phase"}
                      </span>
                      <strong>
                        {seconds.toString().padStart(2, "0")}
                        <small>s</small>
                      </strong>
                    </div>
                  )}
                </div>
              </div>
              {me!.forfeited && (
                <div className="connection">
                  Match forfeited: {me!.forfeitedReason?.toLowerCase()}. You can
                  watch the outcome, then return to the lobby.
                </div>
              )}
              {phase === "RESULTS" ? (
                <>
                  <section className="results-banner panel">
                    <div className="eyebrow">
                      {match!.endReason === "NORMAL"
                        ? "FINAL SALVAGE REPORT"
                        : match!.endReason === "LAST_CAPTAIN"
                          ? "LAST CAPTAIN STANDING"
                          : "MATCH ABORTED"}
                    </div>
                    <h2>
                      {match!.winnerIds?.length
                        ? match!.winnerIds
                            .map(
                              (id) =>
                                pub!.players.find((p) => p.id === id)?.name,
                            )
                            .join(" & ")
                        : "No captains remain."}
                    </h2>
                    <p>
                      {match!.endReason === "NORMAL"
                        ? match!.winnerIds!.length > 1
                          ? "A shared victory. There’s enough glory for two."
                          : "Sector rights secured. Lawyers pending."
                        : "The crew left before eight rounds were completed."}
                    </p>
                  </section>
                  <section className="standings panel">
                    <h2>Manifest of questionable earnings</h2>
                    {ordered.map((p, i) => (
                      <div className="standing" key={p.id}>
                        <span className="rank">{i + 1}</span>
                        <span
                          className="identity"
                          style={{ color: COLORS[p.identitySlot] }}
                        >
                          ◆ 0{p.identitySlot + 1}
                        </span>
                        <div>
                          <strong>
                            {p.name}
                            {p.id === me!.id ? " · You" : ""}
                          </strong>
                          <small>
                            {p.stats.sitesWon} solo claims ·{" "}
                            {p.stats.sitesCoWon} shared · {p.stats.powerSpent}{" "}
                            power spent {p.forfeited ? "· Forfeited" : ""}
                          </small>
                        </div>
                        <strong className="credit">
                          {p.score} <small>CR</small>
                        </strong>
                      </div>
                    ))}
                  </section>
                  <div className="result-actions">
                    <button
                      className="secondary"
                      disabled={inactive || me!.forfeited}
                      onClick={() =>
                        void act("player:ready", { ready: !me!.ready })
                      }
                    >
                      {me!.ready ? "✓ Ready for rematch" : "Ready for rematch"}
                    </button>
                    {host ? (
                      <button
                        className="primary"
                        disabled={inactive}
                        onClick={() => void act("game:rematch")}
                      >
                        Return crew to lobby
                      </button>
                    ) : (
                      <p>The host can bring your crew back to the lobby.</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="power-strip">
                    <span>YOUR RESERVE</span>
                    <div
                      className="power-segments"
                      aria-label={`${me!.power} power, ${cost} allocated`}
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <i
                          key={i}
                          className={
                            i < me!.power
                              ? phase === "PLANNING" && i >= me!.power - cost
                                ? "spent"
                                : "full"
                              : ""
                          }
                        />
                      ))}
                    </div>
                    <span>
                      {phase === "PLANNING"
                        ? `${Math.max(0, me!.power - cost)} unallocated`
                        : `${me!.power} aboard`}
                    </span>
                  </div>
                  <div className="site-grid">
                    {match!.sites.map((s, i) => {
                      const siteResult =
                        result?.roundId === match!.roundId
                          ? result!.sites.find((r) => r.siteId === s.id)
                          : undefined;
                      const show =
                        phase === "SUMMARY" ||
                        (phase === "REVEAL" && elapsed >= i * 2200);
                      const mine = siteResult?.winnerIds.includes(me!.id);
                      return (
                        <article
                          className={`site-card panel ${show && mine ? "won" : ""}`}
                          key={s.id}
                        >
                          <div className="panel-heading">
                            <span className="eyebrow">
                              SITE 0{i + 1} / {s.tier.toUpperCase()} VALUE
                            </span>
                            <span
                              className={`modifier ${s.cost > 1 ? "hazard" : ""}`}
                            >
                              {s.cost > 1
                                ? "DOUBLE POWER"
                                : s.minimum > 1
                                  ? `MINIMUM ${s.minimum}`
                                  : s.bonus
                                    ? "SOLO +2"
                                    : "STANDARD"}
                            </span>
                          </div>
                          <div className="site-art">
                            <ShipArt kind={s.templateId} label={s.name} />
                            <span className="coordinates">
                              {s.templateId.slice(0, 3).toUpperCase()} / 0
                              {match!.roundNumber}
                              {i + 1}
                            </span>
                          </div>
                          <div className="site-heading">
                            <h2>{s.name}</h2>
                            <div className="site-value">
                              {s.credits}
                              <span>BASE CR</span>
                            </div>
                          </div>
                          <p className="flavor">{s.flavor}</p>
                          <div className="site-rule">
                            {s.cost > 1
                              ? "Each drone costs 2 power."
                              : s.minimum > 1
                                ? `Send at least ${s.minimum} drones to qualify.`
                                : s.bonus
                                  ? "Unique winner earns +2 extra credits."
                                  : "Highest claim wins. Tied leaders split."}
                          </div>
                          {phase === "PLANNING" ? (
                            <>
                              <div className="allocation">
                                <button
                                  aria-label={`Remove drone from ${s.name}`}
                                  disabled={
                                    inactive ||
                                    locked ||
                                    me!.forfeited ||
                                    draft[i] === 0
                                  }
                                  onClick={() => change(i, draft[i] - 1)}
                                >
                                  −
                                </button>
                                <label>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    max="8"
                                    aria-label={`Drones for ${s.name}`}
                                    disabled={
                                      locked || me!.forfeited || inactive
                                    }
                                    value={draft[i]}
                                    onChange={(e) =>
                                      change(i, Number(e.target.value))
                                    }
                                  />
                                  <span>DRONES</span>
                                </label>
                                <button
                                  aria-label={`Add drone to ${s.name}`}
                                  disabled={
                                    inactive ||
                                    locked ||
                                    me!.forfeited ||
                                    draft[i] >= 8 ||
                                    cost + s.cost > me!.power
                                  }
                                  onClick={() => change(i, draft[i] + 1)}
                                >
                                  +
                                </button>
                              </div>
                              <div className="bid-cost">
                                <span>{draft[i] * s.cost} power</span>
                                <span
                                  className={
                                    draft[i] > 0 && draft[i] < s.minimum
                                      ? "warning"
                                      : "muted"
                                  }
                                >
                                  {draft[i] > 0 && draft[i] < s.minimum
                                    ? "Below minimum · cannot win"
                                    : draft[i] === 0
                                      ? "No claim"
                                      : "Qualifying claim"}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div
                              className={`site-reveal ${show ? "revealed" : ""}`}
                            >
                              {siteResult ? (
                                <>
                                  <div
                                    className={`outcome ${show && mine ? "success" : ""}`}
                                  >
                                    {!show
                                      ? "COMPARING CLAIMS…"
                                      : siteResult.outcome === "UNCLAIMED"
                                        ? "NO QUALIFYING CLAIM"
                                        : siteResult.outcome === "TIED"
                                          ? `SHARED CLAIM · ${siteResult.creditsByPlayer[siteResult.winnerIds[0]]} CR EACH`
                                          : `${pub!.players.find((p) => p.id === siteResult.winnerIds[0])?.name} · ${siteResult.creditsByPlayer[siteResult.winnerIds[0]]} CR`}
                                  </div>
                                  {pub!.players.map((p) => {
                                    const allocation = result!.allocations.find(
                                      (a) => a.playerId === p.id,
                                    );
                                    const n =
                                      allocation?.bids.find(
                                        (b) => b.siteId === s.id,
                                      )?.drones ?? 0;
                                    return (
                                      <div
                                        className={
                                          show &&
                                          siteResult.winnerIds.includes(p.id)
                                            ? "claim winner"
                                            : "claim"
                                        }
                                        key={p.id}
                                      >
                                        <span
                                          style={{
                                            color: COLORS[p.identitySlot],
                                          }}
                                        >
                                          ◆
                                        </span>
                                        <span>{p.name}</span>
                                        <strong>
                                          {n} <small>DRONES</small>
                                        </strong>
                                        <small>{n * s.cost} PWR</small>
                                      </div>
                                    );
                                  })}
                                  {show &&
                                    siteResult.scrapped > 0 &&
                                    siteResult.outcome === "TIED" && (
                                      <small className="muted">
                                        {siteResult.scrapped} credits scrapped.
                                      </small>
                                    )}
                                </>
                              ) : (
                                <div className="revealing">
                                  All orders received.
                                  <br />
                                  Comparing claims…
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  {phase === "PLANNING" ? (
                    <div className="lock-bar panel">
                      <div>
                        <strong>
                          {locked
                            ? "Orders locked"
                            : `Deploy ${drones} drones · spend ${cost} power`}
                        </strong>
                        <span>
                          {locked
                            ? pub!.players
                                .filter((p) => !p.forfeited)
                                .every((p) =>
                                  match!.lockedPlayerIds.includes(p.id),
                                )
                              ? "All captains locked—revealing shortly."
                              : "Lock is final. Every drone costs power."
                            : `Keep ${Math.max(0, me!.power - cost)} power. No lock by deadline means pass.`}
                        </span>
                      </div>
                      <button
                        className="primary"
                        disabled={
                          inactive || locked || me!.forfeited || seconds === 0
                        }
                        onClick={() => void lock()}
                      >
                        {pending
                          ? "Submitting…"
                          : locked
                            ? "✓ Orders locked"
                            : `Lock orders · ${cost} power`}
                      </button>
                    </div>
                  ) : (
                    result && (
                      <div className="round-tally panel">
                        <div>
                          <span>YOUR HAUL</span>
                          <strong>
                            +{result.creditsEarned[me!.id]} <small>CR</small>
                          </strong>
                        </div>
                        <div>
                          <span>POWER SPENT</span>
                          <strong>−{result.powerSpent[me!.id]}</strong>
                        </div>
                        <div>
                          <span>
                            {match!.roundNumber === 8
                              ? "SWEEP COMPLETE"
                              : "RECHARGE"}
                          </span>
                          <strong>
                            {match!.roundNumber === 8
                              ? "—"
                              : `+${result.recharge[me!.id].applied}`}
                            <small>
                              {result.recharge[me!.id].consolation
                                ? " includes +1 recovery"
                                : ""}
                            </small>
                          </strong>
                        </div>
                        <p>
                          {result.allocations.find((a) => a.playerId === me!.id)
                            ?.source === "TIMEOUT"
                            ? "No orders received. Your drones stayed aboard."
                            : phase === "REVEAL"
                              ? "All claims revealed together."
                              : "Next coordinates incoming."}
                        </p>
                      </div>
                    )
                  )}
                  <div className="roster-wrap">
                    <button
                      className="quiet roster-toggle"
                      aria-expanded={roster}
                      onClick={() => setRoster(!roster)}
                    >
                      Crew manifest · {pub!.players.length} captains{" "}
                      {roster ? "−" : "+"}
                    </button>
                    <div className={`compact-roster ${roster ? "open" : ""}`}>
                      {ordered.map((p) => (
                        <div className="roster-player" key={p.id}>
                          <span
                            className="identity"
                            style={{ color: COLORS[p.identitySlot] }}
                          >
                            ◆ 0{p.identitySlot + 1}
                          </span>
                          <strong>
                            {p.name}
                            {p.id === me!.id ? " · You" : ""}
                          </strong>
                          <span>
                            {p.score} CR / {p.power} PWR
                          </span>
                          <small>
                            {p.forfeited
                              ? "Forfeited"
                              : !p.connected
                                ? "Away"
                                : phase === "PLANNING"
                                  ? match!.lockedPlayerIds.includes(p.id)
                                    ? "✓ Locked"
                                    : "Planning"
                                  : "Received"}
                          </small>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      )}
      <footer>
        <span>SALVAGE RIGHTS / INDEPENDENT OPERATORS ONLY</span>
        <span>PROPERTY STATUS: COMPLICATED</span>
      </footer>
      {help && (
        <Modal
          title="A 45-second captain’s briefing"
          onClose={() => setHelp(false)}
        >
          <p>
            Split your power between three wrecks. You’re bidding against
            friends, and every drone costs power—even when you lose.
          </p>
          <ol>
            <li>
              <strong>Deploy in secret.</strong> Allocate up to 8 drones per
              site. Keep some power in reserve if you want.
            </li>
            <li>
              <strong>Lock your orders.</strong> Locks are final. Without a lock
              at the deadline, your drones stay aboard.
            </li>
            <li>
              <strong>Reveal together.</strong> Highest qualifying claim wins.
              Tied leaders split the base credits, rounded down.
            </li>
            <li>
              <strong>Recharge.</strong> Gain 4 power between rounds, plus 1
              after earning zero credits. Maximum 12. No final recharge.
            </li>
            <li>
              <strong>Take the sector.</strong> Most credits after eight rounds
              wins. Equal scores share victory.
            </li>
          </ol>
          <div className="help-example">
            9-credit wreck: 3 drones beats 2.
            <br />
            Two captains sending 3 get 4 credits each.
          </div>
          <div className="help-modifiers">
            <p>
              <strong>MINIMUM 2 / 3</strong> Smaller claims cost power but
              cannot win.
            </p>
            <p>
              <strong>SOLO +2</strong> A unique winner earns two extra credits.
            </p>
            <p>
              <strong>DOUBLE POWER</strong> One drone costs two power. Its
              strength stays one.
            </p>
          </div>
          <p className="muted">
            Two consecutive missed rounds or 90 seconds disconnected forfeits
            your match. Deliberately locking zero drones counts as playing.
          </p>
          <button className="primary wide" onClick={() => setHelp(false)}>
            Understood. Let’s salvage.
          </button>
        </Modal>
      )}
      {leaveConfirm && (
        <Modal
          title="Abandon your claim?"
          onClose={() => setLeaveConfirm(false)}
        >
          <p>
            Leaving forfeits this match. Your crew can continue without you.
          </p>
          <div className="actions">
            <button
              className="secondary"
              onClick={() => setLeaveConfirm(false)}
            >
              Stay aboard
            </button>
            <button
              className="primary"
              disabled={inactive}
              onClick={() => void leave()}
            >
              Leave and forfeit
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      className="modal panel"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="quiet" aria-label="Close dialog" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
