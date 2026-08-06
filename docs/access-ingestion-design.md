# Access Ingestion & the Permission Store

**Design note · draft for engineering review · August 2026**

Companion to the HyperSync Permissions Layer PRD. Where the PRD specifies *how a decision is made*, this note specifies *where the facts that feed the decision come from, how they are stored, and in what order they take precedence.*

---

## 1. The decision this note resolves

Three candidate ways to learn an organisation's access facts have been proposed:

1. Sync each connected tool and read its native ACLs.
2. Integrate the organisation's IAM tool and fetch role-to-permission mappings.
3. Have an admin upload a CSV.

**These are not three alternatives.** They answer three different questions and write to three different planes of the store. Treating them as a menu leads to a system where the same fact arrives from two sources with no rule for which wins.

The resolution: build all three, on one store, with explicit precedence.

---

## 2. Three planes, not three options

The PRD's decision formula already partitions the problem:

```
Effective Access = Ceiling ∩ Grants − Deny ∩ Conditions
```

Each ingestion path fills a different term:

| Plane | Question it answers | Fed by | Written by a human? | Optional? |
|---|---|---|---|---|
| **Observed** (ceiling) | What *can* this identity do in this tool right now? | Tool sync | Never | **No** |
| **Identity** | Who is this principal, and which groups/roles expand for them? | IAM + HRMS | No (mappings may be corrected) | Not past pilot |
| **Intent** (policy) | What *should* this role be allowed to do? | Admin UI, CSV, role mining | Yes | No |

Two consequences worth stating plainly:

**Tool sync is infrastructure, not a feature.** The PRD's own words: *"a ceiling that is asserted but never snapshotted is not a ceiling."* Without a materialised observed plane there is nothing to intersect against, and "we can only narrow access, never widen it" becomes an unverifiable marketing claim rather than an enforced invariant.

**CSV is not a data-entry mechanism.** It is (a) the bootstrap before connectors are live, and (b) the permanent escape hatch for tools whose ACLs cannot be read — Zoho Books in the current catalogue has `sourcePermissionsCanRead: false`. It should never be the primary path for a tool we *can* read.

---

## 3. Data model

### 3.1 Principals

One internal, immutable identifier per principal, independent of every tool's own ID.

```
principals
  principal_id        prn_7f3a9c          PK, immutable, never reused
  kind                human | agent | service
  status              active | suspended | offboarded
  anchor_type         idp | hrms
  anchor_id           okta|00u1a2b3c4d    the immutable ID we trust
  display_name
  department, grade, location             cached from HRMS, not authoritative
  manager_principal_id
  created_at, updated_at
```

`kind` is a column, never a boolean flag on a person — the PRD requires agents to be a distinct identity type from day one.

### 3.2 External identity mappings

```
principal_identities
  principal_id        prn_7f3a9c
  connection_id       conn_jira
  external_id         557058:1a2b3c       the tool's immutable ID
  external_handle     ram.menon           display value; may change
  match_method        idp_id | hrms_id | email | manual | csv
  match_confidence    0.0 – 1.0
  verified_at
  UNIQUE (connection_id, external_id)
```

**Email is not an identifier.** It changes on marriage and on rebrand, and it gets reused after someone leaves. Anchor on the IdP's immutable ID, fall back to HRMS employee ID, and treat email as one alias among several with `match_method = email` and reduced confidence.

### 3.3 Unmatched accounts

```
unmatched_accounts
  connection_id, external_id, external_handle, email_seen
  first_seen_at, last_seen_at
  status              open | linked | ignored | flagged_orphan
```

An account in a tool that resolves to no principal is **a finding, not an error**. It is either a leaver who still has access, a shared login, or a service account nobody has claimed. Silently dropping these is the single easiest way for this product to miss the thing a customer bought it to catch.

### 3.4 Resources

```
resources
  resource_id         res_9f2c            PK, internal
  connection_id, external_id, type, name
  parent_resource_id                      inheritance edge
  sensitivity_label                        optional
  UNIQUE (connection_id, external_id)
```

