import {
  agentRiskActions,
  categories,
  conditionLabels,
  fieldRestrictionCatalogue,
  getActionsForResource,
  getAvailableResourceTypes,
  getCategory,
  getModulesForCategory,
  getToolCapability,
  getToolsForCategory,
  sourceEnforcementStatuses
} from "./catalogue.js";
import {
  addAuditEvent,
  createAgentProfile,
  createConnectionFromDraft,
  createRoleFromDraft,
  deleteRole,
  duplicateRole,
  GROUP_RULE_FIELDS,
  groupMembers,
  groupsForEmployee,
  ROLE_ORIGINS,
  store,
  toggleAgentStatus,
  togglePermissionsLayer,
  toggleRoleStatus
} from "./state.js";
import { evaluateAgentAccess, evaluateUserAccess, explainEmployeeAccess, observedAccessFor, observedRowsFor, rolesForEmployee, simulateLifecycleEvent } from "./evaluator.js";
import { answerQuestion, fetchModes, suggestedPrompts } from "./context.js";

const app = document.querySelector("#app");
const toastRoot = document.querySelector("#toast-root");

const stateful = {
  filters: {
    roles: { q: "", origin: "", membership: "", status: "", category: "", tool: "" },
    employees: { q: "", department: "", group: "", status: "" }
  },
  modal: null,
  confirm: null,
  pendingCategory: "",
  connectionWizard: null,
  roleWizard: null,
  agentWizard: null,
  simulator: {
    principalType: "Employee",
    employeeId: "emp_rahul",
    agentId: "agent_support_triage",
    actingUserId: "emp_sana",
    connectionId: "conn_drive",
    resourceId: "folder_india_finance",
    resourceType: "Folders",
    action: "View folder",
    taskScope: "Review folder_india_finance",
    managedDevice: true,
    reason: "Quarterly review",
    result: null
  },
  lifecycle: {
    employeeId: "emp_tanya",
    eventType: "Mover",
    changedField: "department",
    previousValue: "Finance",
    newValue: "Support",
    result: null
  },
  context: {
    employeeId: "emp_rahul",
    draft: "",
    managedDevice: true,
    reason: "",
    thread: [],
    openExplain: null
  },
  activeTabs: {
    permissions: "roles",
    roleDetails: "overview",
    employeeDetails: "profile",
    agentDetails: "overview"
  }
};

const navItems = [
  ["dashboard", "Tools", "plug"],
  ["directory", "Directory", "users"],
  ["permissions", "Roles & Groups", "shield"],
  ["context", "Context Layer", "sparkle"]
];

const pageTitles = {
  dashboard: ["Connected Tools", "Sync a tool and HyperSync reads what every person can already do inside it."],
  directory: ["Directory", "Every synced person. Open anyone to see what they can do across every connected tool."],
  permissions: ["Roles & Groups", "A group decides who. A role decides what they may do. New joiners match a group rule and are provisioned automatically."],
  context: ["Context Layer", "Ask a question across every connected tool. Answers are built only from records the asker is already allowed to read."]
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined }).format(new Date(value));
}

function byId(collection, id) {
  return collection.find((item) => item.id === id);
}

function route() {
  const hash = window.location.hash || "#/dashboard";
  const [pathPart, queryString = ""] = hash.slice(1).split("?");
  const parts = pathPart.split("/").filter(Boolean);
  const params = new URLSearchParams(queryString);
  return { path: pathPart || "/dashboard", parts, params };
}

function go(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  window.location.hash = `${path}${query ? `?${query}` : ""}`;
}

function icon(name) {
  const common = "viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'";
  const paths = {
    "layout-dashboard": "<rect x='3' y='3' width='7' height='8' rx='1.5'/><rect x='14' y='3' width='7' height='5' rx='1.5'/><rect x='14' y='12' width='7' height='9' rx='1.5'/><rect x='3' y='15' width='7' height='6' rx='1.5'/>",
    refresh: "<path d='M20 12a8 8 0 1 1-2.34-5.66'/><path d='M20 4v6h-6'/>",
    plug: "<path d='M12 22v-5'/><path d='M9 8V2M15 8V2'/><path d='M7 8h10v4a5 5 0 0 1-10 0z'/>",
    users: "<path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M22 21v-2a4 4 0 0 0-3-3.87'/><path d='M16 3.13a4 4 0 0 1 0 7.75'/>",
    shield: "<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/><path d='M9 12l2 2 4-5'/>",
    plus: "<path d='M12 5v14M5 12h14'/>",
    upload: "<path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><path d='M17 8l-5-5-5 5'/><path d='M12 3v12'/>",
    key: "<circle cx='7.5' cy='14.5' r='4.5'/><path d='M11 11l9-9M16 6l2 2M14 8l2 2'/>",
    chevron: "<path d='m9 18 6-6-6-6'/>",
    search: "<circle cx='11' cy='11' r='7'/><path d='m20 20-3.5-3.5'/>",
    trash: "<path d='M3 6h18'/><path d='M8 6V4h8v2'/><path d='M19 6l-1 14H6L5 6'/><path d='M10 11v6M14 11v6'/>",
    copy: "<rect x='9' y='9' width='11' height='11' rx='2'/><rect x='4' y='4' width='11' height='11' rx='2'/>",
    edit: "<path d='M12 20h9'/><path d='M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'/>",
    eye: "<path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'/><circle cx='12' cy='12' r='3'/>",
    bolt: "<path d='M13 2 3 14h8l-1 8 11-13h-8z'/>",
    x: "<path d='M18 6 6 18M6 6l12 12'/>",
    check: "<path d='M20 6 9 17l-5-5'/>",
    sparkle: "<path d='M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'/><path d='M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'/>",
    info: "<circle cx='12' cy='12' r='9'/><path d='M12 16v-4M12 8h.01'/>",
    send: "<path d='M22 2 11 13'/><path d='M22 2 15 22l-4-9-9-4z'/>",
    lock: "<rect x='4' y='11' width='16' height='9' rx='2'/><path d='M8 11V7a4 4 0 0 1 8 0v4'/>",
    user: "<circle cx='12' cy='8' r='4'/><path d='M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1'/>"
  };
  return `<svg class="icon" ${common}>${paths[name] || paths.shield}</svg>`;
}

// align "end" keeps the bubble inside the viewport for tips sitting near the right edge.
function tip(text, align = "center") {
  return `<span class="tip ${align === "end" ? "tip-end" : ""}" tabindex="0" role="note" aria-label="${esc(text)}">${icon("info")}<span class="tip-bubble">${esc(text)}</span></span>`;
}

function badge(value, tone = "") {
  const normalized = String(value || "").toLowerCase().replace(/\s+/g, "-");
  return `<span class="badge ${tone || normalized}">${esc(value)}</span>`;
}

function actionButton(label, action, variant = "secondary", extra = "") {
  return `<button class="btn ${variant}" data-action="${esc(action)}" ${extra}>${label}</button>`;
}

function showToast(message, tone = "success") {
  const item = document.createElement("div");
  item.className = `toast ${tone}`;
  item.textContent = message;
  toastRoot.appendChild(item);
  window.setTimeout(() => item.remove(), 3200);
}

function openConfirm(title, body, confirmAction, payload = {}) {
  stateful.confirm = { title, body, confirmAction, payload };
  render();
}

function closeModal() {
  stateful.modal = null;
  stateful.confirm = null;
  render();
}

function currentPageKey(parts) {
  if (parts[0] === "permissions") return "permissions";
  // Retired routes (connections, audit-logs, settings) fall through to the dashboard.
  return pageTitles[parts[0]] ? parts[0] : "dashboard";
}

function render() {
  const data = store.getState();
  const current = route();
  const pageKey = currentPageKey(current.parts);
  const title = pageTitles[pageKey] || pageTitles.dashboard;
  app.innerHTML = `
    <div class="portal">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">H</div>
          <div>
            <strong>HyperSync</strong>
            <span>Admin Portal</span>
          </div>
        </div>
        <nav class="nav" aria-label="Main navigation">
          ${navItems.map(([key, label, iconName]) => `
            <button class="nav-item ${pageKey === key ? "active" : ""}" data-route="/${key}">
              ${icon(iconName)}
              <span>${label}</span>
            </button>
          `).join("")}
        </nav>
        <button class="reset-link" data-action="reset-demo">Reset Demo Data</button>
      </aside>
      <main class="main">
        <header class="topbar">
          <div>
            <div class="breadcrumb">HyperSync / ${esc(title[0])}</div>
            <h1>${esc(title[0])}</h1>
            <p>${esc(title[1])}</p>
          </div>
          <div class="profile">
            <span>${esc(data.corporate.name)}</span>
            <div class="avatar">${esc(data.currentUser.name[0])}</div>
          </div>
        </header>
        <section class="content">${renderPage(data, current)}</section>
      </main>
    </div>
    ${renderModal(data)}
  `;
}

function renderPage(data, current) {
  const [section, subSection, idValue] = current.parts;
  if (section === "permissions" && subSection === "roles" && idValue) return renderRoleDetails(data, idValue, current.params.get("tab") || stateful.activeTabs.roleDetails);
  if (section === "permissions" && subSection === "agents" && idValue) return renderAgentDetails(data, idValue, current.params.get("tab") || stateful.activeTabs.agentDetails);
  if (section === "directory" && subSection) return renderEmployeeDetails(data, subSection, current.params.get("tab") || stateful.activeTabs.employeeDetails);
  if (section === "directory") return renderDirectory(data);
  if (section === "context") return renderContextLayer(data);
  if (section === "permissions") return renderPermissions(data, current.params.get("tab") || stateful.activeTabs.permissions);
  return renderDashboard(data);
}

function renderDashboard(data) {
  const activeConnections = data.connections.filter((connection) => connection.status === "Active").length;
  const activeRoles = data.roles.filter((role) => role.status === "Active").length;
  return `
    ${renderLayerEnabler(data)}
    <div class="summary-grid">
      ${summaryCard("Active Connections", activeConnections, "Across HRMS, Ticketing, Storage, Accounting, Knowledge Base and Developer Tools")}
      ${summaryCard("Employees Covered", data.employees.filter((employee) => employee.accessStatus === "Active").length, "Active identities evaluated by HyperContext")}
      ${summaryCard("Permission Roles", activeRoles, "Roles with scoped resource policies")}
      ${summaryCard("Recorded Events", data.auditEvents.length, "Every decision, grant and change is attributable")}
    </div>
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Connected Tools ${tip("A corporate can hold many connections across categories. Every new connection starts at No Access until a role grants something on it.")}</h2>
          <p>Each connection feeds the Decision Service its permission ceiling and its resources.</p>
        </div>
        ${actionButton(`${icon("plus")} Add New Connection`, "open-connection-wizard", "primary")}
      </div>
      ${connectionTable(data.connections)}
    </div>
    ${renderRecentActivity(data)}
  `;
}

