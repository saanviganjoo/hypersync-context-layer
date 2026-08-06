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

Each connected tool holds its own record set (`src/datasets.js`). Answers are **computed from only the rows the asker may read**, so the same question returns different — and individually correct — numbers.

Switch identity with the **Asking as** selector on the Context Layer.

**Ask the same question as two people:**

| Ask as | *What is our invoice and collections position?* |
|---|---|
| Rahul Menon (Finance Manager) | **8 invoices · ₹1.65 Cr · ₹44.25 L overdue** — India entity only, 4 records withheld |
| Aditi Rao (Finance Director) | **12 invoices · ₹3.99 Cr · ₹1.40 Cr overdue** — India + US entities |

| Ask as | *How many open tickets do we have?* |
|---|---|
| Sana Khan (Support Agent) | **9 open · 2 breaching SLA** — support queue only; internal comments withheld, customer PII masked |
| Vikram Sethi (Support Lead) | **14 open · 3 breaching SLA** — support + finance queues; internal comments visible |

Neither number is wrong. Each is the correct answer *for that person's access*, and the answer says so rather than presenting a partial total as complete.

**Other behaviours worth seeing:**

| Ask as | Question | What the engine does |
|---|---|---|
| Priya Nair (HR Administrator) | *Show me compensation bands by grade* | **Denies until a reason is entered** — her role is reason-required. With a reason: median CTC computed, bank details withheld, identity numbers masked |
| Jia Fernandes (Contractor) | *Show me the on-call runbook* | Returns the file row — title, size, updated — with **file content withheld entirely** |
| Kabir Sharma (General Employee) | *What is our invoice position?* | No answer assembled; both matching sources excluded by the Decision Service |

Then turn the permissions layer **off** on the Dashboard and re-ask anything — the Context Layer, the Access Simulator and the agent gateway all go default-deny together, because they share one engine.

## Design notes

- [Access Ingestion & the Permission Store](docs/access-ingestion-design.md) — where access facts come from (tool sync, IAM, CSV), how they are stored, and which source wins on conflict. Draft for engineering review.

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
| `src/datasets.js` | Each tool's record set — the dummy database the answers are computed from |
| `src/context.js` | Permission-aware retrieval: one decision per resource, then aggregation over permitted rows only |
| `src/state.js` | Seed data, the permission model, and the `localStorage`-backed store |
| `src/catalogue.js` | Tool capability catalogue — resource types, actions and their risk tiers |
| `src/app.js` | Router, rendering and all interaction handling |
| `src/styles.css` | Design tokens and every component style |

**Reset Demo Data** in the sidebar clears `localStorage` and restores the seeded state.