### 3.5 Observed grants — the ceiling

Written **only** by connectors. No admin-facing write path exists.

```
observed_grants
  snapshot_id
  connection_id, resource_id
  subject_type        principal | group | native_role
  subject_id
  action              canonical action name
  inherited_from      resource_id | null
  source_detail       jsonb   native role name, sharing type, etc.
  observed_at
```

Snapshot-scoped so two snapshots can be diffed for drift (§6).

### 3.6 Policy grants — the intent

```
policy_grants
  grant_id
  role_id | principal_id                  role grants preferred; direct grants are exceptions
  connection_id
  resource_selector   jsonb   {mode: all|specific|query, resource_ids:[], match:{}}
  action
  effect              allow | deny
  conditions          jsonb   time, location, device, reason_required, expiry
  field_obligations   jsonb   {"Bank details": "hidden", "Salary": "masked"}
  source              ui | csv | mining | hrms_rule
  created_by, created_at, expires_at
```

`resource_selector` supports a query mode deliberately: `{match: {sensitivity: "confidential"}}` scales to resource sets that do not yet exist, which enumerated ID lists cannot.

### 3.7 Why tuples, not embedded ACL arrays

The shape originally proposed —

```json
{ "document_id": "123", "allowed_users": ["U100"], "allowed_groups": ["Engineering"] }
```

— is **correct as a search-index projection** (§3.8) and **wrong as the system of record**, for four reasons:

| Problem | Consequence |
|---|---|
| No action dimension | `view`, `edit`, `export`, `share` collapse into one verb. The permission matrix cannot be represented. |
| No deny | The PRD requires deny to beat any grant. An allow-list cannot express deny. |
| No inheritance | Folder → file is how every storage tool actually works. Flattening it loses *why* access exists, so revoking at the folder is unrepresentable. |
| Write amplification | One group-membership change rewrites every affected document. At Drive/Confluence volumes this is the thing that breaks first. |

The tuple form `(subject, relation, object)` plus inheritance edges is the Google Zanzibar / OpenFGA model. Recommendation: adopt it rather than invent one — inheritance and group expansion are already solved there, and it is a model engineers can be hired against.

### 3.8 The index projection

Denormalised onto each indexed record to make permission **pre-filtering** possible, which the PRD mandates alongside a post-check:

```json
{
  "resource_id": "res_9f2c",
  "connection_id": "conn_drive",
  "acl_version": 184,
  "allow_principals": ["prn_7f3a9c"],
  "allow_groups":     ["grp_engineering", "grp_finance_mgmt"],
  "allow_roles":      ["role_finance_manager"],
  "deny_principals":  ["prn_11d4e8"],
  "observed_at": "2026-08-06T12:00:00Z"
}
```

**Keep groups as groups. Do not expand them into `allow_principals`.** The original proposal had `allowed_groups` as a separate array, and that instinct is right and load-bearing: if groups are pre-expanded to individuals, every membership change triggers a mass reindex. Storing the group and expanding the *caller's* group set at query time moves the cost from write to read, where it is bounded by one person's group count instead of a group's member count.

Query shape (the group + role expansion sketched in the original working notes):

```
search(
  filter = {
    should: [ allow_principals ∈ {prn_7f3a9c},
              allow_groups     ∈ {grp_engineering, grp_platform},
              allow_roles      ∈ {role_finance_manager} ],
    must_not: [ deny_principals ∈ {prn_7f3a9c} ]
  }
)
→ then post-check every returned record through the PDP
```

`acl_version` exists so a revoke can invalidate outstanding decisions immediately rather than at the next sync.

---

## 4. Ingestion precedence

Rules, in order. These are the arbitration logic the whole store depends on.

1. **Connectors alone write `observed_grants`.** There is no UI or CSV path into the ceiling. This is what makes the ceiling trustworthy.

2. **Policy can never produce access beyond observed.** Enforced at *evaluation* time, not write time — so policy may be authored before a tool's first sync.

