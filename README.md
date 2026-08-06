# HyperSync — Permissions Layer & Context Layer

An interactive prototype of the HyperSync unified permissions layer: one Decision Service that answers a single question — *"is this identity allowed to perform this action on this resource, right now?"* — and three thin consumers built on top of it.

> Prototype only. All data is synthetic and held in `localStorage`; there is no backend and no real tool is contacted.

## The three surfaces

**Dashboard** — the permissions-layer enabler. One switch puts the Decision Service into enforcing or default-closed mode, with a readiness checklist (tools connected, roles scoped, people mapped, agents governed), the connected-tool inventory, and a recent-activity feed.

**Context Layer** — ask a plain-English question across every connected tool. Each candidate record is run through the Decision Service before it can enter an answer, so a reply is assembled only from what the asker may already read. Masked and withheld fields, excluded sources, and the full four-step decision trace are all shown inline.

**Permissions** — roles and the permission matrix, employees and their effective access, HRMS assignment rules with a joiner/mover/leaver simulator, AI-agent governance, and the access simulator.

## The decision model

```
Effective Access = Source Ceiling ∩ Role Grants − Explicit Deny ∩ Conditions
```

Four questions, asked in order, for every request:

1. **What does the tool itself allow?** A hard ceiling — the engine can only narrow it, never widen it.
2. **What does their role allow?** Grants are scoped to specific resources and actions.
3. **Is anything explicitly blocked?** A deny always beats any grant.
4. **Do current conditions apply?** Time window, location, managed device, reason-required, employment status.

A decision returns **obligations**, not just Allow/Deny. Fields resolve to `Visible`, `Masked`, `Hidden` or `Aggregate Only`, which is what makes cross-tool answers safe generically rather than per-tool.

Partial answers are always **disclosed, never silently truncated** — quietly dropping rows from an aggregate produces confidently wrong numbers, which is a worse failure than a refusal.

## Try these

Switch identity with the **Asking as** selector on the Context Layer:

| Ask as | Question | What the engine does |
|---|---|---|
| Rahul Menon (Finance Manager) | *What is our invoice and collections position this quarter?* | Answers from Zoho Books + Confluence; masks the bank account number; discloses the excluded Jira source |
| Sana Khan (Support Agent) | *What are our top support tickets?* | Answers from Jira + the support KB; masks customer PII and attachment URLs; withholds internal comments |
| Priya Nair (HR Administrator) | *Show me compensation bands by grade* | **Denies until a reason is entered** — her role is reason-required. With a reason: salary visible, bank details withheld, identity numbers masked |
| Jia Fernandes (Contractor) | *Show me the on-call runbook* | Returns file metadata only; file content is withheld entirely |

Then turn the permissions layer **off** on the Dashboard and re-ask anything — the Context Layer, the Access Simulator and the agent gateway all go default-deny together, because they share one engine.

## Running locally

No build step and no dependencies. Serve the folder over HTTP (ES modules will not load from `file://`):

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173.

## Layout

| File | Responsibility |
|---|---|
| `src/evaluator.js` | The Decision Service — the four-step check for both people and agents, plus lifecycle simulation |
| `src/context.js` | Cross-tool document corpus and the permission-aware answer engine |
| `src/state.js` | Seed data, the permission model, and the `localStorage`-backed store |
| `src/catalogue.js` | Tool capability catalogue — resource types, actions and their risk tiers |
| `src/app.js` | Router, rendering and all interaction handling |
| `src/styles.css` | Design tokens and every component style |

**Reset Demo Data** in the sidebar clears `localStorage` and restores the seeded state.