function renderRecentActivity(data) {
  const events = data.auditEvents.slice(0, 8);
  return `
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Recent Activity ${tip("An immutable record of every permission change, lifecycle event, context query and agent action. Per-role, per-employee and per-agent history lives on each of their detail pages.")}</h2>
          <p>The newest ${events.length} of ${data.auditEvents.length} recorded events.</p>
        </div>
      </div>
      ${events.length ? `
        <div class="activity-list">
          ${events.map((event) => `
            <div class="activity-row">
              <span class="activity-dot ${activityTone(event.eventType)}"></span>
              <div class="activity-body">
                <strong>${esc(event.eventType)}</strong>
                <small>${esc(event.summary || event.after)}</small>
              </div>
              <div class="activity-meta">
                <span>${esc(event.principal || event.principalType)}</span>
                <small>${formatDate(event.timestamp)}</small>
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<div class="empty-state small">No activity recorded yet.</div>`}
    </div>
  `;
}

function activityTone(eventType) {
  if (/Denied|Disabled|Revoked|Failed/i.test(eventType)) return "deny";
  if (/Pending|Started|Evaluated|Recalculated/i.test(eventType)) return "warn";
  return "allow";
}

function renderLayerEnabler(data) {
  const enabled = data.app.permissionsLayerEnabled !== false;
  const configuredRoles = data.roles.filter((role) => role.status === "Active" && role.permissions.length);
  const coveredEmployees = data.employees.filter((employee) => rolesForEmployee(data, employee.id).length);
  const governedAgents = data.agents.filter((agent) => agent.status === "Active");
  const checklist = [
    ["Tools connected", data.connections.length, `${data.connections.length} connections across ${new Set(data.connections.map((item) => item.category)).size} categories`, data.connections.length > 0],
    ["Roles scoped", configuredRoles.length, "Roles carrying at least one resource grant", configuredRoles.length > 0],
    ["People mapped", coveredEmployees.length, `${coveredEmployees.length} of ${data.employees.length} identities resolved to a role`, coveredEmployees.length > 0],
    ["Agents governed", governedAgents.length, "Agents with their own identity, allow-list and human owner", governedAgents.length > 0]
  ];
  const ready = checklist.every(([, , , ok]) => ok);
  return `
    <div class="enabler-card ${enabled ? "on" : "off"}">
      <div class="enabler-main">
        <div class="enabler-status">
          <span class="enabler-pill ${enabled ? "on" : "off"}">${enabled ? icon("shield") : icon("lock")} ${enabled ? "Enforcing" : "Off"}</span>
          <div>
            <h2>Permissions Layer ${tip("One Decision Service answers a single question — “is this identity allowed to do this, on this resource, right now?” — for the Context Layer, provisioning and every AI agent. Turning it off makes all three default-deny.")}</h2>
            <p>${enabled
              ? "Every request from the Context Layer, provisioning and agents is evaluated against source ceiling, role grants, explicit denies and runtime conditions."
              : "The Decision Service is default-closed. Roles and grants are preserved, but nothing will be released until you switch it back on."}</p>
          </div>
        </div>
        <div class="enabler-actions">
          <button class="btn ${enabled ? "secondary" : "primary"}" data-action="confirm-toggle-permissions-layer">${enabled ? "Turn off" : "Enable permissions layer"}</button>
          <button class="btn primary" data-route="/context">${icon("sparkle")} Open Context Layer</button>
        </div>
      </div>
      <div class="enabler-checklist">
        ${checklist.map(([label, count, helper, ok]) => `
          <div class="checklist-item ${ok ? "done" : "todo"}">
            <span class="checklist-mark">${ok ? icon("check") : icon("plus")}</span>
            <div>
              <strong>${esc(label)} <em>${esc(count)}</em></strong>
              <small>${esc(helper)}</small>
            </div>
          </div>
        `).join("")}
      </div>
      ${ready ? "" : `<div class="enabler-hint">${icon("info")} Finish the unchecked steps above to give the Decision Service full coverage.</div>`}
    </div>
  `;
}

function summaryCard(label, value, helper) {
  return `
    <div class="summary-card">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
      <small>${esc(helper)}</small>
    </div>
  `;
}

function renderContextLayer(data) {
  const context = stateful.context;
  const employee = byId(data.employees, context.employeeId) || data.employees[0];
  const roles = rolesForEmployee(data, employee.id).filter((role) => role.status === "Active");
  const reachable = [...new Set(roles.flatMap((role) => role.permissions.map((permission) => permission.connectionId)))];
  const layerEnabled = data.app.permissionsLayerEnabled !== false;
  return `
    ${layerEnabled ? "" : `
      <div class="deny-note">
        ${icon("lock")} <strong>Permissions layer is off.</strong> The Decision Service is default-closed, so every question returns no data. Turn it back on from the Dashboard.
      </div>
    `}
    <div class="context-layout">
      <div class="card context-chat">
        <div class="context-identity">
          <div class="context-identity-main">
            ${icon("user")}
            <label class="select-label inline">
              <span>Asking as ${tip("The Context Layer never answers as an admin. Pick the person asking, and the answer is rebuilt from only what they can already read.")}</span>
              <select data-bind="context.employeeId">
                ${data.employees.filter((item) => item.employmentStatus === "Active").map((item) => `<option value="${item.id}" ${item.id === employee.id ? "selected" : ""}>${esc(item.name)} — ${esc(item.designation)}</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="context-identity-meta">
            <span>${esc(roles.map((role) => role.name).join(", ") || "No active role")}</span>
            <span>${reachable.length} of ${data.connections.length} tools reachable</span>
          </div>
        </div>
        <div class="chat-thread" id="chat-thread">
          ${context.thread.length ? context.thread.map((entry, index) => renderChatEntry(entry, index)).join("") : renderChatEmptyState(employee)}
        </div>
        <div class="composer">
          <div class="prompt-chips">
            ${suggestedPrompts(data, employee.id).map((prompt) => `<button class="prompt-chip" data-action="context-example" data-prompt="${esc(prompt)}">${esc(prompt)}</button>`).join("")}
          </div>
          <div class="composer-row">
            <textarea data-bind="context.draft" rows="2" placeholder="Ask anything across ${esc(data.connections.length)} connected tools…">${esc(context.draft)}</textarea>
            <button class="btn primary composer-send" data-action="context-ask">${icon("send")} Ask</button>
          </div>
          <div class="composer-context">
            <label class="check-line"><input type="checkbox" data-bind="context.managedDevice" ${context.managedDevice ? "checked" : ""} /> Managed device ${tip("Some roles only release data on a company-managed device. Uncheck this to see the condition check fail.")}</label>
            <label class="field inline-field"><span>Reason ${tip("Roles marked “reason required” — such as HR Administrator — will not return data until a business reason is recorded with the request.")}</span><input type="text" data-bind="context.reason" value="${esc(context.reason)}" placeholder="e.g. quarterly review" /></label>
            ${context.thread.length ? `<button class="link-btn" data-action="context-clear">Clear conversation</button>` : ""}
          </div>
        </div>
      </div>
      ${renderContextSidebar(data, employee, roles, reachable)}
    </div>
  `;
}

function renderChatEmptyState(employee) {
  return `
    <div class="chat-welcome">
      <div class="chat-welcome-mark">${icon("sparkle")}</div>
      <h3>Ask across every connected tool</h3>
      <p>Questions are answered as <strong>${esc(employee.name)}</strong>. Every record is checked against the same Decision Service the Access Simulator uses, so nothing outside their access can reach the answer.</p>
    </div>
  `;
}

function renderChatEntry(entry, index) {
  const result = entry.result;
  const open = stateful.context.openExplain === index;
  return `
    <div class="chat-turn">
      <div class="chat-bubble user"><span>${esc(entry.question)}</span></div>
      <div class="chat-bubble assistant">
        <div class="assistant-head">
          <span class="assistant-mark">${icon("sparkle")}</span>
          <strong>Context Layer</strong>
          <span class="assistant-scope">${esc(result.askedBy)} · ${result.sources.length} source${result.sources.length === 1 ? "" : "s"} used</span>
        </div>
        <p class="assistant-answer">${esc(result.answer)}</p>
        ${result.excluded.length ? `
          <div class="access-note">
            ${icon("lock")}
            <span><strong>Limited by your access.</strong> ${result.excluded.length} matching source${result.excluded.length === 1 ? "" : "s"} ${result.excluded.length === 1 ? "was" : "were"} excluded, and ${result.excluded.length === 1 ? "its" : "their"} contents were never read. ${tip("Per the permission model, a partial answer is always disclosed rather than silently truncated — a silently trimmed aggregate produces confidently wrong numbers.")}</span>
          </div>
        ` : ""}
        ${result.sources.length ? `<div class="source-grid">${result.sources.map((source) => renderSourceCard(source)).join("")}</div>` : ""}
        ${result.obligations.length ? renderObligations(result.obligations) : ""}
        <button class="link-btn explain-toggle" data-action="context-explain" data-index="${index}">${open ? "Hide" : "Explain"} this answer</button>
        ${open ? renderAnswerExplanation(result) : ""}
      </div>
    </div>
  `;
}

function renderSourceCard(source) {
  const maxRows = 6;
  const shown = source.rows.slice(0, maxRows);
  return `
    <div class="source-card wide-source">
      <div class="source-card-head">
        <div>
          <strong>${esc(source.title)}</strong>
          <span class="source-origin">${esc(source.tool)} · ${esc(source.connectionName)} · ${esc(source.action)}</span>
        </div>
        <span class="badge allow">${esc(source.recordCount)} of ${esc(source.totalRecordCount)} records</span>
      </div>
      ${source.metrics.length ? `
        <div class="source-metrics">
          ${source.metrics.map((metric) => `<div><span>${esc(metric.label)}</span><strong>${esc(metric.value)}</strong></div>`).join("")}
        </div>
      ` : ""}
      <div class="source-scope">
        <span>In scope: ${esc(source.permittedResources.join(", "))}</span>
        ${source.withheldRecordCount ? `<span class="withheld-note">${icon("lock")} ${esc(source.withheldRecordCount)} record${source.withheldRecordCount === 1 ? "" : "s"} withheld ${tip(`These rows sit in ${source.excludedResources.map((item) => item.resourceName).join(", ") || "resources outside your scope"} and were never read. Aggregates above are computed from your permitted rows only.`, "end")}</span>` : ""}
      </div>
      ${shown.length ? `
        <div class="table-wrap tight">
          <table class="record-table">
            <thead><tr>${source.columns.map((column) => `<th>${esc(column)}</th>`).join("")}</tr></thead>
            <tbody>
              ${shown.map((row) => `<tr>${row.cells.map((cell) => `<td class="${cell.masked ? "masked" : ""}">${esc(cell.value)}</td>`).join("")}</tr>`).join("")}
            </tbody>
          </table>
        </div>
        ${source.rows.length > maxRows ? `<span class="source-more">+ ${esc(source.rows.length - maxRows)} more permitted row${source.rows.length - maxRows === 1 ? "" : "s"}</span>` : ""}
      ` : ""}
      ${source.hiddenFields.length ? `<span class="source-withheld">${icon("lock")} Fields withheld: ${esc(source.hiddenFields.join(", "))}</span>` : ""}
      <span class="source-fetch">${esc(source.fetchMode)} ${tip(source.fetchNote)}</span>
    </div>
  `;
}

function renderAnswerExplanation(result) {
  return `
    <div class="answer-explanation">
      <h4>How this answer was assembled</h4>
      <p class="muted">Searched ${esc(result.toolsSearched.join(", ") || "no tools")}. Each candidate record ran the full four-step check before it was allowed into the answer.</p>
      ${result.sources.map((source) => `
        <details class="explain-source" open>
          <summary><span class="badge allow">Allowed</span> ${esc(source.title)} <span class="muted">via ${esc(source.appliedRoles.join(", ") || "role policy")}</span></summary>
          ${renderPipeline(source.decision.pipelineSteps)}
        </details>
      `).join("")}
      ${result.excluded.map((item) => `
        <details class="explain-source">
          <summary><span class="badge deny">Excluded</span> ${esc(item.title)} <span class="muted">${esc(item.connectionName)}</span></summary>
          <p class="deny-reason">${esc(item.reason)}</p>
          ${item.decision ? renderPipeline(item.decision.pipelineSteps) : ""}
        </details>
      `).join("")}
    </div>
  `;
}

function renderContextSidebar(data, employee, roles, reachable) {
  const grants = roles.flatMap((role) => role.permissions);
  const restrictions = grants.flatMap((permission) => Object.entries(permission.fieldRestrictions || {}));
  return `
    <div class="context-side">
      <div class="card">
        <h2>What ${esc(employee.name.split(" ")[0])} can reach ${tip("This is the effective read surface the Context Layer is allowed to search. It is derived live from the same roles and grants configured under Permissions.", "end")}</h2>
        <div class="reach-list">
          ${data.connections.map((connection) => {
            const inScope = reachable.includes(connection.id);
            const fetch = fetchModes[connection.category];
            return `
              <div class="reach-row ${inScope ? "" : "out"}">
                <span class="reach-dot ${inScope ? "in" : "out"}"></span>
                <div>
                  <strong>${esc(connection.sourceTool)}</strong>
                  <small>${esc(connection.category)} · ${inScope ? esc(fetch?.mode || "Hybrid") : "No access"}</small>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
      <div class="card">
        <h2>Field obligations ${tip("Obligations travel with the decision. Masked fields are released in redacted form; hidden fields are never loaded into the answer at all.", "end")}</h2>
        ${restrictions.length ? `
          <div class="obligation-list">
            ${restrictions.map(([label, mode]) => `<div><span>${esc(label)}</span><span class="badge ${mode === "Hidden" ? "deny" : mode === "Masked" ? "warning" : "allow"}">${esc(mode)}</span></div>`).join("")}
          </div>
        ` : `<div class="empty-state small">No field obligations apply to this identity.</div>`}
      </div>
      <div class="card">
        <h2>Test the same decision</h2>
        <p class="muted">The Context Layer and the Access Simulator call one Decision Service, so a result here can always be reproduced there.</p>
        <div class="page-actions compact">
          ${actionButton("Open Access Simulator", "open-access-simulator", "secondary")}
          <button class="btn secondary" data-route="/directory/${employee.id}" data-query-tab="effective">View effective access</button>
        </div>
      </div>
    </div>
  `;
}

function connectionHealth(connection) {
  const ageHours = (Date.now() - new Date(connection.updatedAt).getTime()) / 3600000;
  if (ageHours < 24) return { tone: "fresh", label: "Fresh" };
  if (ageHours < 72) return { tone: "stale", label: "Stale" };
  return { tone: "critical", label: "Critical" };
}

function connectionTable(connections) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Connection</th>
            <th>Category</th>
            <th>Source Tool</th>
            <th>Modules</th>
            <th>Permission State ${tip("Unconfigured means no role grants anything on this connection yet. Partially Configured means some resource types are covered and the rest stay at No Access.")}</th>
            <th>Default Access ${tip("Every new connection starts at No Access. Nothing is readable until a role explicitly grants it — the engine can only narrow the source tool's own permissions, never widen them.")}</th>
            <th>Status</th>
            <th>Ceiling Health ${tip("How recently we re-read the source tool's own permissions. A stale ceiling means the snapshot we intersect against may no longer match the tool, so drift is possible.", "end")}</th>
          </tr>
        </thead>
        <tbody>
          ${connections.map((connection) => {
            const health = connectionHealth(connection);
            return `
            <tr>
              <td><strong>${esc(connection.connectionName)}</strong><small>${esc(connection.id)}</small></td>
              <td>${badge(connection.category, "neutral")}</td>
              <td>${esc(connection.sourceTool)}</td>
              <td>${esc(connection.modules.slice(0, 3).join(", "))}${connection.modules.length > 3 ? "..." : ""}</td>
              <td>${badge(connection.permissionState, connection.permissionState === "Unconfigured" ? "draft" : "active")}</td>
              <td>${badge(connection.defaultEffectiveAccess, "deny")}</td>
              <td>${badge(connection.status, "active")}</td>
              <td><span class="health-dot ${health.tone}" title="Source ceiling last synced ${formatDate(connection.updatedAt)}"></span>${health.label}</td>
            </tr>
          `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPermissions(data, activeTab) {
  stateful.activeTabs.permissions = activeTab;
  const activeRoles = data.roles.filter((role) => role.status === "Active");
  const coveredEmployees = data.employees.filter((employee) => rolesForEmployee(data, employee.id).length).length;
  const tabs = ["roles", "groups", "agent-access"];
  return `
    <div class="flow-strip">
      <div class="flow-step"><span>1</span><div><strong>Group</strong><small>Who they are — one rule, matched on sync</small></div></div>
      <div class="flow-arrow">${icon("chevron")}</div>
      <div class="flow-step"><span>2</span><div><strong>Role</strong><small>What they may do in each tool</small></div></div>
      <div class="flow-arrow">${icon("chevron")}</div>
      <div class="flow-step"><span>3</span><div><strong>Effective access</strong><small>Narrowed by what the tool already allows</small></div></div>
    </div>
    <div class="page-actions">
      ${actionButton(`${icon("search")} Test access`, "open-access-simulator", "secondary")}
      ${actionButton(`${icon("plus")} Create group`, "open-group-modal", "secondary")}
      ${actionButton(`${icon("plus")} Create role`, "open-role-wizard", "primary")}
    </div>
    <div class="summary-grid">
      ${summaryCard("Groups", (data.groups || []).length, "Each carries one rule that decides membership")}
      ${summaryCard("Roles", activeRoles.length, "Permission bundles attached to groups")}
      ${summaryCard("People covered", coveredEmployees, "Reached by at least one role, through a group")}
      ${summaryCard("Tools governed", new Set(data.connections.filter((connection) => connection.status === "Active").map((connection) => connection.sourceTool)).size, "Connections feeding the decision engine")}
    </div>
    <div class="tabs">
      ${tabs.map((tab) => `<button class="tab ${activeTab === tab ? "active" : ""}" data-route="/permissions" data-query-tab="${tab}">${tabLabel(tab)}</button>`).join("")}
    </div>
    ${activeTab === "roles" ? renderRolesTab(data) : ""}
    ${activeTab === "groups" ? renderGroupsTab(data) : ""}
    ${activeTab === "agent-access" ? renderAgentAccessTab(data) : ""}
  `;
}

function renderGroupsTab(data) {
  const groups = data.groups || [];
  return `
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Groups ${tip("A group is the only way anyone gets a role. Its rule is matched against each synced employee record, so a new joiner lands in the right groups automatically and is provisioned from there.")}</h2>
          <p>One rule per group. Membership is recalculated on every sync — there is nothing to assign by hand.</p>
        </div>
        ${actionButton(`${icon("plus")} Create group`, "open-group-modal", "secondary")}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Group</th><th>Rule</th><th>Members</th><th>Roles granted</th><th>Actions</th></tr></thead>
          <tbody>
            ${groups.map((group) => {
              const members = groupMembers(data, group);
              const roles = data.roles.filter((role) => (role.groupIds || []).includes(group.id));
              return `
                <tr>
                  <td><strong>${esc(group.name)}</strong><small>${esc(group.description || "")}</small></td>
                  <td><code>${esc(group.rule)}</code></td>
                  <td>${members.length}<small>${esc(members.slice(0, 3).map((employee) => employee.name.split(" ")[0]).join(", "))}${members.length > 3 ? ` +${members.length - 3}` : ""}</small></td>
                  <td>${roles.map((role) => badge(role.name, "neutral")).join(" ") || `<span class="muted">No role yet</span>`}</td>
                  <td><div class="row-actions"><button title="Edit group" data-action="edit-group" data-id="${group.id}">${icon("edit")}</button><button title="Delete group" data-action="delete-group" data-id="${group.id}" ${roles.length ? "disabled aria-label='Detach its roles first'" : ""}>${icon("trash")}</button></div></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
    ${renderLifecycleSimulator(data)}
  `;
}

function tabLabel(tab) {
  return { roles: "Roles", groups: "Groups", "agent-access": "Agent Access" }[tab] || tab;
}

function renderRolesTab(data) {
  const filters = stateful.filters.roles;
  const filtered = data.roles
    .filter((role) => !filters.q || `${role.name} ${role.code}`.toLowerCase().includes(filters.q.toLowerCase()))
    .filter((role) => !filters.origin || role.origin === filters.origin)
    .filter((role) => !filters.membership || (role.membership || []).includes(filters.membership))
    .filter((role) => !filters.status || role.status === filters.status)
    .filter((role) => !filters.category || role.permissions.some((permission) => permission.category === filters.category))
    .filter((role) => !filters.tool || role.permissions.some((permission) => permission.tool === filters.tool))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return `
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Role Management</h2>
          <p>Roles combine corporate, category, tool, connection, resource, action, restrictions and source provisioning status.</p>
        </div>
      </div>
      <div class="filters">
        ${searchInput("roles.q", "Search roles", filters.q)}
        ${selectInput("roles.origin", "Origin", ["", ...ROLE_ORIGINS], filters.origin)}
        ${selectInput("roles.status", "Status", ["", "Active", "Draft", "Disabled"], filters.status)}
        ${selectInput("roles.category", "Category", ["", ...categories.map((category) => category.label)], filters.category)}
        ${selectInput("roles.tool", "Connected tool", ["", ...new Set(data.connections.map((connection) => connection.sourceTool))], filters.tool)}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Role Name</th>
              <th>Origin ${tip("How this role definition came to exist. Tool sync can only ever be an origin — it reads what already exists, so it can propose a role but cannot decide who joins it later.")}</th>
              <th>Membership ${tip("How people end up in this role. IAM carries membership through groups; HRMS supplies the attributes a rule matches on. Neither defines what the role may do.")}</th>
              <th>Assigned Employees</th>
              <th>Connected Tools</th>
              <th>Status</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((role) => `
              <tr class="clickable-row" data-route="/permissions/roles/${role.id}">
                <td><strong>${esc(role.name)}</strong><small>${esc(role.code)}</small></td>
                <td>${badge(role.origin, role.origin === "Suggested from tool sync" ? "allow" : "neutral")}</td>
                <td>${(role.membership || []).map((kind) => badge(kind, "neutral")).join(" ") || badge("Manual list", "neutral")}</td>
                <td>${new Set((data.groups || []).filter((group) => (role.groupIds || []).includes(group.id)).flatMap((group) => groupMembers(data, group)).map((employee) => employee.id)).size}</td>
                <td>${esc([...new Set(role.permissions.map((permission) => permission.tool))].join(", ") || "No tools")}</td>
                <td>${badge(role.status, role.status === "Active" ? "active" : role.status === "Draft" ? "draft" : "disabled")}</td>
                <td>${formatDate(role.updatedAt)}</td>
                <td>
                  <div class="row-actions" data-stop-row>
                    <button title="View role" data-route="/permissions/roles/${role.id}">${icon("eye")}</button>
                    <button title="Edit role" data-action="edit-role" data-id="${role.id}">${icon("edit")}</button>
                    <button title="Duplicate role" data-action="duplicate-role" data-id="${role.id}">${icon("copy")}</button>
                    <button title="${role.status === "Disabled" ? "Enable" : "Disable"} role" data-action="confirm-toggle-role" data-id="${role.id}">${icon("bolt")}</button>
                    <button title="Delete role" data-action="confirm-delete-role" data-id="${role.id}" ${role.origin === "System defined" ? "disabled aria-label='System-defined roles cannot be deleted'" : ""}>${icon("trash")}</button>
                    <button class="link-btn" data-route="/permissions/roles/${role.id}?tab=audit">Audit</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function searchInput(key, placeholder, value) {
  return `<label class="input with-icon">${icon("search")}<input type="search" data-filter="${esc(key)}" placeholder="${esc(placeholder)}" value="${esc(value)}" /></label>`;
}

function selectInput(key, label, options, value) {
  return `
    <label class="select-label">
      <span>${esc(label)}</span>
      <select data-filter="${esc(key)}">
        ${options.map((option) => `<option value="${esc(option)}" ${option === value ? "selected" : ""}>${option ? esc(option) : "All"}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderDirectory(data) {
  const filters = stateful.filters.employees;
  const filtered = data.employees
    .filter((employee) => !filters.q || `${employee.name} ${employee.employeeId} ${employee.workEmail}`.toLowerCase().includes(filters.q.toLowerCase()))
    .filter((employee) => !filters.department || employee.department === filters.department)
    .filter((employee) => !filters.group || groupsForEmployee(data, employee.id).some((group) => group.name === filters.group))
    .filter((employee) => !filters.status || employee.accessStatus === filters.status);
  return `
    <div class="summary-grid">
      ${summaryCard("People synced", data.employees.length, "Pulled from the HRMS connection")}
      ${summaryCard("Tools read", data.connections.filter((connection) => connection.status === "Active").length, "Each contributes what this person can already do")}
      ${summaryCard("Groups", (data.groups || []).length, "Membership recalculated on every sync")}
      ${summaryCard("Ceiling observed", ceilingAge(data), "How fresh the permission snapshot is")}
    </div>
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Directory</h2>
          <p>Open anyone to see every permission they hold, in every connected tool, and why.</p>
        </div>
      </div>
      <div class="filters">
        ${searchInput("employees.q", "Search people", filters.q)}
        ${selectInput("employees.department", "Department", ["", ...new Set(data.employees.map((employee) => employee.department))], filters.department)}
        ${selectInput("employees.group", "Group", ["", ...(data.groups || []).map((group) => group.name)], filters.group)}
        ${selectInput("employees.status", "Access status", ["", "Active", "Revoked"], filters.status)}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Groups</th>
              <th>Roles</th>
              <th>Tools reached</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((employee) => {
              const groups = groupsForEmployee(data, employee.id);
              const roles = rolesForEmployee(data, employee.id);
              const tools = new Set(observedRowsFor(data, employee.id).map((row) => byId(data.connections, row.connectionId)?.sourceTool).filter(Boolean));
              return `
                <tr class="clickable-row" data-route="/directory/${employee.id}">
                  <td><strong>${esc(employee.name)}</strong><small>${esc(employee.employeeId)} · ${esc(employee.workEmail)}</small></td>
                  <td>${esc(employee.department)}</td>
                  <td>${esc(employee.designation)}</td>
                  <td>${groups.map((group) => badge(group.name, "neutral")).join(" ") || `<span class="muted">None</span>`}</td>
                  <td>${roles.map((role) => role.name).join(", ") || `<span class="muted">None</span>`}</td>
                  <td>${tools.size}</td>
                  <td>${badge(employee.accessStatus, employee.accessStatus === "Active" ? "active" : "disabled")}</td>
                  <td><button class="link-btn" data-route="/directory/${employee.id}" data-stop-row>View access</button></td>
                </tr>
              `;
            }).join("") || `<tr><td colspan="8"><div class="empty-state small">No one matches those filters.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderLifecycleSimulator(data) {
  const sim = stateful.lifecycle;
  return `
    <div class="card">
      <div class="section-head">
        <div>
          <h2>HRMS Event Simulator ${tip("Nothing is written to a connected tool until you apply the plan. Every provisioning change is previewed as a diff first, so a bad rule is caught before it reaches production.")}</h2>
          <p>A synced record is matched against every group rule. The groups decide the roles, the roles decide what to provision.</p>
        </div>
      </div>
      <div class="form-grid one">
        ${fieldSelect("lifecycle.employeeId", "Select Employee", data.employees.map((employee) => [employee.id, `${employee.name} (${employee.employeeId})`]), sim.employeeId)}
        ${fieldSelect("lifecycle.eventType", "Event Type", ["Joiner", "Mover", "Leaver"], sim.eventType)}
        ${fieldSelect("lifecycle.changedField", "Changed Field", [["department", "Department"], ["designation", "Designation"], ["grade", "Grade"], ["location", "Location"], ["employmentType", "Employment Type"], ["employmentStatus", "Employment Status"]], sim.changedField)}
        ${fieldInput("lifecycle.previousValue", "Previous Value", sim.previousValue)}
        ${fieldInput("lifecycle.newValue", "New Value", sim.newValue)}
      </div>
      <div class="modal-actions inline">
        ${actionButton("Run Simulation", "run-lifecycle-simulation", "primary")}
        ${actionButton("Apply Simulated Event", "apply-lifecycle-simulation", "secondary", sim.result ? "" : "disabled")}
      </div>
      ${sim.result ? renderSimulationResult(sim.result) : `<div class="empty-state small">Pick a person and an event to preview which groups they match, which roles that gives them, and what changes in each tool.</div>`}
    </div>
  `;
}

function renderSimulationResult(result) {
  const plan = [...result.grantPlan, ...result.revokePlan];
  const chips = (items, tone = "") => items.length ? items.map((item) => `<span class="chip ${tone}">${esc(item)}</span>`).join("") : `<span class="muted">None</span>`;
  return `
    <div class="result-panel">
      <h3>${esc(result.eventType)} · ${esc(result.employeeName)}</h3>
      <div class="sim-flow">
        <div class="sim-flow-step">
          <h4>1 · Groups matched</h4>
          <div class="chip-wrap">${chips(result.groupsAfter)}</div>
          ${result.groupsGained.length ? `<small class="added-note">Joins ${esc(result.groupsGained.join(", "))}</small>` : ""}
          ${result.groupsLost.length ? `<small class="removed-note">Leaves ${esc(result.groupsLost.join(", "))}</small>` : ""}
        </div>
        <div class="sim-flow-arrow">${icon("chevron")}</div>
        <div class="sim-flow-step">
          <h4>2 · Roles inherited</h4>
          <div class="chip-wrap">${chips(result.rolesToAdd)}</div>
          ${result.rolesToRemove.length ? `<small class="removed-note">Removes ${esc(result.rolesToRemove.join(", "))}</small>` : ""}
          ${result.rolesRetained.length ? `<small class="muted">Keeps ${esc(result.rolesRetained.join(", "))}</small>` : ""}
        </div>
        <div class="sim-flow-arrow">${icon("chevron")}</div>
        <div class="sim-flow-step">
          <h4>3 · Provision in each tool</h4>
          <div class="chip-wrap">${plan.length ? `<span class="chip">${plan.length} tool change(s)</span>` : `<span class="muted">Nothing to change</span>`}</div>
        </div>
      </div>
      ${plan.length ? `
        <div class="table-wrap tight">
          <table class="intersect-table">
            <thead><tr><th>Tool</th><th>Change</th><th>Actions</th><th>Via role</th><th>How it lands</th></tr></thead>
            <tbody>
              ${plan.map((item) => `
                <tr class="${item.writable ? "" : "intersect-row ceiling"}">
                  <td><strong>${esc(item.tool)}</strong><small>${esc(item.connectionName)}</small></td>
                  <td>${badge(item.verb, item.verb === "Grant" ? "allow" : "deny")}</td>
                  <td>${item.actionCount}</td>
                  <td>${esc(item.viaRoles.join(", "))}</td>
                  <td class="why">${item.writable ? `Written through the connector automatically.` : esc(item.note)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<div class="empty-state small">This event changes no permissions.</div>`}
      ${result.manualActionsRequired.length ? `<div class="warning">${result.manualActionsRequired.map((note) => esc(note)).join("<br />")}</div>` : ""}
    </div>
  `;
}

function chipList(items, tone = "") {
  if (!items?.length) return `<div class="chip-wrap"><span class="chip">None</span></div>`;
  return `<div class="chip-wrap">${items.map((item) => `<span class="chip ${tone}">${esc(item)}</span>`).join("")}</div>`;
}

function renderAgentAccessTab(data) {
  return `
    <div class="grid-two">
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Agent Access</h2>
            <p>AI agents are separate principals with their own scoped permissions.</p>
          </div>
          ${actionButton(`${icon("plus")} Create Agent Profile`, "open-agent-wizard", "primary")}
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent Name</th>
                <th>Agent Type ${tip("A Delegated Agent can never exceed the person it is acting for — its access is intersected with theirs. An Autonomous Agent runs on its own service identity and never impersonates a human.")}</th>
                <th>Business Owner ${tip("Every agent must have one accountable human. Actions above the risk threshold go to this person for approval, and every attempt is logged against the agent's own identity.")}</th>
                <th>Allowed Tools</th>
                <th>Risk Level ${tip("The highest risk tier this agent is permitted to reach. Anything not on its allow-list is blocked by default, regardless of tier.")}</th>
                <th>Approval Policy ${tip("Which actions pause for a human before they run. Keep this narrow — asking for approval on routine actions trains owners to click approve without reading.")}</th>
                <th>Status</th>
                <th>Last Used</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.agents.map((agent) => `
                <tr class="clickable-row" data-route="/permissions/agents/${agent.id}">
                  <td><strong>${esc(agent.name)}</strong><small>${esc(agent.agentId)}</small></td>
                  <td>${esc(agent.type)}</td>
                  <td>${esc(agent.businessOwner)}</td>
                  <td>${esc(agent.allowedTools.join(", "))}</td>
                  <td>${badge(agent.riskLevel, agent.riskLevel === "High" ? "warning" : "neutral")}</td>
                  <td>${esc(agent.approvalPolicy)}</td>
                  <td>${badge(agent.status, agent.status === "Active" ? "active" : agent.status === "Draft" ? "draft" : "disabled")}</td>
                  <td>${agent.lastUsed ? formatDate(agent.lastUsed) : "Never"}</td>
                  <td><div class="row-actions" data-stop-row><button data-route="/permissions/agents/${agent.id}">${icon("eye")}</button><button data-action="duplicate-agent" data-id="${agent.id}">${icon("copy")}</button><button data-action="confirm-toggle-agent" data-id="${agent.id}">${icon("bolt")}</button><button data-action="delete-agent" data-id="${agent.id}">${icon("trash")}</button><button class="link-btn" data-action="open-access-simulator" data-agent-id="${agent.id}">Test Access</button></div></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
      ${renderAccessSimulator(data, true)}
    </div>
  `;
}

function renderAccessSimulator(data, embedded = false) {
  const sim = stateful.simulator;
  const connection = byId(data.connections, sim.connectionId) || data.connections[0];
  const resources = data.resources[connection?.id] || [];
  const resourceTypes = getAvailableResourceTypes(connection?.sourceTool || "Google Drive");
  const resourceType = sim.resourceType || resourceTypes[0];
  const actions = getActionsForResource(connection?.sourceTool || "Google Drive", resourceType);
  return `
    <div class="card ${embedded ? "" : "wide"}">
      <div class="section-head">
        <div>
          <h2>Access Simulator ${tip("This calls the same Decision Service the Context Layer and agent gateway use, so whatever it answers here is exactly what happens in production.")}</h2>
          <p>The deterministic evaluator decides access before data retrieval or action execution.</p>
        </div>
      </div>
      <div class="form-grid two">
        ${fieldSelect("simulator.principalType", "Principal Type", ["Employee", "Agent"], sim.principalType)}
        ${sim.principalType === "Employee" ? fieldSelect("simulator.employeeId", "Principal", data.employees.map((employee) => [employee.id, `${employee.name} (${employee.employeeId})`]), sim.employeeId) : fieldSelect("simulator.agentId", "Agent", data.agents.map((agent) => [agent.id, agent.name]), sim.agentId)}
        ${sim.principalType === "Agent" ? fieldSelect("simulator.actingUserId", "Acting User", data.employees.map((employee) => [employee.id, employee.name]), sim.actingUserId) : ""}
        ${fieldSelect("simulator.connectionId", "Connection", data.connections.map((item) => [item.id, `${item.category} / ${item.sourceTool} / ${item.connectionName}`]), sim.connectionId)}
        ${fieldSelect("simulator.resourceType", "Resource Type", resourceTypes, resourceType)}
        ${fieldSelect("simulator.resourceId", "Resource", resources.filter((resource) => resource.type === resourceType).map((resource) => [resource.id, resource.name]), sim.resourceId)}
        ${fieldSelect("simulator.action", "Action", actions.map((item) => item.name), sim.action)}
        ${fieldInput("simulator.taskScope", "Task Scope", sim.taskScope)}
        ${fieldInput("simulator.reason", "Reason", sim.reason)}
        <label class="check-line"><input type="checkbox" data-bind="simulator.managedDevice" ${sim.managedDevice ? "checked" : ""} /> Managed device</label>
      </div>
      <div class="modal-actions inline">${actionButton("Test Access", "run-access-simulator", "primary")}</div>
      ${sim.result ? renderAccessResult(sim.result, sim.principalType) : `<div class="empty-state small">Select a principal, resource and action to view the final Allow or Deny explanation.</div>`}
    </div>
  `;
}

function renderAccessResult(result, principalType) {
  const verdict = result.final === "Allow" ? "allow" : "deny";
  const metrics = principalType === "Agent" ? [
    ["Source permission", result.sourcePermissionResult, "What the tool itself allows. This is a hard ceiling — the engine can only narrow it."],
    ["User permission", result.userPermissionResult, "For a delegated agent, the effective access of the person it is acting for. The agent can never exceed it."],
    ["Agent permission", result.agentPermissionResult, "The agent's own allow-list. Anything not explicitly listed is blocked by default."],
    ["Task scope", result.taskScopeResult, "Whether the requested resource falls inside the task the agent was given. Stops scope creep mid-run."],
    ["Approval", result.approvalRequired ? "Required" : "Not required", "Whether a named human must sign off before this action executes."]
  ] : [
    ["Source boundary", result.sourceBoundary, "What the connected tool itself permits. Access can be narrowed below this, never widened above it."],
    ["HyperContext policy", result.hyperContextPolicy, "The outcome of role grants and explicit denies. A deny always beats any grant."],
    ["Applied roles", result.appliedRoles.join(", ") || "None", "The active roles that produced the allow. Blank means no role granted this action."],
    ["Approval", result.requiredApproval ? "Required" : "Not required", "Whether this action pauses for human sign-off before it executes."]
  ];
  return `
    <div class="result-panel ${verdict}">
      <div class="result-header">
        <span class="result-verdict ${verdict}">${result.final === "Allow" ? icon("check") : icon("x")} ${result.final === "Allow" ? "ALLOWED" : "DENIED"}</span>
      </div>
      <div class="metric-row">
        ${metrics.map(([label, value, hint]) => miniMetric(label, value, hint)).join("")}
      </div>
      ${renderPipeline(result.pipelineSteps)}
      ${renderObligations(result.obligations)}
      ${principalType !== "Agent" && Object.keys(result.fieldRestrictions || {}).length ? `<p><strong>Field restrictions:</strong> ${Object.entries(result.fieldRestrictions).map(([field, mode]) => `${esc(field)}: ${esc(mode)}`).join(", ")}</p>` : ""}
      <details class="evaluation-trace">
        <summary>Evaluation trace</summary>
        <ol>${result.explanation.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>
      </details>
    </div>
  `;
}

function miniMetric(label, value, hint = "") {
  return `<div><span>${esc(label)}${hint ? tip(hint) : ""}</span><strong>${esc(value)}</strong></div>`;
}

const pipelineStatusLabels = { pass: "Pass", fail: "Fail", warn: "Warning", info: "Info" };

function renderPipeline(steps) {
  if (!steps?.length) return "";
  return `
    <div class="decision-pipeline">
      ${steps.map((item, index) => `
        <div class="pipeline-step ${item.status}">
          <div class="pipeline-step-head">
            <span class="pipeline-index">${index + 1}</span>
            <strong>${esc(item.step)}</strong>
            <span class="pipeline-badge ${item.status}">${pipelineStatusLabels[item.status] || item.status}</span>
          </div>
          <p>${esc(item.detail)}</p>
        </div>
        ${index < steps.length - 1 ? `<div class="pipeline-connector"></div>` : ""}
      `).join("")}
    </div>
  `;
}

function renderObligations(obligations) {
  if (!obligations?.length) return "";
  return `
    <div class="obligations-panel">
      <h4>Obligations</h4>
      <div class="inline-badges">
        ${obligations.map((item) => `<span class="obligation-chip ${/mask|deny|block/i.test(item) ? "severity-high" : "severity-medium"}">${esc(item)}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderRoleDetails(data, roleId, activeTab) {
  const role = byId(data.roles, roleId);
  if (!role) return `<div class="card"><h2>Role not found</h2><button class="btn secondary" data-route="/permissions">Back to Permissions</button></div>`;
  stateful.activeTabs.roleDetails = activeTab;
  const tabs = ["overview", "permissions", "employees", "rules", "audit"];
  return `
    <div class="detail-header">
      <button class="back-link" data-route="/permissions?tab=roles">Back to roles</button>
      <div class="detail-title">
        <div>
          <h2>${esc(role.name)}</h2>
          <p>${esc(role.description)}</p>
          <div class="inline-badges">${badge(role.origin, "neutral")} ${badge(role.status, role.status === "Active" ? "active" : role.status === "Draft" ? "draft" : "disabled")}</div>
        </div>
        <div class="page-actions compact">
          ${actionButton("Edit Role", "edit-role", "secondary", `data-id="${role.id}"`)}
          ${actionButton(role.status === "Disabled" ? "Enable" : "Disable", "confirm-toggle-role", "secondary", `data-id="${role.id}"`)}
        </div>
      </div>
    </div>
    <div class="tabs detail-tabs">
      ${tabs.map((tab) => `<button class="tab ${activeTab === tab ? "active" : ""}" data-route="/permissions/roles/${role.id}" data-query-tab="${tab}">${tabLabelRole(tab)}</button>`).join("")}
    </div>
    ${activeTab === "overview" ? renderRoleOverview(data, role) : ""}
    ${activeTab === "permissions" ? renderRolePermissions(data, role) : ""}
    ${activeTab === "employees" ? renderRoleEmployees(data, role) : ""}
    ${activeTab === "rules" ? renderRoleRules(data, role) : ""}
    ${activeTab === "audit" ? renderRoleAudit(data, role) : ""}
  `;
}

function tabLabelRole(tab) {
  return { overview: "Overview", permissions: "Permissions", employees: "Employees", rules: "Assignment Rules", audit: "Audit History" }[tab];
}

function renderRoleOverview(data, role) {
  const resources = new Set(role.permissions.flatMap((permission) => permission.resourceScope.resourceIds));
  return `
    <div class="grid-two">
      <div class="card">
        <h2>Role Profile</h2>
        <div class="definition-grid">
          ${definition("Role name", role.name)}
          ${definition("Role code", role.code)}
          ${definition("Role owner", role.owner)}
          ${definition("Origin", role.origin)}
          ${definition("Membership", (role.membership || []).join(", ") || "Manual list")}
          ${definition("Current corporate", role.currentCorporate)}
          ${definition("Creation date", formatDate(role.createdAt))}
          ${definition("Last updated", formatDate(role.updatedAt))}
          ${definition("People reached", new Set((data.groups || []).filter((group) => (role.groupIds || []).includes(group.id)).flatMap((group) => groupMembers(data, group)).map((employee) => employee.id)).size)}
          ${definition("Connected tool count", new Set(role.permissions.map((permission) => permission.tool)).size)}
          ${definition("Selected resource count", resources.size)}
          ${definition("Groups", (data.groups || []).filter((group) => (role.groupIds || []).includes(group.id)).map((group) => group.name).join(", ") || "None")}
          ${definition("Source provisioning coverage", `${role.permissions.filter((permission) => getToolCapability(permission.tool).supportsProvisioning).length}/${role.permissions.length || 1} connections`)}
        </div>
      </div>
      <div class="card">
        <h2>Effective Access Logic</h2>
        <div class="formula">
          <strong>Effective User Access =</strong>
          <span>Source-System Maximum Boundary</span>
          <span>∩ HyperContext Role Permissions</span>
          <span>− Explicit Denies</span>
          <span>∩ Runtime Conditions</span>
        </div>
      </div>
    </div>
  `;
}

function definition(label, value) {
  return `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function renderRolePermissions(data, role) {
  const grouped = groupPermissions(role.permissions);
  if (!role.permissions.length) return `<div class="card"><h2>Permissions</h2><div class="empty-state">No permissions configured yet.</div></div>`;
  return `
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Connection-Aware Permissions</h2>
          <p>Permission hierarchy: Category → Connected Tool → Connection → Resource Scope → Business Actions.</p>
        </div>
      </div>
      <div class="legend">
        ${badge("Not Configured", "unset")} ${badge("Allow", "allow")} ${badge("Explicit Deny", "deny")} ${badge("HyperContext Only", "neutral")} ${badge("Source Provisioning Supported", "active")}
      </div>
      ${Object.entries(grouped).map(([category, tools]) => `
        <details class="permission-group" open>
          <summary>${esc(category)}</summary>
          ${Object.entries(tools).map(([tool, grants]) => `
            <div class="tool-group">
              <h3>${esc(tool)}</h3>
              ${grants.map((grant) => renderConnectionGrant(data, role, grant)).join("")}
            </div>
          `).join("")}
        </details>
      `).join("")}
    </div>
  `;
}

function groupPermissions(permissions) {
  return permissions.reduce((acc, permission) => {
    acc[permission.category] ||= {};
    acc[permission.category][permission.tool] ||= [];
    acc[permission.category][permission.tool].push(permission);
    return acc;
  }, {});
}

function renderConnectionGrant(data, role, grant) {
  const connection = byId(data.connections, grant.connectionId);
  const capability = getToolCapability(grant.tool);
  const resources = data.resources[grant.connectionId] || [];
  return `
    <div class="connection-policy">
      <div class="connection-policy-head">
        <div>
          <strong>${esc(connection?.connectionName || grant.connectionId)}</strong>
          <span>${badge(connection?.status || "Unknown", "active")} ${badge(connection?.permissionState || "Configured", "draft")} ${badge(capability.sourcePermissionsReadable ? "Source ACL visible" : "Source ACL unavailable", capability.sourcePermissionsReadable ? "active" : "warning")} ${badge(capability.supportsProvisioning ? "Source Provisioning Supported" : "HyperContext Only", capability.supportsProvisioning ? "active" : "neutral")}</span>
        </div>
        <label class="switch-row ${capability.supportsProvisioning ? "" : "disabled"}" title="${capability.supportsProvisioning ? "Also provision permissions in source tool" : "This action is not supported by the connected source tool."}">
          <input type="checkbox" data-action="toggle-source-provision" data-role-id="${role.id}" data-grant-id="${grant.id}" ${grant.provisionToSource ? "checked" : ""} ${capability.supportsProvisioning ? "" : "disabled"} />
          <span>Also provision permissions in source tool</span>
        </label>
      </div>
      <div class="policy-columns">
        <div>
          <h4>Resource Scope</h4>
          <div class="scope-tools">
            <button class="btn secondary slim" data-action="select-all-resources" data-role-id="${role.id}" data-grant-id="${grant.id}">Select all resources</button>
            <input class="compact-input" data-filter="resourceSearch.${grant.id}" placeholder="Search resources" />
          </div>
          <div class="resource-tree">
            ${resources.map((resource) => `
              <label class="resource-node" style="--depth:${resource.parentId ? 1 : 0}">
                <input type="checkbox" data-action="toggle-resource-scope" data-role-id="${role.id}" data-grant-id="${grant.id}" value="${resource.id}" ${grant.resourceScope.mode === "all" || grant.resourceScope.resourceIds.includes(resource.id) ? "checked" : ""} />
                <span>${esc(resource.name)}</span>
                <small>${esc(resource.type)}</small>
              </label>
            `).join("")}
          </div>
        </div>
        <div>
          <h4>Permission Matrix ${tip("Click a cell to cycle Unset → Allow → Deny. Unset is not permission — anything left unset stays denied. An explicit Deny always wins over any Allow from another role.")}</h4>
          ${renderPermissionMatrix(role, grant)}
        </div>
      </div>
      <div class="restrictions-grid">
        <div>
          <h4>Field-Level Restrictions ${tip("Obligations returned with every Allow. Visible releases the value, Masked redacts it, Hidden never loads it, and Aggregate Only permits totals but no row-level detail.")}</h4>
          <div class="chip-list">
            ${(fieldRestrictionCatalogue[grant.category] || []).map((field) => `
              <label>
                <span>${esc(field)}</span>
                <select data-action="field-restriction" data-role-id="${role.id}" data-grant-id="${grant.id}" data-field="${esc(field)}">
                  ${["Visible", "Masked", "Hidden", "Aggregate Only"].map((mode) => `<option ${grant.fieldRestrictions?.[field] === mode ? "selected" : ""}>${mode}</option>`).join("")}
                </select>
              </label>
            `).join("")}
          </div>
        </div>
        <div>
          <h4>Conditions and Restrictions</h4>
          <div class="conditions">
            ${conditionLabels.map((label) => `<span>${esc(label)}</span>`).join("")}
          </div>
          <div class="definition-grid compact">
            ${definition("Max records", grant.conditions.maxRecords)}
            ${definition("Max export size", grant.conditions.maxExportSize)}
            ${definition("Effective date", grant.conditions.effectiveDate)}
            ${definition("Expiry date", grant.conditions.expiryDate || "None")}
          </div>
        </div>
        <div>
          <h4>Source Enforcement Status ${tip("Where this grant is actually enforced. “Enforced in HyperContext” filters at answer time; “Provisioned in Source” has been written back to the tool itself. “Unsupported by Source” means the tool has no API to provision it, so it needs a manual task.")}</h4>
          ${selectStatus(role.id, grant.id, grant.sourceProvisioningStatus)}
        </div>
      </div>
    </div>
  `;
}

function renderPermissionMatrix(role, grant) {
  const resourceTypes = Object.keys(grant.matrix);
  const allActions = [...new Set(resourceTypes.flatMap((type) => Object.keys(grant.matrix[type])))];
  return `
    <div class="matrix-wrap">
      <table class="matrix">
        <thead>
          <tr>
            <th>Resource Type</th>
            ${allActions.map((name) => `<th>${esc(name)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${resourceTypes.map((type) => `
            <tr>
              <td><strong>${esc(type)}</strong></td>
              ${allActions.map((name) => {
                const actionInfo = getActionsForResource(grant.tool, type).find((item) => item.name === name);
                const unsupported = !actionInfo;
                const value = grant.matrix[type][name] || "unset";
                return `
                  <td>
                    <button class="state-cell ${value}" data-action="cycle-permission" data-role-id="${role.id}" data-grant-id="${grant.id}" data-resource-type="${esc(type)}" data-permission="${esc(name)}" ${unsupported ? "disabled title='This action is not supported by the connected source tool.'" : `title='${actionInfo.hypercontextOnly ? "HyperContext Only" : actionInfo.provisionable ? "Source Provisioning Supported" : "Enforced in HyperContext"}'`}>
                      ${value === "allow" ? "Allow" : value === "deny" ? "Deny" : "Unset"}
                    </button>
                  </td>
                `;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function selectStatus(roleId, grantId, value) {
  return `<select data-action="source-status" data-role-id="${roleId}" data-grant-id="${grantId}">${sourceEnforcementStatuses.map((status) => `<option ${status === value ? "selected" : ""}>${esc(status)}</option>`).join("")}</select>`;
}

function renderRoleEmployees(data, role) {
  const employees = [...new Map((data.groups || []).filter((group) => (role.groupIds || []).includes(group.id)).flatMap((group) => groupMembers(data, group)).map((employee) => [employee.id, employee])).values()];
  return `
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Assigned Employees</h2>
          <p>Assignments can be permanent, temporary, HRMS-derived, IAM-derived or imported from CSV.</p>
        </div>
        <div class="page-actions compact">
          ${actionButton("Add Employees", "open-add-employees", "primary", `data-role-id="${role.id}"`)}
          ${actionButton("Upload Employee CSV", "open-import-modal", "secondary")}
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Employee ID</th><th>Work Email</th><th>Department</th><th>Designation</th><th>Assignment Source</th><th>Effective From</th><th>Effective Until</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${employees.map((employee) => `
              <tr>
                <td><strong>${esc(employee.name)}</strong></td>
                <td>${esc(employee.employeeId)}</td>
                <td>${esc(employee.workEmail)}</td>
                <td>${esc(employee.department)}</td>
                <td>${esc(employee.designation)}</td>
                <td>${esc(employee.assignmentSource)}</td>
                <td>2026-07-01</td>
                <td>Open-ended</td>
                <td>${badge(employee.accessStatus, employee.accessStatus === "Active" ? "active" : "disabled")}</td>
                <td><div class="row-actions"><button data-route="/directory/${employee.id}">View Employee</button><button data-action="remove-employee-role" data-role-id="${role.id}" data-employee-id="${employee.id}">Remove</button><button data-action="temp-employee-role" data-role-id="${role.id}" data-employee-id="${employee.id}">Temporary</button><button data-route="/directory/${employee.id}?tab=explanation">Explain</button></div></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderRoleRules(data, role) {
  const rules = (data.groups || []).filter((group) => (role.groupIds || []).includes(group.id));
  return `
    <div class="card">
      <h2>Assignment Rules</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Rule</th><th>Source</th><th>Conditions</th><th>Matching Employees</th><th>Status</th><th>Last Evaluated</th></tr></thead>
          <tbody>${rules.map((rule) => `<tr><td>${esc(rule.name)}</td><td>${esc(rule.source)}</td><td>${esc(rule.conditions)}</td><td>${rule.matchingEmployeeIds.length}</td><td>${badge(rule.status, "active")}</td><td>${formatDate(rule.lastEvaluated)}</td></tr>`).join("") || `<tr><td colspan="6">No assignment rules yet.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderRoleAudit(data, role) {
  const audits = data.auditEvents.filter((event) => event.principal === role.name || event.after.includes(role.name) || event.summary.includes(role.name));
  return auditTable(audits.length ? audits : data.auditEvents.slice(0, 5));
}

function renderEmployeeDetails(data, employeeId, activeTab) {
  const employee = byId(data.employees, employeeId);
  if (!employee) return `<div class="card"><h2>Employee not found</h2></div>`;
  stateful.activeTabs.employeeDetails = activeTab;
  const tabs = ["profile", "roles", "effective", "explanation", "audit"];
  return `
    <div class="detail-header">
      <button class="back-link" data-route="/permissions?tab=employees">Back to employees</button>
      <div class="detail-title">
        <div>
          <h2>${esc(employee.name)}</h2>
          <p>${esc(employee.designation)} · ${esc(employee.department)} · ${esc(employee.workEmail)}</p>
          <div class="inline-badges">${badge(employee.accessStatus, employee.accessStatus === "Active" ? "active" : "disabled")} ${badge(employee.employmentStatus, "neutral")}</div>
        </div>
        <div class="page-actions compact">
          ${actionButton("Add Role", "open-add-role-to-employee", "secondary", `data-employee-id="${employee.id}"`)}
          ${actionButton("Add Temporary Access", "add-temp-access", "secondary", `data-employee-id="${employee.id}"`)}
          ${actionButton("Add Explicit Restriction", "add-explicit-restriction", "secondary", `data-employee-id="${employee.id}"`)}
        </div>
      </div>
    </div>
    <div class="tabs detail-tabs">
      ${tabs.map((tab) => `<button class="tab ${activeTab === tab ? "active" : ""}" data-route="/directory/${employee.id}" data-query-tab="${tab}">${{ profile: "Profile", roles: "Assigned Roles", effective: "Effective Access", explanation: "Access Explanation", audit: "Audit History" }[tab]}</button>`).join("")}
    </div>
    ${activeTab === "profile" ? renderEmployeeProfile(employee) : ""}
    ${activeTab === "roles" ? renderEmployeeRoles(data, employee) : ""}
    ${activeTab === "effective" ? renderEmployeeEffective(data, employee) : ""}
    ${activeTab === "explanation" ? renderEmployeeExplanation(data, employee) : ""}
    ${activeTab === "audit" ? auditTable(data.auditEvents.filter((event) => event.principal === employee.name || event.summary.includes(employee.name))) : ""}
  `;
}

function renderEmployeeProfile(employee) {
  return `
    <div class="grid-two">
      <div class="card">
        <h2>Profile</h2>
        <div class="definition-grid">
          ${definition("Employee ID", employee.employeeId)}
          ${definition("Work email", employee.workEmail)}
          ${definition("Department", employee.department)}
          ${definition("Designation", employee.designation)}
          ${definition("Grade", employee.grade)}
          ${definition("Location", employee.location)}
          ${definition("Employment type", employee.employmentType)}
          ${definition("Employment status", employee.employmentStatus)}
          ${definition("Manager", employee.manager)}
          ${definition("HRMS source", employee.hrmsSource)}
          ${definition("IAM identity", employee.iamIdentity)}
        </div>
      </div>
      <div class="card">
        <h2>Universal Identity Mapping</h2>
        <div class="definition-grid">
          ${definition("HyperContext Principal ID", employee.hyperContextPrincipalId)}
          ${definition("HRMS Employee ID", employee.mappings.hrmsEmployeeId)}
          ${definition("Work Email", employee.mappings.workEmail)}
          ${definition("IAM User ID", employee.mappings.iamUserId)}
          ${definition("Google User ID", employee.mappings.googleUserId)}
          ${definition("Jira Account ID", employee.mappings.jiraAccountId)}
          ${definition("GitHub Username", employee.mappings.githubUsername)}
        </div>
      </div>
    </div>
  `;
}

function renderEmployeeRoles(data, employee) {
  const roles = rolesForEmployee(data, employee.id);
  return `
    <div class="card">
      <h2>Assigned Roles</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Role</th><th>Assignment source</th><th>Assigned by</th><th>Effective from</th><th>Effective until</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${roles.map((role) => `<tr><td>${esc(role.name)}</td><td>${esc(employee.assignmentSource)}</td><td>${esc(role.owner)}</td><td>2026-07-01</td><td>Open-ended</td><td>${badge(role.status, role.status === "Active" ? "active" : "disabled")}</td><td><button data-action="remove-employee-role" data-role-id="${role.id}" data-employee-id="${employee.id}">Remove Role</button></td></tr>`).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
}

/** What this employee's active roles intend for one connection + resource type. */
function roleIntentFor(data, employee, connectionId, resourceType) {
  const roles = rolesForEmployee(data, employee.id).filter((role) => role.status === "Active");
  const allow = new Set();
  const deny = new Set();
  const viaRoles = new Set();
  const resourceIds = new Set();
  let scopeAll = false;
  roles.forEach((role) => {
    role.permissions
      .filter((permission) => permission.connectionId === connectionId)
      .forEach((permission) => {
        Object.entries(permission.matrix?.[resourceType] || {}).forEach(([name, effect]) => {
          if (effect === "allow") {
            allow.add(name);
            viaRoles.add(role.name);
          }
          if (effect === "deny") deny.add(name);
        });
        if (permission.resourceScope?.mode === "all") scopeAll = true;
        (permission.resourceScope?.resourceIds || []).forEach((id) => resourceIds.add(id));
      });
  });
  return { allow: [...allow], deny: [...deny], roles: [...viaRoles], resourceIds: [...resourceIds], scopeAll };
}

const OUTCOMES = {
  effective: { label: "Allowed", tone: "allow", why: "Granted by role and confirmed in the tool." },
  ceiling: { label: "Blocked", tone: "deny", why: "Limited by ceiling — the role grants this, but the tool does not give this account the right. We cannot widen it." },
  role: { label: "Not granted", tone: "unset", why: "Limited by role — the tool would allow this, but no role grants it. This is the layer narrowing access." },
  denied: { label: "Denied", tone: "deny", why: "Explicit deny in a role. A deny always beats a grant." }
};

function classifyAction(observed, granted, denied) {
  if (denied) return "denied";
  if (granted && observed) return "effective";
  if (granted && !observed) return "ceiling";
  return "role";
}

function renderEmployeeEffective(data, employee) {
  const roles = rolesForEmployee(data, employee.id).filter((role) => role.status === "Active");
  const observedRows = observedRowsFor(data, employee.id);
  const grantConnectionIds = roles.flatMap((role) => role.permissions.map((permission) => permission.connectionId));
  const connectionIds = [...new Set([...observedRows.map((row) => row.connectionId), ...grantConnectionIds])];

  const tally = { effective: 0, ceiling: 0, role: 0, denied: 0 };
  const blocks = connectionIds.map((connectionId) => {
    const connection = byId(data.connections, connectionId);
    if (!connection) return "";
    const resourceTypes = [...new Set([
      ...observedRows.filter((row) => row.connectionId === connectionId).map((row) => row.resourceType),
      ...roles.flatMap((role) => role.permissions.filter((permission) => permission.connectionId === connectionId).flatMap((permission) => Object.keys(permission.matrix || {})))
    ])];

    const groups = resourceTypes.map((resourceType) => {
      const observedRow = observedAccessFor(data, employee.id, connectionId, resourceType);
      const intent = roleIntentFor(data, employee, connectionId, resourceType);
      const observedActions = observedRow?.actions || [];
      const catalogueOrder = getActionsForResource(connection.sourceTool, resourceType).map((item) => item.name);
      const union = [...new Set([...catalogueOrder, ...observedActions, ...intent.allow, ...intent.deny])]
        .filter((name) => observedActions.includes(name) || intent.allow.includes(name) || intent.deny.includes(name));
      if (!union.length) return "";

      const rows = union.map((name) => {
        const outcome = classifyAction(observedActions.includes(name), intent.allow.includes(name), intent.deny.includes(name));
        tally[outcome] += 1;
        const meta = OUTCOMES[outcome];
        return `
          <tr class="intersect-row ${outcome}">
            <td>${esc(name)}</td>
            <td class="mark">${observedActions.includes(name) ? `<span class="yes">✓</span>` : `<span class="no">—</span>`}</td>
            <td class="mark">${intent.deny.includes(name) ? `<span class="denied">deny</span>` : intent.allow.includes(name) ? `<span class="yes">✓</span>` : `<span class="no">—</span>`}</td>
            <td>${badge(meta.label, meta.tone)}</td>
            <td class="why">${esc(meta.why)}</td>
          </tr>
        `;
      }).join("");

      const extraResources = (observedRow?.resourceIds || []).filter((id) => !intent.scopeAll && !intent.resourceIds.includes(id));
      return `
        <div class="intersect-group">
          <h4>${esc(resourceType)}${extraResources.length ? ` <span class="scope-note">tool exposes ${(observedRow?.resourceIds || []).length} resources · role scopes to ${intent.scopeAll ? "all" : intent.resourceIds.length}</span>` : ""}</h4>
          <div class="table-wrap tight">
            <table class="intersect-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>In tool</th>
                  <th>Role</th>
                  <th>Effective</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join("");

    if (!groups) return "";
    const via = [...new Set(roles.filter((role) => role.permissions.some((permission) => permission.connectionId === connectionId)).map((role) => role.name))];
    return `
      <div class="card">
        <div class="section-head">
          <div>
            <h3>${esc(connection.category)} → ${esc(connection.sourceTool)} → ${esc(connection.connectionName)}</h3>
            <p>${via.length ? `Via role: ${esc(via.join(", "))}` : "No role grants anything here — everything below is native access this layer withholds."}</p>
          </div>
        </div>
        ${groups}
      </div>
    `;
  }).join("");

  return `
    <div class="card intersect-summary">
      <div class="section-head">
        <div>
          <h2>Effective Access ${tip("Effective access is the intersection of what the tool itself grants this account and what their roles allow, minus explicit denies. Whichever side is narrower wins — the layer can only reduce access, never extend it.")}</h2>
          <p>Ceiling last observed from the source tools ${esc(ceilingAge(data))}.</p>
        </div>
        <div class="formula inline-formula">
          <strong>Effective =</strong>
          <span>Observed ceiling</span>
          <span>∩ Role grants</span>
          <span>− Explicit deny</span>
        </div>
      </div>
      <div class="intersect-tally">
        ${intersectTally("Effective", tally.effective, "allow", "Granted by a role and confirmed present in the tool.")}
        ${intersectTally("Limited by role", tally.role, "unset", "The tool grants this but no role does, so the layer withholds it. This is the product doing its job — and each one is native access worth reviewing.")}
        ${intersectTally("Limited by ceiling", tally.ceiling, "warning", "A role grants this but the tool does not. The grant has no effect until it is provisioned in the source tool.")}
        ${intersectTally("Explicit deny", tally.denied, "deny", "Blocked by a deny rule regardless of any grant.")}
      </div>
    </div>
    ${blocks || `<div class="empty-state">No role grants and no observed native access for this identity.</div>`}
  `;
}

function intersectTally(label, value, tone, hint) {
  return `
    <div class="tally-item ${tone}">
      <strong>${esc(value)}</strong>
      <span>${esc(label)} ${tip(hint)}</span>
    </div>
  `;
}

function ceilingAge(data) {
  if (!data.ceilingSyncedAt) return "at an unknown time";
  const hours = (Date.now() - new Date(data.ceilingSyncedAt).getTime()) / 3600000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes ago`;
  if (hours < 48) return `${Math.round(hours)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function renderEmployeeExplanation(data, employee) {
  const explanation = explainEmployeeAccess(data, employee.id);
  return `
    <div class="card">
      <h2>Why does this employee have access?</h2>
      <ol class="explanation-list">${explanation.map((line) => `<li>${esc(line)}</li>`).join("")}</ol>
      <div class="deny-note">Denied-access example: ${esc(employee.name)} cannot export restricted data when an explicit export deny or source boundary block applies.</div>
    </div>
  `;
}

function renderAgentDetails(data, agentId, activeTab) {
  const agent = byId(data.agents, agentId);
  if (!agent) return `<div class="card"><h2>Agent not found</h2></div>`;
  const tabs = ["overview", "permissions", "approvals", "execution", "audit"];
  return `
    <div class="detail-header">
      <button class="back-link" data-route="/permissions?tab=agent-access">Back to agents</button>
      <div class="detail-title">
        <div>
          <h2>${esc(agent.name)}</h2>
          <p>${esc(agent.purpose)}</p>
          <div class="inline-badges">${badge(agent.type, "neutral")} ${badge(agent.status, agent.status === "Active" ? "active" : agent.status === "Draft" ? "draft" : "disabled")} ${badge(agent.riskLevel, "warning")}</div>
        </div>
        ${actionButton("Disable Agent", "confirm-toggle-agent", "secondary", `data-id="${agent.id}"`)}
      </div>
    </div>
    ${agent.status === "Active" ? `
      <div class="kill-switch-panel">
        <div>
          <strong>Emergency kill switch</strong>
          <span>Immediately revokes every allow-listed connection, action and task scope for ${esc(agent.name)}. This cannot be undone from history.</span>
        </div>
        ${actionButton(`${icon("bolt")} Kill Agent Now`, "confirm-toggle-agent", "kill-switch-btn", `data-id="${agent.id}"`)}
      </div>
    ` : ""}
    <div class="tabs detail-tabs">
      ${tabs.map((tab) => `<button class="tab ${activeTab === tab ? "active" : ""}" data-route="/permissions/agents/${agent.id}" data-query-tab="${tab}">${{ overview: "Overview", permissions: "Permissions", approvals: "Approval Rules", execution: "Execution History", audit: "Audit History" }[tab]}</button>`).join("")}
    </div>
    ${activeTab === "overview" ? renderAgentOverview(agent) : ""}
    ${activeTab === "permissions" ? renderAgentPermissions(data, agent) : ""}
    ${activeTab === "approvals" ? `<div class="card"><h2>Approval Rules</h2><p>${esc(agent.approvalPolicy)}</p><p>Require reason: ${agent.approvalPolicy.includes("reason") ? "Yes" : "Configured by risk level"}.</p></div>` : ""}
    ${activeTab === "execution" ? `<div class="card"><h2>Execution History</h2><div class="empty-state">No unsafe action has executed. Simulated tests do not mutate connected tools.</div></div>` : ""}
    ${activeTab === "audit" ? auditTable(data.auditEvents.filter((event) => event.principal === agent.name || event.principalType === "Agent")) : ""}
  `;
}

function renderAgentOverview(agent) {
  return `
    <div class="grid-two">
      <div class="card">
        <h2>Agent Details</h2>
        <div class="definition-grid">
          ${definition("Agent ID", agent.agentId)}
          ${definition("Agent type", agent.type)}
          ${definition("Business owner", agent.businessOwner)}
          ${definition("Technical owner", agent.technicalOwner)}
          ${definition("Status", agent.status)}
          ${definition("Expiry or recertification", agent.expiry || "Not set")}
        </div>
      </div>
      <div class="card">
        <h2>Operating Mode</h2>
        <div class="formula">
          ${agent.type === "Delegated Agent" ? `
            <strong>Effective Agent Access =</strong>
            <span>Requesting User Permissions</span>
            <span>∩ Agent Permissions</span>
            <span>∩ Current Task Scope</span>
            <span>∩ Runtime Conditions</span>
          ` : `
            <strong>Autonomous Agent</strong>
            <span>Uses its own service identity.</span>
            <span>Uses pre-approved resource and action scope.</span>
            <span>Does not impersonate a human user.</span>
          `}
        </div>
      </div>
    </div>
  `;
}

function renderAgentPermissions(data, agent) {
  return `
    <div class="card">
      <h2>Tools, Resources and Actions</h2>
      <div class="effective-block">
        <h3>${esc(agent.allowedTools.join(", "))}</h3>
        <p>Connections: ${esc(agent.allowedConnectionIds.map((idValue) => byId(data.connections, idValue)?.connectionName).filter(Boolean).join(", "))}</p>
        <p>Allowed actions: ${esc(agent.allowedActions.join(", "))}</p>
        <p>Data restrictions: ${Object.entries(agent.restrictions).map(([key, value]) => `${esc(key)}: ${esc(value)}`).join(", ")}</p>
      </div>
    </div>
  `;
}

function auditTable(events) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Event</th><th>Principal</th><th>Performed By</th><th>Source</th><th>Category</th><th>Tool</th><th>Connection</th><th>Timestamp</th><th>Before/After Summary</th></tr></thead>
        <tbody>
          ${events.map((event) => `
            <tr>
              <td>${esc(event.eventType)}</td>
              <td>${esc(event.principalType)}<small>${esc(event.principal)}</small></td>
              <td>${esc(event.performedBy)}</td>
              <td>${esc(event.source)}</td>
              <td>${esc(event.category || "Any")}</td>
              <td>${esc(event.tool || "Any")}</td>
              <td>${esc(event.connection || "Any")}</td>
              <td>${formatDate(event.timestamp)}</td>
              <td><strong>Before:</strong> ${esc(event.before || "N/A")}<br /><strong>After:</strong> ${esc(event.after || event.summary)}</td>
            </tr>
          `).join("") || `<tr><td colspan="9">No audit events match the selected filters.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderModal(data) {
  if (stateful.confirm) return renderConfirmModal();
  if (stateful.modal === "connection") return renderConnectionWizard(data);
  if (stateful.modal === "role") return renderRoleWizard(data);
  if (stateful.modal === "agent") return renderAgentWizard(data);
  if (stateful.modal === "access-simulator") return `<div class="modal-backdrop"><div class="modal xl">${modalHeader("Access Simulator")}${renderAccessSimulator(data)}<div class="modal-actions">${actionButton("Close", "close-modal", "secondary")}</div></div></div>`;
  if (stateful.modal === "group") return renderGroupModal(data);
  return "";
}

function renderConfirmModal() {
  return `
    <div class="modal-backdrop">
      <div class="modal sm" role="dialog" aria-modal="true">
        ${modalHeader(stateful.confirm.title)}
        <p>${esc(stateful.confirm.body)}</p>
        <div class="modal-actions">
          ${actionButton("Cancel", "close-confirm", "secondary")}
          ${actionButton("Confirm", "confirm-action", "primary")}
        </div>
      </div>
    </div>
  `;
}

function modalHeader(title) {
  return `<div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="Close">${icon("x")}</button></div>`;
}

function ensureConnectionWizard(data) {
  if (!stateful.connectionWizard) {
    stateful.connectionWizard = {
      step: 1,
      draft: {
        corporateName: data.corporate.name,
        corporateReferenceId: data.corporate.referenceId,
        category: "HRMS",
        fullName: "",
        email: "",
        phone: "",
        initialSyncDate: "2026-08-01",
        transferMethod: "HRMS Integration",
        sourceTool: "",
        authMode: "OAuth simulation",
        modules: [],
        dataScope: "Selected resources only",
        syncSchedule: "Daily at 02:00"
      }
    };
  }
  return stateful.connectionWizard;
}

function renderConnectionWizard(data) {
  const wizard = ensureConnectionWizard(data);
  const category = getCategory(wizard.draft.category);
  const steps = ["Corporate and Category", "Data Transfer Method", "Source Tool", "Authentication", "Modules and Data Models", "Data Scope", "Sync Configuration", "Review and Create Connection"];
  return `
    <div class="modal-backdrop">
      <div class="modal xl" role="dialog" aria-modal="true">
        ${modalHeader("Add New Connection")}
        ${stepper(steps, wizard.step)}
        <div class="wizard-body">
          ${wizard.step === 1 ? `
            <div class="form-grid two">
              ${fieldInput("connection.corporateName", "Corporate Name", wizard.draft.corporateName)}
              ${fieldInput("connection.corporateReferenceId", "Corporate Reference ID", wizard.draft.corporateReferenceId)}
              ${fieldSelect("connection.category", "Category", categories.map((item) => [item.label, item.label]), category.label, "change-category")}
              <div></div>
              ${fieldInput("connection.fullName", "Full Name", wizard.draft.fullName)}
              ${fieldInput("connection.email", "Email Address", wizard.draft.email, "email")}
              ${fieldInput("connection.phone", "Phone Number", wizard.draft.phone)}
              ${fieldInput("connection.initialSyncDate", "Initial Sync Date", wizard.draft.initialSyncDate, "date")}
            </div>
          ` : ""}
          ${wizard.step === 2 ? `
            <div class="option-grid">
              ${optionCard(category.integrationLabel, category.description, wizard.draft.transferMethod === category.integrationLabel, "connection-transfer", category.integrationLabel)}
              ${optionCard("SFTP Transfer", "Receive periodic files from a secure SFTP drop without requesting real credentials.", wizard.draft.transferMethod === "SFTP Transfer", "connection-transfer", "SFTP Transfer")}
              ${optionCard("Upload CSV", "Upload local CSV files for this prototype connection and validate columns in-browser.", wizard.draft.transferMethod === "Upload CSV", "connection-transfer", "Upload CSV")}
            </div>
          ` : ""}
          ${wizard.step === 3 ? `
            <div class="option-grid">
              ${getToolsForCategory(category.label).map((tool) => optionCard(tool, `${tool} ${category.label} connector`, wizard.draft.sourceTool === tool, "connection-tool", tool)).join("")}
            </div>
          ` : ""}
          ${wizard.step === 4 ? `
            <div class="card inset">
              <h3>Authentication</h3>
              <p>No real credentials are requested or stored. This prototype simulates a successful ${esc(wizard.draft.sourceTool || category.tools[0])} connection.</p>
              <div class="form-grid two">${fieldInput("connection.authMode", "Authentication mode", wizard.draft.authMode)}${fieldInput("connection.connectionName", "Connection name", wizard.draft.connectionName || `${data.corporate.name} ${wizard.draft.sourceTool || category.tools[0]}`)}</div>
            </div>
          ` : ""}
          ${wizard.step === 5 ? `
            <div class="check-grid">
              ${getModulesForCategory(category.label).map((module) => `<label class="check-card"><input type="checkbox" data-action="connection-module" value="${esc(module)}" ${wizard.draft.modules.includes(module) ? "checked" : ""} /><span>${esc(module)}</span></label>`).join("")}
            </div>
          ` : ""}
          ${wizard.step === 6 ? `
            <div class="form-grid one">
              ${fieldSelect("connection.dataScope", "Data Scope", ["Selected resources only", "All resources", "Department-scoped resources", "Corporate default scope"], wizard.draft.dataScope)}
              <div class="warning">Granting all resources can broaden visibility. New permissions still default to No Access until configured in the Permissions layer.</div>
            </div>
          ` : ""}
          ${wizard.step === 7 ? `
            <div class="form-grid two">
              ${fieldSelect("connection.syncSchedule", "Sync Configuration", ["Hourly", "Daily at 02:00", "Weekdays at 06:00", "Manual only"], wizard.draft.syncSchedule)}
              ${fieldSelect("connection.status", "Connection Status", ["Active", "Draft"], wizard.draft.status || "Active")}
            </div>
          ` : ""}
          ${wizard.step === 8 ? connectionReview(data, wizard.draft) : ""}
        </div>
        <div class="modal-actions">
          ${wizard.step > 1 ? actionButton("Back", "connection-back", "secondary") : ""}
          ${actionButton("Cancel", "close-modal", "secondary")}
          ${wizard.step < steps.length ? actionButton("Next", "connection-next", "primary") : actionButton("Create Connection", "create-connection", "primary")}
        </div>
      </div>
    </div>
  `;
}

function connectionReview(data, draft) {
  const category = getCategory(draft.category);
  const tool = draft.sourceTool || category.tools[0];
  const capability = getToolCapability(tool);
  return `
    <div class="review-grid">
      ${definition("Corporate", draft.corporateName)}
      ${definition("Category", category.label)}
      ${definition("Transfer method", draft.transferMethod)}
      ${definition("Source tool", tool)}
      ${definition("Modules", (draft.modules.length ? draft.modules : getModulesForCategory(category.label)).join(", "))}
      ${definition("Data scope", draft.dataScope)}
      ${definition("Sync", draft.syncSchedule)}
      ${definition("Default effective access", "No Access")}
      ${definition("Permission state", "Unconfigured")}
      ${definition("Source ACL visibility", capability.sourcePermissionsReadable ? "Readable" : "Not available")}
      ${definition("Source provisioning", capability.supportsProvisioning ? "Supported" : "Unsupported")}
    </div>
  `;
}

function optionCard(title, description, selected, action, value) {
  return `<button class="option-card ${selected ? "selected" : ""}" data-action="${action}" data-value="${esc(value)}"><strong>${esc(title)}</strong><span>${esc(description)}</span></button>`;
}

function stepper(steps, currentStep) {
  return `<div class="stepper">${steps.map((step, index) => `<div class="step ${index + 1 === currentStep ? "active" : index + 1 < currentStep ? "done" : ""}"><span>${index + 1}</span><label>${esc(step)}</label></div>`).join("")}</div>`;
}

function fieldInput(bind, label, value = "", type = "text") {
  return `<label class="field"><span>${esc(label)}</span><input type="${type}" data-bind="${esc(bind)}" value="${esc(value)}" /></label>`;
}

function fieldSelect(bind, label, options, value = "", changeAction = "") {
  const normalized = options.map((option) => Array.isArray(option) ? option : [option, option]);
  return `
    <label class="field">
      <span>${esc(label)}</span>
      <select data-bind="${esc(bind)}" ${changeAction ? `data-change-action="${esc(changeAction)}"` : ""}>
        ${normalized.map(([optionValue, optionLabel]) => `<option value="${esc(optionValue)}" ${String(optionValue) === String(value) ? "selected" : ""}>${esc(optionLabel)}</option>`).join("")}
      </select>
    </label>
  `;
}

function emptyRoleDraft(data) {
  return {
    name: "",
    code: "",
    description: "",
    owner: data.currentUser.name,
    status: "Active",
    groupIds: [],
    connectionIds: [],
    resourceIdsByConnection: {},
    matrixByConnection: {},
    fieldRestrictions: {},
    conditions: {}
  };
}

function roleDraftFromRole(data, role) {
  return {
    id: role.id,
    name: role.name,
    code: role.code,
    description: role.description,
    owner: role.owner,
    status: role.status,
    origin: role.origin,
    groupIds: [...(role.groupIds || [])],
    connectionIds: role.permissions.map((permission) => permission.connectionId),
    resourceIdsByConnection: Object.fromEntries(role.permissions.map((permission) => [permission.connectionId, [...(permission.resourceScope?.resourceIds || [])]])),
    matrixByConnection: Object.fromEntries(role.permissions.map((permission) => [permission.connectionId, structuredClone(permission.matrix)])),
    fieldRestrictions: { ...(role.permissions[0]?.fieldRestrictions || {}) },
    conditions: { ...(role.permissions[0]?.conditions || {}) }
  };
}

function ensureRoleWizard(data) {
  if (!stateful.roleWizard) stateful.roleWizard = { step: 1, draft: emptyRoleDraft(data) };
  return stateful.roleWizard;
}

function ensureGroupModal() {
  if (!stateful.groupModal) stateful.groupModal = { name: "", rule: "Department = Finance", description: "" };
  return stateful.groupModal;
}

function renderGroupModal(data) {
  const draft = ensureGroupModal();
  const [field, value] = String(draft.rule || "").split("=").map((part) => part.trim());
  const valuesFor = {
    Designation: [...new Set(data.employees.map((employee) => employee.designation))],
    Department: [...new Set(data.employees.map((employee) => employee.department))],
    "Employment Type": [...new Set(data.employees.map((employee) => employee.employmentType))],
    "Employment Status": [...new Set(data.employees.map((employee) => employee.employmentStatus))],
    Grade: [...new Set(data.employees.map((employee) => employee.grade))],
    Location: [...new Set(data.employees.map((employee) => employee.location))]
  };
  const preview = groupMembers(data, { rule: draft.rule, extraMemberIds: [] });
  return `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        ${modalHeader(draft.id ? "Edit Group" : "Create Group")}
        <div class="wizard-body">
          <div class="form-grid two">
            ${fieldInput("group.name", "Group name", draft.name)}
            ${fieldInput("group.description", "Description", draft.description)}
          </div>
          <div class="subsection">
            <h3>Membership rule ${tip("One attribute, matched against each synced employee record. Anyone matching joins the group on the next sync — that is what makes joiner provisioning automatic.")}</h3>
            <div class="form-grid two">
              <label class="select-label"><span>Attribute</span>
                <select data-action="group-rule-field">${GROUP_RULE_FIELDS.map((item) => `<option ${item === field ? "selected" : ""}>${item}</option>`).join("")}</select>
              </label>
              <label class="select-label"><span>Equals</span>
                <select data-action="group-rule-value">${(valuesFor[field] || []).map((item) => `<option ${item === value ? "selected" : ""}>${esc(item)}</option>`).join("")}</select>
              </label>
            </div>
            <p class="muted">Matches <strong>${preview.length}</strong> ${preview.length === 1 ? "person" : "people"} today: ${esc(preview.map((employee) => employee.name).join(", ") || "nobody")}</p>
          </div>
        </div>
        <div class="modal-actions">
          ${actionButton("Cancel", "close-modal", "secondary")}
          ${actionButton(draft.id ? "Save group" : "Create group", "save-group", "primary")}
        </div>
      </div>
    </div>
  `;
}

function renderRoleWizard(data) {
  const wizard = ensureRoleWizard(data);
  const steps = ["Role & Groups", "Permissions", "Review"];
  return `
    <div class="modal-backdrop">
      <div class="modal xl" role="dialog" aria-modal="true">
        ${modalHeader(wizard.draft.id ? "Edit Role" : "Create New Role")}
        ${stepper(steps, wizard.step)}
        <div class="wizard-body">
          ${wizard.step === 1 ? renderRoleStepDetails(data, wizard.draft) : ""}
          ${wizard.step === 2 ? renderRoleStepPermissionsCombined(data, wizard.draft) : ""}
          ${wizard.step === 3 ? renderRoleStepReview(data, wizard.draft) : ""}
        </div>
        <div class="modal-actions">
          ${wizard.step > 1 ? actionButton("Back", "role-back", "secondary") : ""}
          ${actionButton("Cancel", "close-modal", "secondary")}
          ${wizard.step === 3 ? actionButton("Save as Draft", "save-role-draft", "secondary") : ""}
          ${wizard.step < steps.length ? actionButton("Next", "role-next", "primary") : actionButton("Publish Role", "publish-role", "primary")}
        </div>
      </div>
    </div>
  `;
}

/** Step 2 folds tool scope, the action matrix and field obligations into one page. */
function renderRoleStepPermissionsCombined(data, draft) {
  return `
    ${renderRoleStepTools(data, draft)}
    ${draft.connectionIds.length ? renderRoleStepPermissions(data, draft) : ""}
    ${draft.connectionIds.length ? renderRoleStepRestrictions(data, draft) : ""}
  `;
}

function renderRoleStepDetails(data, draft) {
  const groups = data.groups || [];
  const reach = groups.filter((group) => draft.groupIds.includes(group.id)).flatMap((group) => groupMembers(data, group));
  const reachCount = new Set(reach.map((employee) => employee.id)).size;
  return `
    <div class="form-grid two">
      ${fieldInput("role.name", "Role name", draft.name)}
      ${fieldInput("role.code", "Role code", draft.code)}
      ${fieldInput("role.description", "Description", draft.description)}
      ${fieldSelect("role.status", "Status", ["Active", "Draft", "Disabled"], draft.status)}
    </div>
    <div class="subsection">
      <h3>Which groups get this role? ${tip("Groups are the only way a role reaches anyone. Each group already carries a rule, so whoever matches that rule on the next sync inherits this role automatically — including new joiners.")}</h3>
      <div class="check-grid compact">
        ${groups.map((group) => `
          <label class="check-card">
            <input type="checkbox" data-action="role-group" value="${group.id}" ${draft.groupIds.includes(group.id) ? "checked" : ""} />
            <span>${esc(group.name)}<small>${esc(group.rule)} · ${groupMembers(data, group).length} people</small></span>
          </label>
        `).join("") || `<p class="muted">No groups yet. Create one first.</p>`}
      </div>
      ${draft.groupIds.length ? `<p class="muted">This role will reach <strong>${reachCount}</strong> ${reachCount === 1 ? "person" : "people"} today, and anyone who matches those rules in future.</p>` : `<p class="muted">Pick at least one group, or the role reaches nobody.</p>`}
    </div>
  `;
}

function toCamel(label) {
  return label.toLowerCase().replace(/ ([a-z])/g, (_, letter) => letter.toUpperCase()).replace(/\s+/g, "");
}

function csvSummary(rows) {
  const valid = rows.filter((row) => row.valid).length;
  const invalid = rows.filter((row) => !row.valid).length;
  const duplicate = rows.filter((row) => row.duplicate).length;
  const unmatched = rows.filter((row) => row.unmatched).length;
  return `
    <div class="result-panel">
      <div class="metric-row">
        ${miniMetric("Valid rows", valid)}
        ${miniMetric("Invalid rows", invalid)}
        ${miniMetric("Duplicate rows", duplicate)}
        ${miniMetric("Unmatched employees", unmatched)}
      </div>
      <div class="table-wrap tight"><table><thead><tr><th>Employee ID</th><th>Email</th><th>Status</th><th>Error messages</th></tr></thead><tbody>${rows.slice(0, 6).map((row) => `<tr><td>${esc(row.employee_id)}</td><td>${esc(row.work_email)}</td><td>${row.valid ? badge("Valid", "active") : badge("Invalid", "warning")}</td><td>${esc(row.errors.join("; ") || "Ready to import")}</td></tr>`).join("")}</tbody></table></div>
    </div>
  `;
}

function renderRoleStepTools(data, draft) {
  return `
    <div class="connection-card-grid">
      ${categories.map((category) => {
        const connections = data.connections.filter((connection) => connection.category === category.label);
        return `
          <div class="category-block">
            <h3>${esc(category.label)}</h3>
            ${connections.map((connection) => `
              <label class="connection-card">
                <input type="checkbox" data-action="role-connection" value="${connection.id}" ${draft.connectionIds.includes(connection.id) ? "checked" : ""} />
                <div>
                  <strong>${esc(connection.connectionName)}</strong>
                  <span>${esc(connection.sourceTool)} · ${esc(connection.status)} · ${esc(connection.permissionState)}</span>
                  <small>${esc(connection.modules.join(", "))}</small>
                  <small>${connection.sourcePermissionsCanRead ? "Source ACL visible" : "Source ACL unavailable"} · ${esc(connection.sourceProvisioningCapability)}</small>
                </div>
              </label>
              ${draft.connectionIds.includes(connection.id) ? renderResourcePicker(data, draft, connection) : ""}
            `).join("") || `<div class="empty-state small">No ${esc(category.label)} connections yet.</div>`}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderResourcePicker(data, draft, connection) {
  const selected = draft.resourceIdsByConnection[connection.id] || [];
  return `
    <div class="resource-tree compact-tree">
      <label class="resource-node">
        <input type="checkbox" data-action="role-resource" data-connection-id="${connection.id}" value="__all__" ${selected.includes("__all__") ? "checked" : ""} />
        <span>All resources</span>
        <small>Warning appears before all-resource access is granted</small>
      </label>
      ${(data.resources[connection.id] || []).map((resource) => `
        <label class="resource-node" style="--depth:${resource.parentId ? 1 : 0}">
          <input type="checkbox" data-action="role-resource" data-connection-id="${connection.id}" value="${resource.id}" ${selected.includes(resource.id) ? "checked" : ""} />
          <span>${esc(resource.name)}</span>
          <small>${esc(resource.type)}</small>
        </label>
      `).join("")}
    </div>
  `;
}

function renderRoleStepPermissions(data, draft) {
  if (!draft.connectionIds.length) return `<div class="empty-state">Select one or more connections before configuring permissions.</div>`;
  return draft.connectionIds.map((connectionId) => {
    const connection = byId(data.connections, connectionId);
    const capability = getToolCapability(connection.sourceTool);
    draft.matrixByConnection[connectionId] ||= Object.fromEntries(Object.entries(capability.resourceTypes).map(([resourceType, actions]) => [resourceType, Object.fromEntries(actions.map((actionItem) => [actionItem.name, "unset"]))]));
    return `
      <div class="subsection">
        <h3>${esc(connection.category)} → ${esc(connection.sourceTool)} → ${esc(connection.connectionName)}</h3>
        <p class="muted">Default every action to Not Configured. Cycle a cell through Not Configured, Allow and Explicit Deny.</p>
        ${renderDraftMatrix(connection, draft.matrixByConnection[connectionId])}
      </div>
    `;
  }).join("");
}

function renderDraftMatrix(connection, matrix) {
  const resourceTypes = Object.keys(matrix);
  const actions = [...new Set(resourceTypes.flatMap((type) => Object.keys(matrix[type])))];
  return `
    <div class="matrix-wrap">
      <table class="matrix">
        <thead><tr><th>Resource Type</th>${actions.map((name) => `<th>${esc(name)}</th>`).join("")}</tr></thead>
        <tbody>
          ${resourceTypes.map((type) => `<tr><td><strong>${esc(type)}</strong></td>${actions.map((name) => {
            const supported = Object.prototype.hasOwnProperty.call(matrix[type], name);
            const value = matrix[type][name] || "unset";
            return `<td><button class="state-cell ${value}" data-action="cycle-draft-permission" data-connection-id="${connection.id}" data-resource-type="${esc(type)}" data-permission="${esc(name)}" ${supported ? "" : "disabled title='This action is not supported by the connected source tool.'"}>${value === "allow" ? "Allow" : value === "deny" ? "Deny" : "Unset"}</button></td>`;
          }).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRoleStepRestrictions(data, draft) {
  const selectedCategories = [...new Set(draft.connectionIds.map((idValue) => byId(data.connections, idValue)?.category).filter(Boolean))];
  const fields = [...new Set(selectedCategories.flatMap((category) => fieldRestrictionCatalogue[category] || []))];
  const modes = ["Visible", "Masked", "Hidden", "Aggregate Only"];
  return `
    <div class="subsection">
      <h3>Field Obligations ${tip("Obligations ride along with every Allow this role produces. Visible releases the value, Masked redacts it, Hidden never loads it, and Aggregate Only permits totals but no row-level detail. Anything left at Hidden stays withheld from answers and exports.")}</h3>
      <p class="muted">Only the sensitive fields belonging to the tools you selected are listed. Everything else is returned as-is.</p>
      ${fields.length ? `
        <div class="chip-list two-col">
          ${fields.map((field) => `
            <label>
              <span>${esc(field)}</span>
              <select data-action="draft-field-restriction" data-field="${esc(field)}">
                ${modes.map((mode) => `<option value="${esc(mode)}" ${draft.fieldRestrictions[field] === mode ? "selected" : ""}>${esc(mode)}</option>`).join("")}
              </select>
            </label>
          `).join("")}
        </div>
      ` : `<div class="empty-state small">Select a connection on the Tools and Scope step to see its field-level options.</div>`}
    </div>
  `;
}

function renderRoleStepReview(data, draft) {
  const selectedConnections = draft.connectionIds.map((connectionId) => byId(data.connections, connectionId)).filter(Boolean);
  const allActions = selectedConnections.flatMap((connection) => Object.values(draft.matrixByConnection[connection.id] || {}).flatMap((matrix) => Object.entries(matrix).filter(([, effect]) => effect === "allow").map(([name]) => name)));
  const denies = selectedConnections.flatMap((connection) => Object.values(draft.matrixByConnection[connection.id] || {}).flatMap((matrix) => Object.entries(matrix).filter(([, effect]) => effect === "deny").map(([name]) => name)));
  const chosenGroups = (data.groups || []).filter((group) => draft.groupIds.includes(group.id));
  const reach = new Set(chosenGroups.flatMap((group) => groupMembers(data, group)).map((employee) => employee.id));
  return `
    <div class="review-grid">
      ${definition("Role", `${draft.name || "Untitled"} (${draft.code || "no code"})`)}
      ${definition("Groups", chosenGroups.map((group) => group.name).join(", ") || "None — this role reaches nobody")}
      ${definition("People reached today", reach.size)}
      ${definition("Tools", [...new Set(selectedConnections.map((connection) => connection.sourceTool))].join(", ") || "None")}
      ${definition("Resources in scope", Object.values(draft.resourceIdsByConnection).flat().length)}
      ${definition("Allowed actions", allActions.length)}
      ${definition("Explicit denies", denies.length)}
      ${definition("Field obligations", Object.keys(draft.fieldRestrictions).length)}
    </div>
    <div class="info-banner">
      <span>Everything above is still capped by what each tool already grants these people. The role can narrow that, never widen it.</span>
    </div>
  `;
}

function ensureAgentWizard() {
  if (!stateful.agentWizard) {
    stateful.agentWizard = {
      step: 1,
      draft: {
        name: "",
        agentId: "",
        description: "",
        purpose: "",
        businessOwner: "",
        technicalOwner: "",
        status: "Active",
        expiry: "2026-12-31",
        type: "Delegated Agent",
        allowedConnectionIds: [],
        allowedActions: [],
        riskLevel: "Medium",
        approvalPolicy: "Approval for high-risk actions",
        restrictions: { dataClassification: "Internal", maxRecords: 100, transactionAmount: "", memoryRetention: "No retention", externalNetwork: "Blocked" }
      }
    };
  }
  return stateful.agentWizard;
}

function renderAgentWizard(data) {
  const wizard = ensureAgentWizard();
  const draft = wizard.draft;
  const steps = ["Agent Details", "Operating Mode", "Tools and Resources", "Allowed Actions", "Data Restrictions", "Approval Rules", "Review and Publish"];
  return `
    <div class="modal-backdrop">
      <div class="modal xl">
        ${modalHeader("Create Agent Profile")}
        ${stepper(steps, wizard.step)}
        <div class="wizard-body">
          ${wizard.step === 1 ? `<div class="form-grid two">${fieldInput("agent.name", "Agent name", draft.name)}${fieldInput("agent.agentId", "Agent ID", draft.agentId)}${fieldInput("agent.description", "Description", draft.description)}${fieldInput("agent.purpose", "Purpose", draft.purpose)}${fieldInput("agent.businessOwner", "Business owner", draft.businessOwner)}${fieldInput("agent.technicalOwner", "Technical owner", draft.technicalOwner)}${fieldSelect("agent.status", "Status", ["Active", "Disabled", "Draft", "Expired"], draft.status)}${fieldInput("agent.expiry", "Expiry or recertification date", draft.expiry, "date")}</div>` : ""}
          ${wizard.step === 2 ? `<div class="option-grid">${["Delegated Agent", "Autonomous Agent"].map((mode) => optionCard(mode, mode === "Delegated Agent" ? "Requesting User Permissions ∩ Agent Permissions ∩ Current Task Scope ∩ Runtime Conditions" : "Own service identity, pre-approved resource and action scope, no human impersonation.", draft.type === mode, "agent-type", mode)).join("")}</div>` : ""}
          ${wizard.step === 3 ? `<div class="connection-card-grid">${data.connections.map((connection) => `<label class="connection-card"><input type="checkbox" data-action="agent-connection" value="${connection.id}" ${draft.allowedConnectionIds.includes(connection.id) ? "checked" : ""}/><div><strong>${esc(connection.connectionName)}</strong><span>${esc(connection.category)} · ${esc(connection.sourceTool)}</span><small>${esc(connection.availableResourceTypes.join(", "))}</small></div></label>`).join("")}</div>` : ""}
          ${wizard.step === 4 ? `<div class="risk-grid">${Object.entries(agentRiskActions).map(([risk, actions]) => `<div class="subsection"><h3>${esc(risk)}</h3>${actions.map((item) => `<label class="check-line"><input type="checkbox" data-action="agent-action" value="${esc(item)}" ${draft.allowedActions.includes(item) ? "checked" : ""}/> ${esc(item)}</label>`).join("")}</div>`).join("")}</div>` : ""}
          ${wizard.step === 5 ? `<div class="form-grid two">${fieldSelect("agent.restrictions.dataClassification", "Data-classification ceiling", ["Public", "Internal", "Confidential", "Restricted"], draft.restrictions.dataClassification)}${fieldInput("agent.restrictions.maxRecords", "Maximum records", draft.restrictions.maxRecords, "number")}${fieldInput("agent.restrictions.transactionAmount", "Maximum transaction amount", draft.restrictions.transactionAmount)}${fieldSelect("agent.restrictions.memoryRetention", "Memory retention policy", ["No retention", "7 days", "30 days"], draft.restrictions.memoryRetention)}${fieldSelect("agent.restrictions.externalNetwork", "External network/egress restriction", ["Blocked", "Approved domains only", "Allowed with approval"], draft.restrictions.externalNetwork)}</div>` : ""}
          ${wizard.step === 6 ? `<div class="form-grid two">${fieldSelect("agent.approvalPolicy", "Approval policy", ["No approval", "Approval for medium-risk actions", "Approval for high-risk actions", "Dual approval for critical actions", "Require reason", "Require dry run and change preview"], draft.approvalPolicy)}${fieldSelect("agent.approverRole", "Approver role", data.roles.map((role) => [role.id, role.name]), draft.approverRole || "role_finance_manager")}<label class="check-line"><input type="checkbox" data-bind="agent.requireReason" ${draft.requireReason ? "checked" : ""}/> Require reason</label><label class="check-line"><input type="checkbox" data-bind="agent.requireDryRun" ${draft.requireDryRun ? "checked" : ""}/> Require dry run</label><label class="check-line"><input type="checkbox" data-bind="agent.requireChangePreview" ${draft.requireChangePreview ? "checked" : ""}/> Require change preview</label></div>` : ""}
          ${wizard.step === 7 ? `<div class="review-grid">${definition("Agent", `${draft.name || "Untitled"} (${draft.agentId || "Generated"})`)}${definition("Operating mode", draft.type)}${definition("Selected connections", draft.allowedConnectionIds.length)}${definition("Allowed actions", draft.allowedActions.join(", ") || "None")}${definition("Data restrictions", Object.entries(draft.restrictions).map(([key, value]) => `${key}: ${value}`).join(", "))}${definition("Approval rules", draft.approvalPolicy)}${definition("Status", draft.status)}</div>` : ""}
        </div>
        <div class="modal-actions">
          ${wizard.step > 1 ? actionButton("Back", "agent-back", "secondary") : ""}
          ${actionButton("Cancel", "close-modal", "secondary")}
          ${wizard.step < steps.length ? actionButton("Next", "agent-next", "primary") : actionButton("Publish Agent", "publish-agent", "primary")}
        </div>
      </div>
    </div>
  `;
}

function bindValue(path, value) {
  const [scope, ...rest] = path.split(".");
  const key = rest.join(".");
  const write = (target, keyPath, nextValue) => {
    const parts = keyPath.split(".");
    let cursor = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      if (!cursor[part]) cursor[part] = /^\d+$/.test(parts[index + 1]) ? [] : {};
      cursor = cursor[part];
    }
    cursor[parts.at(-1)] = nextValue;
  };
  if (scope === "connection") write(ensureConnectionWizard(store.getState()).draft, key, value);
  if (scope === "role") write(ensureRoleWizard(store.getState()).draft, key, value);
  if (scope === "group") write(ensureGroupModal(), key, value);
  if (scope === "agent") write(ensureAgentWizard().draft, key, value);
  if (scope === "simulator") write(stateful.simulator, key, value);
  if (scope === "lifecycle") write(stateful.lifecycle, key, value);
  if (scope === "context") write(stateful.context, key, value);
  if (scope === "filter") write(stateful.filters, key, value);
  if (scope === "addRole") stateful.selectedRoleForEmployee = value;
}

function nextEffect(value) {
  if (value === "unset") return "allow";
  if (value === "allow") return "deny";
  return "unset";
}

document.addEventListener("click", (event) => {
  const routeButton = event.target.closest("[data-route]");
  const actionButtonEl = event.target.closest("[data-action]");
  if (routeButton && !actionButtonEl) {
    if (event.target.closest("[data-stop-row]")) event.stopPropagation();
    const path = routeButton.dataset.route;
    const tab = routeButton.dataset.queryTab;
    go(path, tab ? { tab } : {});
    return;
  }
  if (!actionButtonEl) return;
  // A <select> is driven by its change event. preventDefault here stops the native
  // option list from ever opening, and re-rendering on click replaces the element.
  if (event.target.closest("select")) return;
  event.preventDefault();
  event.stopPropagation();
  handleAction(actionButtonEl);
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches("[data-bind]")) {
    bindValue(target.dataset.bind, target.type === "checkbox" ? target.checked : target.value);
    if (target.dataset.bind.startsWith("filter.")) render();
  }
  if (target.matches("[data-filter]")) {
    bindValue(`filter.${target.dataset.filter}`, target.value);
    render();
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("[data-change-action='change-category']")) {
    const wizard = ensureConnectionWizard(store.getState());
    const hasSelections = Boolean(wizard.draft.sourceTool || wizard.draft.modules.length || wizard.draft.dataScope !== "Selected resources only");
    if (hasSelections && target.value !== wizard.draft.category) {
      stateful.pendingCategory = target.value;
      openConfirm("Change category?", "Changing the category will reset the selected source tool, modules, data models and scope.", "apply-category-change");
      target.value = wizard.draft.category;
      return;
    }
  }
  if (target.matches("[data-bind]")) {
    bindValue(target.dataset.bind, target.type === "checkbox" ? target.checked : target.value);
    // Free-text composer fields must not re-render on blur, or the Ask click is lost with the DOM.
    if (target.dataset.bind === "context.draft" || target.dataset.bind === "context.reason") return;
  }
  if (target.matches("[data-filter]")) bindValue(`filter.${target.dataset.filter}`, target.value);
  if (target.matches("select[data-action]")) {
    handleAction(target);
    return;
  }
  render();
});

function handleAction(el) {
  const action = el.dataset.action;
  const data = store.getState();
  if (action === "close-modal") return closeModal();
  if (action === "close-confirm") {
    stateful.confirm = null;
    return render();
  }
  if (action === "confirm-action") return runConfirmAction();
  if (action === "reset-demo") return openConfirm("Reset demo data?", "This clears localStorage and restores the seeded HyperSync prototype state.", "reset-demo");
  if (action === "open-connection-wizard") {
    stateful.connectionWizard = null;
    stateful.modal = "connection";
    return render();
  }
  if (action === "connection-transfer") {
    ensureConnectionWizard(data).draft.transferMethod = el.dataset.value;
    return render();
  }
  if (action === "connection-tool") {
    ensureConnectionWizard(data).draft.sourceTool = el.dataset.value;
    return render();
  }
  if (action === "connection-module") return toggleArray(ensureConnectionWizard(data).draft.modules, el.value, el.checked);
  if (action === "connection-back") {
    ensureConnectionWizard(data).step -= 1;
    return render();
  }
  if (action === "connection-next") return nextConnectionStep(data);
  if (action === "create-connection") return createConnection(data);
  if (action === "open-role-wizard") {
    stateful.roleWizard = null;
    stateful.modal = "role";
    return render();
  }
  if (action === "edit-role") {
    const role = byId(data.roles, el.dataset.id);
    stateful.roleWizard = { step: 1, draft: roleDraftFromRole(data, role) };
    stateful.modal = "role";
    return render();
  }
  if (action === "duplicate-role") {
    store.update((draft) => duplicateRole(draft, el.dataset.id));
    showToast("Role duplicated as draft");
    return;
  }
  if (action === "confirm-toggle-role") {
    const role = byId(data.roles, el.dataset.id);
    return openConfirm(`${role.status === "Disabled" ? "Enable" : "Disable"} role?`, `${role.name} will ${role.status === "Disabled" ? "become active" : "stop granting access"} after confirmation.`, "toggle-role", { id: role.id });
  }
  if (action === "confirm-delete-role") {
    const role = byId(data.roles, el.dataset.id);
    return openConfirm("Delete role?", `${role.name} will be removed. System-defined roles cannot be deleted.`, "delete-role", { id: role.id });
  }
  if (action === "role-back") {
    ensureRoleWizard(data).step -= 1;
    return render();
  }
  if (action === "role-next") return nextRoleStep(data);
  if (action === "role-group") return toggleArray(ensureRoleWizard(data).draft.groupIds, el.value, el.checked, true);
  if (action === "open-group-modal") {
    stateful.groupModal = null;
    stateful.modal = "group";
    return render();
  }
  if (action === "edit-group") {
    const group = (data.groups || []).find((item) => item.id === el.dataset.id);
    stateful.groupModal = { ...group };
    stateful.modal = "group";
    return render();
  }
  if (action === "group-rule-field") {
    const draft = ensureGroupModal();
    const firstValue = {
      Designation: data.employees[0]?.designation,
      Department: data.employees[0]?.department,
      "Employment Type": data.employees[0]?.employmentType,
      "Employment Status": data.employees[0]?.employmentStatus,
      Grade: data.employees[0]?.grade,
      Location: data.employees[0]?.location
    }[el.value];
    draft.rule = `${el.value} = ${firstValue}`;
    return render();
  }
  if (action === "group-rule-value") {
    const draft = ensureGroupModal();
    draft.rule = `${draft.rule.split("=")[0].trim()} = ${el.value}`;
    return render();
  }
  if (action === "save-group") return saveGroup(data);
  if (action === "delete-group") return openConfirm("Delete group?", "Roles attached to this group would reach nobody. Detach them first.", "delete-group", { id: el.dataset.id });
  if (action === "role-connection") return toggleRoleConnection(data, el.value, el.checked);
  if (action === "role-resource") return toggleRoleResource(el.dataset.connectionId, el.value, el.checked);
  if (action === "cycle-draft-permission") return cycleDraftPermission(el.dataset.connectionId, el.dataset.resourceType, el.dataset.permission);
  if (action === "draft-field-restriction") {
    ensureRoleWizard(data).draft.fieldRestrictions[el.dataset.field] = el.value;
    return render();
  }
  if (action === "save-role-draft" || action === "publish-role") return saveRole(data, action === "save-role-draft" ? "Draft" : "Active");
  if (action === "cycle-permission") return cyclePersistedPermission(el.dataset.roleId, el.dataset.grantId, el.dataset.resourceType, el.dataset.permission);
  if (action === "toggle-resource-scope") return togglePersistedResource(el.dataset.roleId, el.dataset.grantId, el.value, el.checked);
  if (action === "select-all-resources") return openConfirm("Grant all resources?", "Select all resources only when the role should cover every current and future resource in this connection.", "select-all-resources", { roleId: el.dataset.roleId, grantId: el.dataset.grantId });
  if (action === "field-restriction") return updateGrantFieldRestriction(el.dataset.roleId, el.dataset.grantId, el.dataset.field, el.value);
  if (action === "source-status") return updateGrantStatus(el.dataset.roleId, el.dataset.grantId, el.value);
  if (action === "toggle-source-provision") return toggleSourceProvision(el.dataset.roleId, el.dataset.grantId, el.checked);
  if (action === "run-lifecycle-simulation") {
    stateful.lifecycle.result = simulateLifecycleEvent(data, stateful.lifecycle);
    return render();
  }
  if (action === "apply-lifecycle-simulation") return applyLifecycleSimulation();
  if (action === "open-agent-wizard") {
    stateful.agentWizard = null;
    stateful.modal = "agent";
    return render();
  }
  if (action === "agent-back") {
    ensureAgentWizard().step -= 1;
    return render();
  }
  if (action === "agent-next") {
    const wizard = ensureAgentWizard();
    if (wizard.step === 1 && !wizard.draft.name) return showToast("Agent name is required", "error");
    wizard.step += 1;
    return render();
  }
  if (action === "agent-type") {
    ensureAgentWizard().draft.type = el.dataset.value;
    return render();
  }
  if (action === "agent-connection") return toggleArray(ensureAgentWizard().draft.allowedConnectionIds, el.value, el.checked);
  if (action === "agent-action") return toggleArray(ensureAgentWizard().draft.allowedActions, el.value, el.checked);
  if (action === "publish-agent") return publishAgent(data);
  if (action === "duplicate-agent") return duplicateAgent(el.dataset.id);
  if (action === "confirm-toggle-agent") {
    const agent = byId(data.agents, el.dataset.id);
    return openConfirm(agent?.status === "Disabled" ? "Enable agent?" : "Disable agent?", `${agent?.name || "This agent"} will ${agent?.status === "Disabled" ? "be reactivated" : "stop receiving access immediately"}.`, "toggle-agent", { id: el.dataset.id });
  }
  if (action === "delete-agent") return openConfirm("Delete agent?", "This removes the agent profile from the prototype state.", "delete-agent", { id: el.dataset.id });
  if (action === "open-access-simulator") {
    if (el.dataset.agentId) {
      stateful.simulator.principalType = "Agent";
      stateful.simulator.agentId = el.dataset.agentId;
    }
    stateful.modal = "access-simulator";
    return render();
  }
  if (action === "run-access-simulator") return runAccessSimulator(data);
  if (action === "context-ask") return askContextQuestion(data);
  if (action === "context-example") {
    stateful.context.draft = el.dataset.prompt;
    return askContextQuestion(store.getState());
  }
  if (action === "context-explain") {
    const index = Number(el.dataset.index);
    stateful.context.openExplain = stateful.context.openExplain === index ? null : index;
    return render();
  }
  if (action === "context-clear") {
    stateful.context.thread = [];
    stateful.context.openExplain = null;
    return render();
  }
  if (action === "confirm-toggle-permissions-layer") {
    const enabled = data.app.permissionsLayerEnabled !== false;
    return openConfirm(
      enabled ? "Turn the permissions layer off?" : "Turn the permissions layer on?",
      enabled
        ? "The Decision Service becomes default-closed. Context Layer answers and agent actions will be denied until it is switched back on. Roles and grants are kept."
        : "The Decision Service resumes evaluating every request against roles, grants, denies and conditions.",
      "toggle-permissions-layer"
    );
  }
}

function askContextQuestion(data) {
  const context = stateful.context;
  const question = context.draft.trim();
  if (!question) return showToast("Type a question first", "error");
  const result = answerQuestion(data, {
    employeeId: context.employeeId,
    question,
    managedDevice: context.managedDevice,
    reason: context.reason
  });
  context.thread.push({ question, result });
  context.openExplain = null;
  context.draft = "";
  store.update((draft) => {
    addAuditEvent(draft, {
      eventType: "Context Query Evaluated",
      principalType: "Employee",
      principal: result.askedBy,
      source: "Context Layer",
      summary: `"${question}" — ${result.sources.length} source(s) allowed, ${result.excluded.length} excluded`
    });
  });
  window.requestAnimationFrame(() => {
    const thread = document.querySelector("#chat-thread");
    if (thread) thread.scrollTop = thread.scrollHeight;
  });
}

function runConfirmAction() {
  const confirm = stateful.confirm;
  stateful.confirm = null;
  if (confirm.confirmAction === "reset-demo") {
    store.reset();
    showToast("Demo data reset");
    return render();
  }
  if (confirm.confirmAction === "apply-category-change") {
    const wizard = ensureConnectionWizard(store.getState());
    wizard.draft.category = stateful.pendingCategory;
    wizard.draft.sourceTool = "";
    wizard.draft.modules = [];
    wizard.draft.dataScope = "Selected resources only";
    wizard.draft.transferMethod = getCategory(stateful.pendingCategory).integrationLabel;
    stateful.pendingCategory = "";
    return render();
  }
  if (confirm.confirmAction === "role-next-after-all-resource") {
    ensureRoleWizard(store.getState()).step += 1;
    return render();
  }
  if (confirm.confirmAction === "toggle-role") {
    store.update((draft) => toggleRoleStatus(draft, confirm.payload.id));
    showToast("Role status updated");
  }
  if (confirm.confirmAction === "delete-role") {
    store.update((draft) => deleteRole(draft, confirm.payload.id));
    showToast("Role deleted");
  }
  if (confirm.confirmAction === "select-all-resources") {
    store.update((draft) => {
      const role = byId(draft.roles, confirm.payload.roleId);
      const grant = role?.permissions.find((permission) => permission.id === confirm.payload.grantId);
      if (grant) {
        grant.resourceScope.mode = "all";
        grant.resourceScope.resourceIds = [];
        addAuditEvent(draft, { eventType: "Resource Scope Updated", principal: role.name, category: grant.category, tool: grant.tool, connection: byId(draft.connections, grant.connectionId)?.connectionName, summary: "All resources selected after confirmation" });
      }
    });
    showToast("All resources selected");
  }
  if (confirm.confirmAction === "toggle-agent") {
    store.update((draft) => toggleAgentStatus(draft, confirm.payload.id));
    showToast("Agent status updated");
  }
  if (confirm.confirmAction === "toggle-permissions-layer") {
    let enabled = true;
    store.update((draft) => {
      enabled = togglePermissionsLayer(draft);
    });
    showToast(enabled ? "Permissions layer enabled" : "Permissions layer disabled — all requests now deny", enabled ? "success" : "error");
  }
  if (confirm.confirmAction === "delete-group") {
    store.update((draft) => {
      const group = (draft.groups || []).find((item) => item.id === confirm.payload.id);
      draft.groups = (draft.groups || []).filter((item) => item.id !== confirm.payload.id);
      addAuditEvent(draft, { eventType: "Role Disabled", principalType: "Group", principal: group?.name, summary: "Group deleted" });
    });
    showToast("Group deleted");
  }
  if (confirm.confirmAction === "delete-agent") {
    store.update((draft) => {
      const agent = byId(draft.agents, confirm.payload.id);
      draft.agents = draft.agents.filter((item) => item.id !== confirm.payload.id);
      addAuditEvent(draft, { eventType: "Agent Disabled", principalType: "Agent", principal: agent?.name, summary: "Agent profile deleted from prototype state" });
    });
    showToast("Agent deleted");
  }
  render();
}

function saveGroup(data) {
  const draft = ensureGroupModal();
  if (!draft.name) return showToast("Group name is required", "error");
  store.update((state) => {
    state.groups = state.groups || [];
    const existing = state.groups.find((group) => group.id === draft.id);
    if (existing) Object.assign(existing, { name: draft.name, rule: draft.rule, description: draft.description });
    else state.groups.push({ id: `grp_${Date.now()}`, name: draft.name, rule: draft.rule, description: draft.description, extraMemberIds: [] });
    addAuditEvent(state, { eventType: existing ? "Role Updated" : "Role Created", principalType: "Group", principal: draft.name, summary: `Group ${existing ? "updated" : "created"} with rule ${draft.rule}` });
  });
  stateful.groupModal = null;
  stateful.modal = null;
  showToast(draft.id ? "Group updated" : "Group created");
}

function toggleArray(array, value, checked, rerender = false) {
  if (!Array.isArray(array)) return;
  if (checked && !array.includes(value)) array.push(value);
  if (!checked) array.splice(0, array.length, ...array.filter((item) => item !== value));
  if (rerender) render();
}

function nextConnectionStep(data) {
  const wizard = ensureConnectionWizard(data);
  if (wizard.step === 1 && !wizard.draft.category) return showToast("Category is required", "error");
  if (wizard.step === 2 && !wizard.draft.transferMethod) return showToast("Choose a transfer method", "error");
  if (wizard.step === 3 && !wizard.draft.sourceTool) wizard.draft.sourceTool = getCategory(wizard.draft.category).tools[0];
  wizard.step += 1;
  render();
}

function createConnection(data) {
  const wizard = ensureConnectionWizard(data);
  store.update((draft) => createConnectionFromDraft(draft, wizard.draft));
  stateful.connectionWizard = null;
  stateful.modal = null;
  showToast("Connection created with No Access by default");
  go("/permissions", { tab: "roles" });
}

function nextRoleStep(data) {
  const wizard = ensureRoleWizard(data);
  if (wizard.step === 1 && (!wizard.draft.name || !wizard.draft.code)) return showToast("Role Name and Role Code are required", "error");
  if (wizard.step === 3 && wizard.draft.connectionIds.some((connectionId) => (wizard.draft.resourceIdsByConnection[connectionId] || []).includes("__all__"))) {
    return openConfirm("Grant all resources?", "One or more selected connections include all resources. Confirm that this role should cover every current and future resource.", "role-next-after-all-resource");
  }
  wizard.step += 1;
  render();
}

function toggleRoleConnection(data, connectionId, checked) {
  const draft = ensureRoleWizard(data).draft;
  toggleArray(draft.connectionIds, connectionId, checked);
  if (checked) {
    draft.resourceIdsByConnection[connectionId] ||= [];
    const connection = byId(data.connections, connectionId);
    const capability = getToolCapability(connection.sourceTool);
    draft.matrixByConnection[connectionId] ||= Object.fromEntries(Object.entries(capability.resourceTypes).map(([resourceType, actions]) => [resourceType, Object.fromEntries(actions.map((actionItem) => [actionItem.name, "unset"]))]));
  }
  render();
}

function toggleRoleResource(connectionId, resourceId, checked) {
  const draft = ensureRoleWizard(store.getState()).draft;
  draft.resourceIdsByConnection[connectionId] ||= [];
  toggleArray(draft.resourceIdsByConnection[connectionId], resourceId, checked);
  render();
}

function cycleDraftPermission(connectionId, resourceType, permission) {
  const draft = ensureRoleWizard(store.getState()).draft;
  const current = draft.matrixByConnection[connectionId][resourceType][permission] || "unset";
  draft.matrixByConnection[connectionId][resourceType][permission] = nextEffect(current);
  render();
}

function saveRole(data, status) {
  const wizard = ensureRoleWizard(data);
  store.update((draft) => createRoleFromDraft(draft, wizard.draft, status));
  stateful.roleWizard = null;
  stateful.modal = null;
  showToast(status === "Draft" ? "Role saved as draft" : "Role published");
  go("/permissions", { tab: "roles" });
}

function cyclePersistedPermission(roleId, grantId, resourceType, permission) {
  store.update((draft) => {
    const role = byId(draft.roles, roleId);
    const grant = role?.permissions.find((item) => item.id === grantId);
    if (!grant) return;
    grant.matrix[resourceType][permission] = nextEffect(grant.matrix[resourceType][permission] || "unset");
    role.updatedAt = new Date().toISOString();
    addAuditEvent(draft, { eventType: grant.matrix[resourceType][permission] === "deny" ? "Permission Denied" : "Permission Granted", principal: role.name, category: grant.category, tool: grant.tool, connection: byId(draft.connections, grant.connectionId)?.connectionName, summary: `${permission} on ${resourceType} changed to ${grant.matrix[resourceType][permission]}` });
  });
  showToast("Permission updated");
}

function togglePersistedResource(roleId, grantId, resourceId, checked) {
  store.update((draft) => {
    const role = byId(draft.roles, roleId);
    const grant = role?.permissions.find((item) => item.id === grantId);
    if (!grant) return;
    grant.resourceScope.mode = "specific";
    toggleArray(grant.resourceScope.resourceIds, resourceId, checked);
    addAuditEvent(draft, { eventType: "Resource Scope Updated", principal: role.name, category: grant.category, tool: grant.tool, connection: byId(draft.connections, grant.connectionId)?.connectionName, summary: `${resourceId} ${checked ? "added to" : "removed from"} scope` });
  });
}

function updateGrantFieldRestriction(roleId, grantId, field, value) {
  store.update((draft) => {
    const role = byId(draft.roles, roleId);
    const grant = role?.permissions.find((item) => item.id === grantId);
    if (!grant) return;
    grant.fieldRestrictions[field] = value;
    addAuditEvent(draft, { eventType: "Permission Granted", principal: role.name, category: grant.category, tool: grant.tool, connection: byId(draft.connections, grant.connectionId)?.connectionName, summary: `${field} set to ${value}` });
  });
}

function updateGrantStatus(roleId, grantId, value) {
  store.update((draft) => {
    const role = byId(draft.roles, roleId);
    const grant = role?.permissions.find((item) => item.id === grantId);
    if (!grant) return;
    grant.sourceProvisioningStatus = value;
    addAuditEvent(draft, { eventType: value === "Provisioned in Source" ? "Source Provisioning Completed" : "Source Provisioning Started", principal: role.name, category: grant.category, tool: grant.tool, connection: byId(draft.connections, grant.connectionId)?.connectionName, summary: `Source enforcement status changed to ${value}` });
  });
}

function toggleSourceProvision(roleId, grantId, checked) {
  store.update((draft) => {
    const role = byId(draft.roles, roleId);
    const grant = role?.permissions.find((item) => item.id === grantId);
    if (!grant) return;
    grant.provisionToSource = checked;
    grant.sourceProvisioningStatus = checked ? "Pending Provisioning" : "Enforced in HyperContext";
    addAuditEvent(draft, { eventType: "Source Provisioning Started", principal: role.name, category: grant.category, tool: grant.tool, connection: byId(draft.connections, grant.connectionId)?.connectionName, summary: checked ? "Source provisioning queued" : "Source provisioning disabled" });
  });
}

function applyLifecycleSimulation() {
  const result = stateful.lifecycle.result;
  if (!result) return;
  store.update((draft) => {
    const employee = byId(draft.employees, result.employeeId);
    if (!employee) return;
    if (stateful.lifecycle.eventType === "Leaver") {
      employee.employmentStatus = "Inactive";
      employee.accessStatus = "Revoked";
      // Group rules key off employment status, so membership drops out on its own.
      addAuditEvent(draft, { eventType: "Leaver Access Revoked", principalType: "Employee", principal: employee.name, source: "HRMS", summary: "Leaver event revoked access" });
    } else if (stateful.lifecycle.eventType === "Mover") {
      employee[stateful.lifecycle.changedField] = stateful.lifecycle.newValue;
      employee.lastEvaluated = new Date().toISOString();
      addAuditEvent(draft, { eventType: "Mover Access Recalculated", principalType: "Employee", principal: employee.name, source: "HRMS", summary: "Mover event recalculated roles and permissions" });
    } else {
      employee.employmentStatus = "Active";
      employee.accessStatus = "Active";
      addAuditEvent(draft, { eventType: "Joiner Access Assigned", principalType: "Employee", principal: employee.name, source: "HRMS", summary: "Joiner event assigned matching roles" });
    }
  });
  stateful.lifecycle.result = null;
  showToast("Simulated HRMS event applied");
}

function publishAgent(data) {
  const wizard = ensureAgentWizard();
  const selectedConnections = wizard.draft.allowedConnectionIds.map((connectionId) => byId(data.connections, connectionId)).filter(Boolean);
  wizard.draft.allowedTools = [...new Set(selectedConnections.map((connection) => connection.sourceTool))];
  store.update((draft) => createAgentProfile(draft, wizard.draft, wizard.draft.status || "Active"));
  stateful.agentWizard = null;
  stateful.modal = null;
  showToast("Agent profile published");
  go("/permissions", { tab: "agent-access" });
}

function duplicateAgent(agentId) {
  store.update((draft) => {
    const agent = byId(draft.agents, agentId);
    if (!agent) return;
    draft.agents.unshift({ ...structuredClone(agent), id: `agent_${Date.now()}`, name: `${agent.name} Copy`, agentId: `${agent.agentId}-COPY`, status: "Draft" });
    addAuditEvent(draft, { eventType: "Agent Created", principalType: "Agent", principal: `${agent.name} Copy`, summary: `Duplicated from ${agent.name}` });
  });
  showToast("Agent duplicated");
}

function runAccessSimulator(data) {
  const sim = stateful.simulator;
  const connection = byId(data.connections, sim.connectionId);
  const resource = (data.resources[sim.connectionId] || []).find((item) => item.id === sim.resourceId);
  if (sim.principalType === "Agent") {
    sim.result = evaluateAgentAccess(data, { ...sim, category: connection?.category, tool: connection?.sourceTool, resourceName: resource?.name });
  } else {
    sim.result = evaluateUserAccess(data, { ...sim, category: connection?.category, tool: connection?.sourceTool, runtimeContext: { managedDevice: sim.managedDevice, reason: sim.reason } });
  }
  render();
}

window.addEventListener("hashchange", render);
store.subscribe(render);

if (!window.location.hash) window.location.hash = "#/permissions";
render();
