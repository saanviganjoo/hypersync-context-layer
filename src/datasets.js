/**
 * Per-tool record sets — the dummy "database" behind each connected tool.
 *
 * Every record carries the resourceId it lives under, so the Decision Service can
 * decide access per resource and the answer engine can aggregate only the rows a
 * given identity is allowed to read. Two people asking the same question therefore
 * get different — and individually correct — numbers.
 *
 * Sensitive field labels must match fieldRestrictionCatalogue in catalogue.js, since
 * that is what field obligations (Visible / Masked / Hidden) are keyed on.
 */

const inr = (value) => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString("en-IN")}`;
};

const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
const count = (rows, predicate) => rows.filter(predicate).length;

/* ------------------------------------------------------------------ Accounting */

const invoices = [
  ["INV-2601", "invoices_india", "Meridian Retail", 1840000, "Paid", "2026-05-12"],
  ["INV-2602", "invoices_india", "Northwind Logistics", 2650000, "Overdue", "2026-06-02"],
  ["INV-2603", "invoices_india", "Kesar Foods", 940000, "Paid", "2026-05-28"],
  ["INV-2604", "invoices_india", "Blue Harbour Bank", 5120000, "Sent", "2026-08-20"],
  ["INV-2605", "invoices_india", "Trisha Textiles", 1310000, "Overdue", "2026-06-18"],
  ["INV-2606", "invoices_india", "Anand Motors", 780000, "Paid", "2026-07-04"],
  ["INV-2607", "invoices_india", "Sunrise Pharma", 3420000, "Sent", "2026-08-30"],
  ["INV-2608", "invoices_india", "Kavya Interiors", 465000, "Overdue", "2026-06-25"],
  ["INV-2651", "invoices_us", "Redwood Analytics", 7300000, "Sent", "2026-08-25"],
  ["INV-2652", "invoices_us", "Cascade Health", 4150000, "Paid", "2026-06-30"],
  ["INV-2653", "invoices_us", "Ironbridge Capital", 9600000, "Overdue", "2026-05-31"],
  ["INV-2654", "invoices_us", "Lakeview Media", 2280000, "Sent", "2026-09-10"]
].map(([id, resourceId, customer, amount, status, due]) => ({
  id,
  resourceId,
  title: `${id} · ${customer}`,
  amount,
  status,
  cells: [
    { label: "Invoice", value: id },
    { label: "Customer", value: customer },
    { label: "Amount", value: inr(amount) },
    { label: "Status", value: status },
    { label: "Due", value: due }
  ],
  sensitive: [
    { label: "Bank account number", value: "SAMPLEBANK 0000 0000 0000" },
    { label: "Tax identifier", value: "00SAMPLE0000X1ZS" }
  ]
}));

const payments = [
  ["PAY-901", "payments_india", "Cloudspine Infra", 1240000, "Scheduled", 12],
  ["PAY-902", "payments_india", "Vertex Staffing", 860000, "Aged", 74],
  ["PAY-903", "payments_india", "Orbit Travel", 315000, "Paid", 3],
  ["PAY-904", "payments_india", "Lumen Legal", 1980000, "Aged", 91],
  ["PAY-905", "payments_india", "Fern Facilities", 540000, "Scheduled", 21],
  ["PAY-906", "payments_india", "Astra Marketing", 1130000, "Paid", 8]
].map(([id, resourceId, vendor, amount, status, ageDays]) => ({
  id,
  resourceId,
  title: `${id} · ${vendor}`,
  amount,
  ageDays,
  status,
  cells: [
    { label: "Payment", value: id },
    { label: "Vendor", value: vendor },
    { label: "Amount", value: inr(amount) },
    { label: "Status", value: status },
    { label: "Age", value: `${ageDays}d` }
  ],
  sensitive: [{ label: "Payment details", value: "NEFT · A/C 0000 0000 0000 · IFSC SMPL0000000" }]
}));

/* -------------------------------------------------------------------- Ticketing */

const tickets = [
  ["SUP-4412", "tickets_support", "Refund not received after 7 days", "High", "Open", 9, true],
  ["SUP-4415", "tickets_support", "KYC document rejected twice", "High", "Open", 6, true],
  ["SUP-4418", "tickets_support", "App crashes on statement download", "Medium", "Open", 4, false],
  ["SUP-4421", "tickets_support", "Duplicate charge on UPI mandate", "Critical", "Open", 11, true],
  ["SUP-4424", "tickets_support", "Unable to update registered mobile", "Low", "Open", 2, false],
  ["SUP-4427", "tickets_support", "Refund delayed past SLA", "High", "Breaching", 14, true],
  ["SUP-4430", "tickets_support", "Cashback not credited", "Medium", "Open", 5, false],
  ["SUP-4433", "tickets_support", "Account locked after password reset", "High", "Breaching", 13, true],
  ["SUP-4436", "tickets_support", "Statement shows wrong closing balance", "Medium", "Open", 3, false],
  ["FIN-1120", "tickets_finance", "Q1 reconciliation break — settlement file", "High", "Open", 26, false],
  ["FIN-1123", "tickets_finance", "Vendor invoice mismatch, Lumen Legal", "Medium", "Open", 18, false],
  ["FIN-1126", "tickets_finance", "GST credit note not applied", "High", "Breaching", 22, false],
  ["FIN-1129", "tickets_finance", "Bank charges posted to wrong ledger", "Low", "Open", 7, false],
  ["FIN-1132", "tickets_finance", "Payout file rejected by bank", "Critical", "Open", 15, false]
].map(([id, resourceId, title, priority, status, ageDays, hasCustomer]) => ({
  id,
  resourceId,
  title: `${id} · ${title}`,
  priority,
  status,
  ageDays,
  cells: [
    { label: "Ticket", value: id },
    { label: "Summary", value: title },
    { label: "Priority", value: priority },
    { label: "Status", value: status },
    { label: "Age", value: `${ageDays}d` }
  ],
  sensitive: [
    ...(hasCustomer ? [{ label: "Customer personal information", value: "sample.customer@example.com · +91 90000 00000" }] : []),
    { label: "Internal comments", value: "Goodwill credit of ₹15,000 offered — do not disclose to customer" },
    { label: "Attachment URLs", value: "https://files.jira.internal/att/0000-sample.pdf" }
  ]
}));

/* ------------------------------------------------------------------------ HRMS */

const headcount = [
  ["Engineering", 48, 6, 2],
  ["Support", 31, 4, 3],
  ["Finance", 18, 2, 1],
  ["Sales", 22, 3, 2],
  ["Human Resources", 9, 1, 0],
  ["Contractors", 14, 1, 4]
].map(([department, active, joinedQ1, exitedQ1], index) => ({
  id: `hc_${index}`,
  resourceId: "emp_all",
  title: department,
  active,
  joinedQ1,
  exitedQ1,
  cells: [
    { label: "Department", value: department },
    { label: "Active", value: String(active) },
    { label: "Joined Q1", value: String(joinedQ1) },
    { label: "Exited Q1", value: String(exitedQ1) }
  ],
  sensitive: [
    { label: "Personal address", value: "14 Sample Road, Bengaluru 560001" },
    { label: "Identity numbers", value: "PAN SAMPLE0000X · National ID 0000 1111 2222" }
  ]
}));

const compensation = [
  ["L1", 8, 850000],
  ["L2", 34, 1450000],
  ["L3", 41, 2210000],
  ["M2", 22, 3180000],
  ["M3", 14, 4200000],
  ["M5", 5, 6850000]
].map(([grade, people, medianCtc], index) => ({
  id: `comp_${index}`,
  resourceId: "emp_all",
  title: `Grade ${grade}`,
  people,
  medianCtc,
  cells: [
    { label: "Grade", value: grade },
    { label: "People", value: String(people) },
    { label: "Median CTC", value: inr(medianCtc) }
  ],
  sensitive: [
    { label: "Salary", value: `Individual salary lines for ${people} employees` },
    { label: "Bank details", value: "Salary account and IFSC per employee" }
  ]
}));

const attendance = [
  ["Engineering", 21.8, 5.2, 3],
  ["Support", 20.4, 7.9, 6],
  ["Finance", 22.1, 4.4, 1],
  ["Sales", 20.9, 6.8, 2]
].map(([department, avgDays, leavePct, unapproved], index) => ({
  id: `att_${index}`,
  resourceId: "attendance_all",
  title: department,
  avgDays,
  leavePct,
  unapproved,
  cells: [
    { label: "Department", value: department },
    { label: "Avg days present", value: String(avgDays) },
    { label: "On leave", value: `${leavePct}%` },
    { label: "Unapproved", value: String(unapproved) }
  ],
  sensitive: []
}));

/* --------------------------------------------------------------------- Storage */

const files = [
  ["file_audit_report", "FY26 statutory audit findings", "4.1 MB", "2026-07-30", "7 observations, 2 rated high severity — both on approval evidence for high-value payments.", true],
  ["file_invoice_pack", "FY26 invoice pack", "12.6 MB", "2026-08-01", "Consolidated invoice register exported for the Q1 close.", true],
  ["file_policy_handbook", "Employee handbook FY26", "4.2 MB", "2026-07-12", "24 days annual leave, 30-day expense filing window, up to 10 remote days per quarter.", false],
  ["file_eng_runbook", "Platform on-call runbook", "1.8 MB", "2026-07-28", "On-call rotation, escalation ladder and recovery procedures for platform services.", false]
].map(([resourceId, title, size, updated, body, external]) => ({
  id: resourceId,
  resourceId,
  title,
  cells: [
    { label: "File", value: title },
    { label: "Size", value: size },
    { label: "Updated", value: updated }
  ],
  sensitive: [
    { label: "File content", value: body },
    { label: "File download", value: `${title.toLowerCase().replace(/\s+/g, "-")}.pdf` },
    ...(external ? [{ label: "External sharing", value: "Shared with external-auditor@example.com" }] : [])
  ]
}));

/* -------------------------------------------------------------- Knowledge Base */

const pages = [
  ["page_qbr", "Quarterly finance review", "Aditi Rao", "Q1 closed 4% ahead of plan on revenue; collections lag is the single flagged risk going into Q2."],
  ["page_onboarding", "Employee onboarding guide", "Priya Nair", "Day-one checklist covering IT setup, statutory paperwork and the first-week buddy programme."],
  ["page_support_playbook", "Refund escalation playbook", "Vikram Sethi", "Refunds above ₹25,000 escalate to the Support Lead; anything above ₹1 L needs finance sign-off."],
  ["page_eng_architecture", "Platform architecture decisions", "Ishaan Mehta", "31 accepted decisions; the most recent moves connector sync to an event-driven queue."]
].map(([resourceId, title, owner, body]) => ({
  id: resourceId,
  resourceId,
  title,
  // A page you are permitted to view is meant to be read, so the body is a normal
  // cell. Gating it as a sensitive field would let it leak through the summary while
  // the field itself showed as withheld.
  cells: [
    { label: "Page", value: title },
    { label: "Owner", value: owner },
    { label: "Summary", value: body }
  ],
  sensitive: [],
  body
}));

/* -------------------------------------------------------------- Developer Tools */

const pullRequests = [
  ["PR-812", "gh_prs", "Event-driven connector sync", "backend-services", 9, "Open"],
  ["PR-815", "gh_prs", "Permission pre-filter on search", "backend-services", 4, "Open"],
  ["PR-818", "gh_prs", "Mask obligations in answer builder", "backend-services", 31, "Stale"],
  ["PR-821", "gh_prs", "Context layer chat shell", "frontend-app", 6, "Open"],
  ["PR-824", "gh_prs", "Ceiling snapshot diffing", "backend-services", 48, "Stale"],
  ["PR-827", "gh_prs", "Role mining cohort clustering", "internal-tools", 12, "Open"],
  ["PR-830", "gh_prs", "Drift reconciliation queue", "backend-services", 3, "Open"],
  ["PR-833", "gh_prs", "Agent kill switch endpoint", "internal-tools", 19, "Open"]
].map(([id, resourceId, title, repo, hoursToReview, status]) => ({
  id,
  resourceId,
  title: `${id} · ${title}`,
  hoursToReview,
  status,
  cells: [
    { label: "Pull request", value: id },
    { label: "Title", value: title },
    { label: "Repository", value: repo },
    { label: "First review", value: `${hoursToReview}h` },
    { label: "Status", value: status }
  ],
  sensitive: [{ label: "Security findings", value: "2 dependency advisories flagged on this branch" }]
}));

/* ------------------------------------------------------------------- Registry */

export const datasets = [
  {
    id: "ds_invoices",
    name: "Invoices",
    connectionId: "conn_zoho",
    resourceType: "Invoices",
    action: "View invoices",
    keywords: ["invoice", "invoices", "billing", "revenue", "receivable", "collections", "outstanding", "unpaid", "overdue", "finance", "q1", "customer"],
    records: invoices,
    metrics: (rows) => [
      { label: "Invoices", value: String(rows.length) },
      { label: "Invoiced value", value: inr(sum(rows, "amount")) },
      { label: "Overdue value", value: inr(sum(rows.filter((row) => row.status === "Overdue"), "amount")) }
    ],
    summarise: (rows) => {
      const overdue = rows.filter((row) => row.status === "Overdue");
      return `${rows.length} invoices worth ${inr(sum(rows, "amount"))}, of which ${inr(sum(overdue, "amount"))} across ${overdue.length} invoice${overdue.length === 1 ? "" : "s"} is overdue.`;
    }
  },
  {
    id: "ds_payments",
    name: "Vendor payments",
    connectionId: "conn_zoho",
    resourceType: "Payments",
    action: "View payments",
    keywords: ["payment", "payments", "vendor", "aging", "payable", "overdue", "cash", "spend", "finance"],
    records: payments,
    metrics: (rows) => [
      { label: "Payments", value: String(rows.length) },
      { label: "Total payable", value: inr(sum(rows.filter((row) => row.status !== "Paid"), "amount")) },
      { label: "Aged > 60d", value: inr(sum(rows.filter((row) => row.ageDays > 60), "amount")) }
    ],
    summarise: (rows) => {
      const open = rows.filter((row) => row.status !== "Paid");
      const aged = rows.filter((row) => row.ageDays > 60);
      return `${inr(sum(open, "amount"))} is payable across ${open.length} vendor payments, with ${inr(sum(aged, "amount"))} aged beyond 60 days.`;
    }
  },
  {
    id: "ds_tickets",
    name: "Tickets",
    connectionId: "conn_jira",
    resourceType: "Tickets",
    action: "View ticket",
    keywords: ["ticket", "tickets", "support", "backlog", "customer", "sla", "escalation", "issue", "queue", "top", "open", "breaching", "reconciliation"],
    records: tickets,
    metrics: (rows) => [
      { label: "Open tickets", value: String(rows.length) },
      { label: "Breaching SLA", value: String(count(rows, (row) => row.status === "Breaching")) },
      { label: "Critical", value: String(count(rows, (row) => row.priority === "Critical")) }
    ],
    summarise: (rows) => {
      const breaching = count(rows, (row) => row.status === "Breaching");
      const critical = count(rows, (row) => row.priority === "Critical");
      const oldest = rows.reduce((max, row) => Math.max(max, row.ageDays), 0);
      return `${rows.length} open tickets, ${breaching} breaching SLA and ${critical} at critical priority. The oldest has been open ${oldest} days.`;
    }
  },
  {
    id: "ds_headcount",
    name: "Headcount",
    connectionId: "conn_darwinbox",
    resourceType: "Employees",
    action: "Search employees",
    keywords: ["headcount", "employee", "employees", "people", "department", "team", "size", "hiring", "attrition", "joined", "exited", "hr"],
    records: headcount,
    metrics: (rows) => [
      { label: "Active employees", value: String(sum(rows, "active")) },
      { label: "Joined in Q1", value: String(sum(rows, "joinedQ1")) },
      { label: "Exited in Q1", value: String(sum(rows, "exitedQ1")) }
    ],
    summarise: (rows) => {
      const largest = [...rows].sort((a, b) => b.active - a.active)[0];
      return `${sum(rows, "active")} active employees across ${rows.length} departments. ${largest.title} is the largest at ${largest.active}, and ${sum(rows, "joinedQ1")} people joined in Q1 against ${sum(rows, "exitedQ1")} exits.`;
    }
  },
  {
    id: "ds_compensation",
    name: "Compensation bands",
    connectionId: "conn_darwinbox",
    resourceType: "Employees",
    action: "View compensation",
    keywords: ["salary", "compensation", "pay", "band", "bands", "ctc", "payroll", "grade", "increment", "hr"],
    records: compensation,
    metrics: (rows) => [
      { label: "Grades", value: String(rows.length) },
      { label: "People covered", value: String(sum(rows, "people")) },
      { label: "Highest median", value: inr(Math.max(...rows.map((row) => row.medianCtc))) }
    ],
    summarise: (rows) => {
      const top = [...rows].sort((a, b) => b.medianCtc - a.medianCtc)[0];
      const bottom = [...rows].sort((a, b) => a.medianCtc - b.medianCtc)[0];
      return `Median CTC runs from ${inr(bottom.medianCtc)} at ${bottom.title} to ${inr(top.medianCtc)} at ${top.title}, covering ${sum(rows, "people")} employees across ${rows.length} grades.`;
    }
  },
  {
    id: "ds_attendance",
    name: "Attendance",
    connectionId: "conn_darwinbox",
    resourceType: "Attendance",
    action: "Aggregate",
    keywords: ["attendance", "leave", "absence", "present", "utilisation", "utilization", "time", "hr"],
    records: attendance,
    metrics: (rows) => [
      { label: "Avg days present", value: (sum(rows, "avgDays") / (rows.length || 1)).toFixed(1) },
      { label: "Unapproved absences", value: String(sum(rows, "unapproved")) }
    ],
    summarise: (rows) => `Average attendance is ${(sum(rows, "avgDays") / (rows.length || 1)).toFixed(1)} days per month across ${rows.length} departments, with ${sum(rows, "unapproved")} unapproved absences this quarter.`
  },
  {
    id: "ds_files",
    name: "Files",
    connectionId: "conn_drive",
    resourceType: "Files",
    // Listing a file needs metadata access; the body is gated separately as the
    // "File content" field obligation, so a metadata-only role still sees the row.
    action: "View file metadata",
    keywords: ["file", "files", "document", "audit", "statutory", "findings", "handbook", "policy", "leave", "expense", "runbook", "on-call", "oncall", "drive", "report"],
    records: files,
    metrics: (rows) => [{ label: "Files matched", value: String(rows.length) }],
    summarise: (rows) => `${rows.length} matching file${rows.length === 1 ? "" : "s"} in Drive: ${rows.map((row) => row.title).join("; ")}.`
  },
  {
    id: "ds_pages",
    name: "Knowledge base pages",
    connectionId: "conn_confluence",
    resourceType: "Pages",
    action: "View page",
    keywords: ["page", "pages", "wiki", "confluence", "qbr", "quarterly", "review", "onboarding", "joining", "playbook", "refund", "escalation", "architecture", "decision", "process", "guide"],
    records: pages,
    metrics: (rows) => [{ label: "Pages matched", value: String(rows.length) }],
    summarise: (rows) => rows.map((row) => row.body).join(" ")
  },
  {
    id: "ds_pull_requests",
    name: "Pull requests",
    connectionId: "conn_github",
    resourceType: "Pull Requests",
    action: "View pull request",
    keywords: ["pull", "request", "requests", "pr", "prs", "code", "review", "merge", "velocity", "github", "engineering", "stale"],
    records: pullRequests,
    metrics: (rows) => [
      { label: "Open pull requests", value: String(rows.length) },
      { label: "Median first review", value: `${[...rows].sort((a, b) => a.hoursToReview - b.hoursToReview)[Math.floor(rows.length / 2)]?.hoursToReview ?? 0}h` },
      { label: "Stale", value: String(count(rows, (row) => row.status === "Stale")) }
    ],
    summarise: (rows) => {
      const sorted = [...rows].sort((a, b) => a.hoursToReview - b.hoursToReview);
      const median = sorted[Math.floor(rows.length / 2)]?.hoursToReview ?? 0;
      return `${rows.length} open pull requests with a median time to first review of ${median} hours; ${count(rows, (row) => row.status === "Stale")} have gone stale.`;
    }
  }
];

export { inr };