3. **Authoring beyond the ceiling is allowed but must warn.** *"This grant exceeds current observed access for 3 of 14 members and will have no effect until it is provisioned in the source tool."* Blocking the write would make legitimate ahead-of-provisioning authoring impossible; hiding the discrepancy would make the UI lie.

4. **CSV writes intent only.** With one exception: for a connector where `canReadACL = false`, an admin may upload a **declared ceiling**. It is stored with `source = declared`, carries lower assurance, and must be visually distinguished everywhere it appears. A declared ceiling is a promise, not an observation, and the product should never present the two identically.

5. **IAM writes identity and membership only** — `principals`, `principal_identities`, `groups`, `group_members`, and optionally group → role mappings. IAM knows groups; it very rarely knows document-level ACLs. Expecting role-to-permission mappings out of an IdP is the most common false assumption in this space.

6. **HRMS is authoritative for attributes** (department, grade, status, manager), which drive assignment rules. It is never authoritative for permissions.

Conflict cases:

| Conflict | Resolution |
|---|---|
| Two sources map the same external account to different principals | Higher `match_confidence` wins; tie → `unmatched_accounts` for human resolution. Never guess. |
| CSV grant contradicts a UI-authored grant | Last write wins, both retained in audit. CSV import always previews a diff before applying. |
| Observed access exists with no matching policy | Not a conflict — this is **intent drift** (§6) and a compliance finding. |
| Policy exists with no matching observed access | Ineffective grant. Surface it; do not delete it. |

---

## 5. Role mining — how the intent plane gets bootstrapped

The strategic point. **No organisation knows who has access to what** — that is why they are buying this. Asking an admin to author roles from an empty screen inverts the value proposition and turns onboarding into a multi-week project.

Instead, derive a proposal from the observed plane:

1. **Cohort first, cluster second.** Group principals by HRMS attributes (department × grade) *before* measuring similarity. Blind clustering produces mathematically valid roles that nobody can name or defend in an approval meeting. Cohorts produce roles called "Finance Ops, M2+", which an admin can actually sign off on.

2. **Within a cohort**, reduce each principal to a grant set at `(connection, resource_type, action)` granularity, and take the intersection held by ≥ 80% of the cohort. That intersection is the proposed role.

3. **Everything below the threshold is an outlier**, listed individually with three dispositions: *fold into role*, *keep as documented exception*, or *revoke*.

4. **Nothing applies without approval.** Output is a preview diff, consistent with the PRD's plan-then-apply invariant.

5. **Re-run** quarterly and whenever a cohort's membership changes materially.

The outliers are the product's first deliverable finding — the over-provisioning report — available before the customer has configured anything. Time-to-first-value drops from weeks to an afternoon, and CSV becomes bulk *correction* of a pre-populated system rather than data entry into an empty one.

---

## 6. Freshness, drift and revocation

Two distinct kinds of drift, often conflated:

| Kind | Definition | Means | Owner |
|---|---|---|---|
| **Ceiling drift** | Live tool ACL ≠ our last snapshot | Our decisions may be *wrong right now* | Engineering / on-call |
| **Intent drift** | Observed access ≠ what policy says | Someone changed access directly in the tool, bypassing us | Compliance / the resource owner |

Ceiling drift is an availability-of-correctness problem. Intent drift is the compliance finding customers pay for. They surface in the same reconciliation queue but route to different people.

**Snapshot cadence** should follow the fetching strategy already chosen per category (HRMS stored/indexed; accounting, storage, KB hybrid; developer tools live). Concrete TTLs are an open decision (§9).

**Revocation is synchronous.** On any revoke: bump `acl_version`, purge or repatch the affected index entries immediately. Waiting for the next scheduled sync leaves a window in which the index authorises access that policy has already removed — explicitly called out in the connector-architecture note.

---

## 7. Connector contract additions

The five operations already defined in the connector-architecture note, with the access-read operation specified:

```
authenticate()
listResourceTypes()
discoverResources(cursor)         → resources[]
readNativeAccess(resourceIds[])   → [{ resource_id, subject_type, subject_id,
                                       actions[], inherited_from }]
grantAccess(...) / revokeAccess(...)
```

