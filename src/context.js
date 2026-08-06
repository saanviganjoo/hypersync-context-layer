import { evaluateUserAccess } from "./evaluator.js";

export const fetchModes = {
  HRMS: { mode: "Stored / Indexed", note: "Unified schema is proven here, so records are indexed for fast structured search." },
  Ticketing: { mode: "Hybrid", note: "Light metadata is indexed for search; ticket bodies are fetched live at answer time." },
  Accounting: { mode: "Hybrid", note: "Financial line items are never stored at rest; only search metadata is indexed." },
  Storage: { mode: "Hybrid", note: "File content is large and sensitive, so only a metadata index is kept." },
  "Knowledge Base": { mode: "Hybrid", note: "Pages are semantically indexed; the full body is fetched live." },
  "Developer Tools": { mode: "Live Fetch", note: "Low chat volume, so nothing is synced — the source API is called per question." }
};

const field = (label, value, sensitive = false) => ({ label, value, sensitive });

export const corpus = [
  {
    id: "doc_invoice_register",
    title: "FY26 Q1 invoice register",
    connectionId: "conn_zoho",
    resourceType: "Invoices",
    resourceId: "invoices_india",
    action: "View invoices",
    keywords: ["invoice", "invoices", "billing", "revenue", "receivable", "finance", "q1", "outstanding", "unpaid"],
    summary: "412 invoices raised in Q1 FY26 worth ₹8.42 Cr, of which ₹1.19 Cr is still outstanding past due date.",
    fields: [
      field("Invoice count", "412"),
      field("Invoiced value", "₹8.42 Cr"),
      field("Outstanding past due", "₹1.19 Cr"),
      field("Tax identifier", "00SAMPLE0000X1ZS", true),
      field("Bank account number", "SAMPLEBANK 0000 0000 0000", true)
    ]
  },
  {
    id: "doc_payment_aging",
    title: "Vendor payment aging",
    connectionId: "conn_zoho",
    resourceType: "Payments",
    resourceId: "payments_india",
    action: "View payments",
    keywords: ["payment", "payments", "vendor", "aging", "payable", "overdue", "cash", "finance", "spend"],
    summary: "₹64.7 L is payable to vendors, with ₹11.2 L aged beyond 60 days across 23 vendors.",
    fields: [
      field("Total payable", "₹64.7 L"),
      field("Aged over 60 days", "₹11.2 L"),
      field("Vendors affected", "23"),
      field("Payment details", "NEFT · A/C 0000 0000 0000 · IFSC SMPL0000000", true)
    ]
  },
  {
    id: "doc_chart_of_accounts",
    title: "India chart of accounts",
    connectionId: "conn_zoho",
    resourceType: "Accounts",
    resourceId: "accounts_master",
    action: "View accounts",
    keywords: ["account", "accounts", "ledger", "chart", "cost centre", "cost center", "finance", "books"],
    summary: "148 active ledgers across 6 cost centres; 4 ledgers were reclassified during the Q1 close.",
    fields: [
      field("Active ledgers", "148"),
      field("Cost centres", "6"),
      field("Reclassified in Q1", "4")
    ]
  },
  {
    id: "doc_support_backlog",
    title: "Support ticket backlog",
    connectionId: "conn_jira",
    resourceType: "Tickets",
    resourceId: "tickets_support",
    action: "View ticket",
    keywords: ["ticket", "tickets", "support", "backlog", "customer", "sla", "escalation", "issue", "queue", "top"],
    summary: "187 open support tickets. Refund delays are the largest driver at 41 tickets, followed by KYC failures at 28.",
    fields: [
      field("Open tickets", "187"),
      field("Breaching SLA", "22"),
      field("Top driver", "Refund delays (41)"),
      field("Customer personal information", "sample.customer@example.com · +91 90000 00000", true),
      field("Attachment URLs", "https://files.jira.internal/att/9931-kyc-doc.pdf", true)
    ]
  },
  {
    id: "doc_finance_tickets",
    title: "Finance operations ticket queue",
    connectionId: "conn_jira",
    resourceType: "Tickets",
    resourceId: "tickets_finance",
    action: "View ticket",
    keywords: ["ticket", "tickets", "finance", "reconciliation", "queue", "invoice", "close", "issue"],
    summary: "34 open finance-ops tickets, mostly reconciliation breaks raised during the Q1 close.",
    fields: [
      field("Open tickets", "34"),
      field("Reconciliation breaks", "19"),
      field("Oldest open item", "26 days")
    ]
  },
  {
    id: "doc_internal_comments",
    title: "Internal triage notes on escalations",
    connectionId: "conn_jira",
    resourceType: "Comments",
    resourceId: "jira_internal_comments",
    action: "View internal comments",
    keywords: ["comment", "comments", "internal", "note", "notes", "triage", "escalation", "support"],
    summary: "Internal-only triage commentary on the 22 SLA-breaching escalations.",
    fields: [
      field("Internal comments", "Customer threatened churn — offered goodwill credit of ₹15,000", true),
      field("Escalations noted", "22")
    ]
  },
  {
    id: "doc_audit_findings",
    title: "FY26 statutory audit findings",
    connectionId: "conn_drive",
    resourceType: "Files",
    resourceId: "file_audit_report",
    action: "Read file content",
    keywords: ["audit", "statutory", "findings", "compliance", "control", "finance", "risk", "report"],
    summary: "7 audit observations, 2 rated high severity — both relate to approval evidence on high-value payments.",
    fields: [
      field("Observations", "7"),
      field("High severity", "2"),
      field("Management responses due", "2026-09-15"),
      field("External sharing", "Shared with external-auditor@example.com", true)
    ]
  },
  {
    id: "doc_policy_handbook",
    title: "Employee handbook FY26",
    connectionId: "conn_drive",
    resourceType: "Files",
    resourceId: "file_policy_handbook",
    action: "Read file content",
    keywords: ["policy", "handbook", "leave", "holiday", "expense", "reimbursement", "employee", "benefit", "hr"],
    summary: "Leave, expense and remote-work policy for FY26. Expense claims must be filed within 30 days of spend.",
    fields: [
      field("Annual leave", "24 days"),
      field("Expense filing window", "30 days"),
      field("Remote work", "Up to 10 days per quarter"),
      field("File download", "handbook-fy26.pdf (4.2 MB)", true)
    ]
  },
  {
    id: "doc_eng_runbook",
    title: "Platform on-call runbook",
    connectionId: "conn_drive",
    resourceType: "Files",
    resourceId: "file_eng_runbook",
    action: "View file metadata",
    keywords: ["runbook", "on-call", "oncall", "incident", "platform", "engineering", "escalation", "ops"],
    summary: "On-call rotation, escalation ladder and recovery procedures for the platform services.",
    fields: [
      field("Last updated", "2026-07-28"),
      field("Owner", "Ishaan Mehta"),
      field("File content", "Step 1: page the primary on-call via OpsGenie rotation platform-primary…", true)
    ]
  },
  {
    id: "doc_headcount",
    title: "Headcount by department",
    connectionId: "conn_darwinbox",
    resourceType: "Employees",
    resourceId: "emp_all",
    action: "Search employees",
    keywords: ["headcount", "employee", "employees", "people", "department", "team", "size", "hiring", "attrition", "hr"],
    summary: "142 active employees. Engineering is the largest function at 48, followed by Support at 31.",
    fields: [
      field("Active employees", "142"),
      field("Largest function", "Engineering (48)"),
      field("Joined in Q1", "17"),
      field("Personal address", "14 Brigade Road, Bengaluru 560001", true),
      field("Identity numbers", "PAN SAMPLE0000X · National ID 0000 1111 2222", true)
    ]
  },
  {
    id: "doc_compensation",
    title: "Compensation bands by grade",
    connectionId: "conn_darwinbox",
    resourceType: "Employees",
    resourceId: "emp_all",
    action: "View compensation",
    keywords: ["salary", "compensation", "pay", "band", "ctc", "payroll", "grade", "increment", "hr"],
    summary: "Median CTC by grade, from L1 through M5, with the FY26 increment pool at 9.4% of payroll.",
    fields: [
      field("Median M3 CTC", "₹42.0 L"),
      field("Median L2 CTC", "₹14.5 L"),
      field("Increment pool", "9.4% of payroll"),
      field("Salary", "Individual salary lines available for 142 employees", true),
      field("Bank details", "Per-employee salary account and IFSC", true)
    ]
  },
  {
    id: "doc_attendance",
    title: "Attendance and leave summary",
    connectionId: "conn_darwinbox",
    resourceType: "Attendance",
    resourceId: "attendance_all",
    action: "Aggregate",
    keywords: ["attendance", "leave", "absence", "present", "utilisation", "utilization", "hr", "time"],
    summary: "Average attendance of 21.4 days per month; 6.1% of the workforce is on approved leave on a typical day.",
    fields: [
      field("Average days present", "21.4"),
      field("On leave (typical day)", "6.1%"),
      field("Unapproved absences", "12 this quarter")
    ]
  },
  {
    id: "doc_qbr",
    title: "Quarterly finance review",
    connectionId: "conn_confluence",
    resourceType: "Pages",
    resourceId: "page_qbr",
    action: "View page",
    keywords: ["qbr", "quarterly", "review", "finance", "board", "performance", "revenue", "update", "q1"],
    summary: "Q1 closed 4% ahead of plan on revenue; collections lag is the single flagged risk going into Q2.",
    fields: [
      field("Revenue vs plan", "+4%"),
      field("Flagged risk", "Collections lag"),
      field("Next review", "2026-09-05")
    ]
  },
  {
    id: "doc_onboarding",
    title: "Employee onboarding guide",
    connectionId: "conn_confluence",
    resourceType: "Pages",
    resourceId: "page_onboarding",
    action: "View page",
    keywords: ["onboarding", "joining", "new hire", "induction", "employee", "day one", "hr", "setup"],
    summary: "Day-one checklist covering IT setup, statutory paperwork and the first-week buddy programme.",
    fields: [
      field("Checklist items", "18"),
      field("Owner", "Priya Nair"),
      field("Buddy programme", "First 2 weeks")
    ]
  },
  {
    id: "doc_support_playbook",
    title: "Refund escalation playbook",
    connectionId: "conn_confluence",
    resourceType: "Pages",
    resourceId: "page_support_playbook",
    action: "View page",
    keywords: ["refund", "escalation", "playbook", "support", "process", "customer", "sla", "resolution"],
    summary: "Refunds above ₹25,000 escalate to the Support Lead; anything above ₹1 L needs finance sign-off.",
    fields: [
      field("Auto-approve limit", "₹25,000"),
      field("Finance sign-off above", "₹1,00,000"),
      field("Target resolution", "48 hours")
    ]
  },
  {
    id: "doc_eng_architecture",
    title: "Platform architecture decisions",
    connectionId: "conn_confluence",
    resourceType: "Pages",
    resourceId: "page_eng_architecture",
    action: "View page",
    keywords: ["architecture", "design", "platform", "decision", "adr", "engineering", "system", "service"],
    summary: "31 accepted architecture decisions; the most recent moves connector sync to an event-driven queue.",
    fields: [
      field("Accepted decisions", "31"),
      field("Latest decision", "Event-driven connector sync"),
      field("Superseded", "5")
    ]
  },
  {
    id: "doc_pull_requests",
    title: "Open pull request activity",
    connectionId: "conn_github",
    resourceType: "Pull Requests",
    resourceId: "gh_prs",
    action: "View pull request",
    keywords: ["pull request", "pr", "prs", "code review", "merge", "engineering", "velocity", "github", "open"],
    summary: "64 open pull requests; median time to first review is 9 hours and 11 PRs have been open over a week.",
    fields: [
      field("Open pull requests", "64"),
      field("Median time to review", "9 hours"),
      field("Stale over 7 days", "11")
    ]
  },
  {
    id: "doc_backend_repo",
    title: "backend-services repository map",
    connectionId: "conn_github",
    resourceType: "Repositories",
    resourceId: "repo_backend",
    action: "Read code",
    keywords: ["repository", "repo", "code", "backend", "service", "engineering", "github", "codebase"],
    summary: "27 services in backend-services; the connector and permissions modules account for most recent change.",
    fields: [
      field("Services", "27"),
      field("Commits this month", "418"),
      field("Most changed module", "connectors/")
    ]
  }
];

const STOP_WORDS = new Set([
  "what", "whats", "how", "why", "when", "where", "who", "which", "the", "a", "an", "is", "are", "was", "were",
  "do", "does", "did", "our", "we", "us", "my", "me", "i", "you", "for", "of", "in", "on", "at", "to", "from",
  "and", "or", "with", "about", "show", "give", "tell", "get", "list", "any", "some", "this", "that", "there",
  "it", "its", "be", "been", "can", "could", "should", "would", "have", "has", "had", "much", "many", "please"
]);

function tokenize(question) {
  return String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function scoreDocument(doc, tokens, connection) {
  if (!tokens.length) return 0;
  const haystack = `${doc.title} ${doc.summary} ${doc.keywords.join(" ")} ${connection?.category || ""} ${connection?.sourceTool || ""}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (doc.keywords.includes(token)) score += 3;
    else if (haystack.includes(token)) score += 1;
  }
  return score;
}

function maskValue(value) {
  const text = String(value ?? "");
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 6) return `•••• •••• ${digits.slice(-4)}`;
  return "•••••••• restricted";
}

function applyFieldObligations(doc, fieldRestrictions) {
  const visible = [];
  const masked = [];
  const hidden = [];
  for (const item of doc.fields) {
    const mode = fieldRestrictions?.[item.label];
    if (mode === "Hidden") {
      hidden.push(item.label);
      continue;
    }
    if (mode === "Masked") {
      masked.push(item.label);
      visible.push({ ...item, value: maskValue(item.value), masked: true });
      continue;
    }
    if (item.sensitive && !mode) {
      hidden.push(item.label);
      continue;
    }
    visible.push({ ...item, masked: false });
  }
  return { visible, masked, hidden };
}

function denialHeadline(decision) {
  const steps = decision.pipelineSteps || [];
  // A passing step would read as an approval, so report the earliest step that actually blocked.
  const blocking = steps.find((item) => item.status === "fail") || steps.find((item) => item.status === "warn");
  if (blocking) return blocking.detail;
  return decision.explanation?.at(-1) || "No active role grants this resource.";
}

/**
 * Runs the same Decision Service used by the Access Simulator over every candidate
 * document, so an answer can only ever be built from records the asker may already read.
 */
export function answerQuestion(state, { employeeId, question, managedDevice = true, reason = "" }) {
  const employee = state.employees.find((item) => item.id === employeeId);
  const tokens = tokenize(question);
  const layerEnabled = state.app?.permissionsLayerEnabled !== false;

  const candidates = corpus
    .map((doc) => {
      const connection = state.connections.find((item) => item.id === doc.connectionId);
      return { doc, connection, score: scoreDocument(doc, tokens, connection) };
    })
    .filter((item) => item.score > 0 && item.connection)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const result = {
    question,
    askedBy: employee?.name || "Unknown",
    askedAt: new Date().toISOString(),
    layerEnabled,
    sources: [],
    excluded: [],
    obligations: [],
    toolsSearched: [...new Set(candidates.map((item) => item.connection.connectionName))]
  };

  if (!layerEnabled) {
    result.answer = "The permissions layer is switched off, so the Decision Service is returning default-deny for every record. No answer can be assembled until it is enabled again.";
    result.excluded = candidates.map(({ doc, connection }) => ({
      title: doc.title,
      connectionName: connection.connectionName,
      reason: "Permissions layer disabled — the engine is default-closed."
    }));
    return result;
  }

  if (!employee) {
    result.answer = "No identity was resolved for this question, so nothing can be retrieved.";
    return result;
  }

  if (!candidates.length) {
    result.answer = "Nothing in the connected tools matched that question. Try naming a record type — invoices, tickets, headcount, policies, pull requests — or the tool it lives in.";
    return result;
  }

  for (const { doc, connection } of candidates) {
    const decision = evaluateUserAccess(state, {
      employeeId: employee.id,
      connectionId: connection.id,
      resourceType: doc.resourceType,
      resourceId: doc.resourceId,
      action: doc.action,
      runtimeContext: { managedDevice, reason }
    });
    if (decision.final !== "Allow") {
      result.excluded.push({
        title: doc.title,
        connectionName: connection.connectionName,
        category: connection.category,
        reason: denialHeadline(decision),
        decision
      });
      continue;
    }
    const { visible, masked, hidden } = applyFieldObligations(doc, decision.fieldRestrictions);
    result.sources.push({
      docId: doc.id,
      title: doc.title,
      summary: doc.summary,
      connectionName: connection.connectionName,
      category: connection.category,
      tool: connection.sourceTool,
      action: doc.action,
      resourceId: doc.resourceId,
      fetchMode: fetchModes[connection.category]?.mode || "Hybrid",
      fetchNote: fetchModes[connection.category]?.note || "",
      appliedRoles: decision.appliedRoles,
      approvalRequired: decision.requiredApproval,
      fields: visible,
      maskedFields: masked,
      hiddenFields: hidden,
      decision
    });
  }

  const maskedTotal = [...new Set(result.sources.flatMap((source) => source.maskedFields))];
  const hiddenTotal = [...new Set(result.sources.flatMap((source) => source.hiddenFields))];
  if (maskedTotal.length) result.obligations.push(`Masked: ${maskedTotal.join(", ")}`);
  if (hiddenTotal.length) result.obligations.push(`Withheld: ${hiddenTotal.join(", ")}`);
  if (result.sources.some((source) => source.approvalRequired)) result.obligations.push("Approval required before any write action on these records");

  if (!result.sources.length) {
    result.answer = `${employee.name} has no read access to any record that matches this question, so no answer was assembled. ${result.excluded.length} matching source${result.excluded.length === 1 ? " was" : "s were"} excluded by the Decision Service.`;
    return result;
  }

  const lead = result.sources
    .slice(0, 3)
    .map((source) => source.summary)
    .join(" ");
  const disclosure = result.excluded.length
    ? ` This answer is limited by your access: ${result.excluded.length} matching source${result.excluded.length === 1 ? "" : "s"} in ${[...new Set(result.excluded.map((item) => item.connectionName))].join(", ")} ${result.excluded.length === 1 ? "was" : "were"} excluded.`
    : "";
  const maskNote = maskedTotal.length || hiddenTotal.length
    ? ` Some fields were masked or withheld under your role's field obligations.`
    : "";

  result.answer = `${lead}${disclosure}${maskNote}`;
  return result;
}

export function suggestedPrompts(state, employeeId) {
  const employee = state.employees.find((item) => item.id === employeeId);
  const byDepartment = {
    Finance: ["What is our invoice and collections position this quarter?", "Show me vendor payment aging", "What did the statutory audit find?"],
    Support: ["What are our top support tickets?", "What is the refund escalation process?", "How many tickets are breaching SLA?"],
    Engineering: ["How is pull request review velocity looking?", "What are the latest architecture decisions?", "Where is the on-call runbook?"],
    "Human Resources": ["What is our headcount by department?", "Show me compensation bands by grade", "What does attendance look like this quarter?"],
    Contractors: ["Where are the platform architecture decisions?", "Show me the on-call runbook", "What is the refund escalation playbook?"]
  };
  return byDepartment[employee?.department] || ["What is our headcount by department?", "What are our top support tickets?", "What is the leave policy?"];
}