Each connector must additionally declare:

```
canReadACL          boolean
canWriteACL         boolean
aclGranularity      resource | container | tenant_only
supportsAclDelta    boolean    webhook or delta token for incremental ACL change
```

Degraded modes, so the product behaves predictably instead of silently:

| Capability | Behaviour |
|---|---|
| `canReadACL = false` | Ceiling must be declared via CSV; flagged lower-assurance everywhere |
| `aclGranularity = container` | Inherit to children; never claim per-file precision we do not have |
| `supportsAclDelta = false` | Full re-snapshot on a schedule; drift window equals the sync interval and must be shown in the UI |
| `canWriteACL = false` | Provisioning produces a manual task, as the prototype already does for Zoho Books |

---

## 8. Phasing

| Phase | Ships | Exit criteria |
|---|---|---|
| **0** | Principals, `principal_identities`, unmatched queue. IAM + HRMS ingestion. | Every tool account either maps to a principal or sits in the unmatched queue. Zero silent drops. |
| **1** | `observed_grants` + snapshots for the connectors where `canReadACL = true`. | A real per-identity ceiling exists. The PDP intersects against it, and the property test `effective ⊆ ceiling` passes. |
| **2** | Role mining + preview/approve. CSV import writes intent. | An admin can go from connected tools to an approved role set in one session. |
| **3** | Index projection + pre-filter, `acl_version` invalidation, drift reconciliation. | Revoke-then-ask excludes the revoked data on the next question. Both drift classes are reported. |

Phase 1 is the one that converts the trust story from a claim into an enforced invariant, and it should not be deferred behind Phase 2's demo appeal.

---

## 9. Open decisions

1. **Snapshot TTL per category**, and the maximum acceptable drift window we are willing to state to a customer.
2. **Tuple store: build or adopt?** SpiceDB / OpenFGA give inheritance and group expansion immediately, at the cost of a new operational dependency.
3. **Group expansion depth limit.** Nested groups can cycle; a bound and a cycle detector are both required.
4. **Declared-ceiling assurance model** — do we let a declared ceiling authorise a *read* in the Context Layer at all, or only support provisioning?
5. **Role-mining threshold** (80% is a starting guess) and minimum cohort size below which mining is not offered.
6. **Whether direct principal grants are permitted** in v1 or roles are mandatory. Direct grants are convenient and become an ungovernable long tail.

---

## Appendix — worked example

Sana Khan asks *"what are our top support tickets?"*

1. **Identity.** Session resolves to `prn_4c81f2`. Expansion adds `grp_support_ops` (IAM) and `role_support_agent` (HRMS rule *Department = Support AND Status = Active*).
2. **Pre-filter.** Index query on `allow_principals ∈ {prn_4c81f2}` OR `allow_groups ∈ {grp_support_ops}` OR `allow_roles ∈ {role_support_agent}`, minus any deny. Returns candidates from Jira and Confluence; the Zoho Books and Darwinbox records are never read.
3. **Ceiling.** For each candidate, `observed_grants` confirms the Jira account behind `prn_4c81f2` genuinely holds `View ticket` on `tickets_support`. Any candidate failing this is dropped even if policy allowed it.
4. **Policy.** `role_support_agent` allows `View ticket`; no deny matches.
5. **Conditions.** Employment status active, no reason required for this action.
6. **Obligations.** `field_obligations` returns `Internal comments: hidden`, `Customer personal information: masked`, `Attachment URLs: masked`. The hidden field is never loaded; the masked fields are redacted before the answer is assembled.
7. **Disclosure.** Three matching records were excluded. The answer says so, without revealing what they were.
8. **Audit.** One decision event per candidate, recording actor, resource, outcome, reason code and policy version.

Steps 2 and 3 are both mandatory. Pre-filter alone is unsafe because index tags go stale; post-check alone is wrong because the top-K can be entirely unauthorised, producing an empty or misleading answer.
