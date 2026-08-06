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
  addEmployeesToRole,
  connectIamProvider,
  createAgentProfile,
  createConnectionFromDraft,
  createRoleFromDraft,
  deleteRole,
  duplicateRole,
  store,
  syncIamProvider,
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
    roles: { q: "", source: "", status: "", category: "", tool: "" },
    employees: { q: "", department: "", designation: "", role: "", status: "", source: "" }
  },
  modal: null,
  confirm: null,
  pendingCategory: "",
  connectionWizard: null,
  roleWizard: null,
  iamWizard: null,
  importModal: null,
  agentWizard: null,
  ruleModal: null,
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
  ["dashboard", "Dashboard", "layout-dashboard"],
  ["context", "Context Layer", "sparkle"],
  ["permissions", "Permissions", "shield"]
];

const pageTitles = {
  dashboard: ["Dashboard", "Enable the permissions layer, manage connected tools and review recent access activity."],
  context: ["Context Layer", "Ask a question across every connected tool. Answers are built only from records the asker is already allowed to read."],
  permissions: ["Permissions & Access", "Control which employees and AI agents can access connected tools, resources, data and actions."]
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
  if (section === "permissions" && subSection === "employees" && idValue) return renderEmployeeDetails(data, idValue, current.params.get("tab") || stateful.activeTabs.employeeDetails);
  if (section === "permissions" && subSection === "agents" && idValue) return renderAgentDetails(data, idValue, current.params.get("tab") || stateful.activeTabs.agentDetails);
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
  const coveredEmployees = data.employees.filter((employee) => employee.roleIds.length);
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
  return `
    <div class="source-card">
      <div class="source-card-head">
        <strong>${esc(source.title)}</strong>
        <span class="badge allow">Allowed</span>
      </div>
      <span class="source-origin">${esc(source.tool)} · ${esc(source.connectionName)} · ${esc(source.action)}</span>
      <dl class="source-fields">
        ${source.fields.map((item) => `
          <div class="${item.masked ? "masked" : ""}">
            <dt>${esc(item.label)}</dt>
            <dd>${esc(item.value)}${item.masked ? ` ${tip("This field is released in masked form by your role's field obligations. The raw value was never loaded into the answer.", "end")}` : ""}</dd>
          </div>
        `).join("")}
      </dl>
      ${source.hiddenFields.length ? `<span class="source-withheld">${icon("lock")} Withheld: ${esc(source.hiddenFields.join(", "))}</span>` : ""}
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
          <button class="btn secondary" data-route="/permissions/employees/${employee.id}" data-query-tab="effective">View effective access</button>
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
  const coveredEmployees = new Set(activeRoles.flatMap((role) => role.assignedEmployeeIds)).size;
  const governedTools = new Set(data.connections.filter((connection) => connection.status === "Active").map((connection) => connection.sourceTool)).size;
  const activeRules = data.assignmentRules.filter((rule) => rule.status === "Active").length;
  const tabs = ["roles", "employees", "assignment-rules", "agent-access"];
  return `
    <div class="quick-actions-grid">
      <div class="quick-action-card" data-action="open-role-wizard">
        <span class="qa-icon blue">${icon("plus")}</span>
        <strong>Create a role</strong>
        <span>Launch the role wizard to define a new permission grant.</span>
      </div>
      <div class="quick-action-card" data-action="open-access-simulator">
        <span class="qa-icon green">${icon("search")}</span>
        <strong>Test access</strong>
        <span>Run the Access Simulator for an employee or agent.</span>
      </div>
      <div class="quick-action-card" data-route="/permissions" data-query-tab="assignment-rules">
        <span class="qa-icon amber">${icon("refresh")}</span>
        <strong>Assignment rules</strong>
        <span>Review HRMS-driven joiner/mover/leaver automation.</span>
      </div>
      <div class="quick-action-card" data-route="/permissions" data-query-tab="agent-access">
        <span class="qa-icon red">${icon("bolt")}</span>
        <strong>Agent access</strong>
        <span>Govern AI agent identities, scopes and approvals.</span>
      </div>
    </div>
    <div class="page-actions">
      ${actionButton(`${icon("key")} Connect IAM`, "open-iam-wizard", "secondary")}
      ${actionButton(`${icon("upload")} Import Role Mapping`, "open-import-modal", "secondary")}
      ${actionButton(`${icon("plus")} Create New Role`, "open-role-wizard", "primary")}
    </div>
    <div class="summary-grid four">
      ${summaryCard("Total Roles", data.roles.length, "Active, draft, disabled and system-defined")}
      ${summaryCard("Employees Covered", coveredEmployees, "Unique employees with at least one active role")}
      ${summaryCard("Connected Tools Governed", governedTools, "Tools available for permission policies")}
      ${summaryCard("Active Assignment Rules", activeRules, "IAM, HRMS and import-driven rules")}
    </div>
    <div class="info-banner">
      <span>Effective access is determined by source-system permissions, HyperContext role policies, explicit restrictions and runtime conditions.</span>
    </div>
    <div class="tabs">
      ${tabs.map((tab) => `<button class="tab ${activeTab === tab ? "active" : ""}" data-route="/permissions" data-query-tab="${tab}">${tabLabel(tab)}</button>`).join("")}
    </div>
    ${activeTab === "roles" ? renderRolesTab(data) : ""}
    ${activeTab === "employees" ? renderEmployeesTab(data) : ""}
    ${activeTab === "assignment-rules" ? renderAssignmentRulesTab(data) : ""}
    ${activeTab === "agent-access" ? renderAgentAccessTab(data) : ""}
  `;
}

function tabLabel(tab) {
  return { roles: "Roles", employees: "Employees", "assignment-rules": "Assignment Rules", "agent-access": "Agent Access" }[tab] || tab;
}

function renderRolesTab(data) {
  const filters = stateful.filters.roles;
  const filtered = data.roles
    .filter((role) => !filters.q || `${role.name} ${role.code}`.toLowerCase().includes(filters.q.toLowerCase()))
    .filter((role) => !filters.source || role.source === filters.source)
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
        ${selectInput("roles.source", "Role source", ["", "IAM Group", "HRMS Rule", "CSV Import", "Manually Created", "System Defined"], filters.source)}
        ${selectInput("roles.status", "Status", ["", "Active", "Draft", "Disabled"], filters.status)}
        ${selectInput("roles.category", "Category", ["", ...categories.map((category) => category.label)], filters.category)}
        ${selectInput("roles.tool", "Connected tool", ["", ...new Set(data.connections.map((connection) => connection.sourceTool))], filters.tool)}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Role Name</th>
              <th>Role Source</th>
              <th>Assigned Employees</th>
              <th>Connected Tools</th>
              <th>Assignment Method</th>
              <th>Status</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((role) => `
              <tr class="clickable-row" data-route="/permissions/roles/${role.id}">
                <td><strong>${esc(role.name)}</strong><small>${esc(role.code)}</small></td>
                <td>${badge(role.source, "neutral")}</td>
                <td>${role.assignedEmployeeIds.length}</td>
                <td>${esc([...new Set(role.permissions.map((permission) => permission.tool))].join(", ") || "No tools")}</td>
                <td>${esc(role.assignmentMethod)}</td>
                <td>${badge(role.status, role.status === "Active" ? "active" : role.status === "Draft" ? "draft" : "disabled")}</td>
                <td>${formatDate(role.updatedAt)}</td>
                <td>
                  <div class="row-actions" data-stop-row>
                    <button title="View role" data-route="/permissions/roles/${role.id}">${icon("eye")}</button>
                    <button title="Edit role" data-action="edit-role" data-id="${role.id}">${icon("edit")}</button>
                    <button title="Duplicate role" data-action="duplicate-role" data-id="${role.id}">${icon("copy")}</button>
                    <button title="${role.status === "Disabled" ? "Enable" : "Disable"} role" data-action="confirm-toggle-role" data-id="${role.id}">${icon("bolt")}</button>
                    <button title="Delete role" data-action="confirm-delete-role" data-id="${role.id}" ${role.source === "System Defined" ? "disabled aria-label='System-defined roles cannot be deleted'" : ""}>${icon("trash")}</button>
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

function renderEmployeesTab(data) {
  const filters = stateful.filters.employees;
  const roleOptions = data.roles.map((role) => role.name);
  const filtered = data.employees
    .filter((employee) => !filters.q || `${employee.name} ${employee.employeeId} ${employee.workEmail}`.toLowerCase().includes(filters.q.toLowerCase()))
    .filter((employee) => !filters.department || employee.department === filters.department)
    .filter((employee) => !filters.designation || employee.designation === filters.designation)
    .filter((employee) => !filters.status || employee.accessStatus === filters.status)
    .filter((employee) => !filters.source || employee.assignmentSource === filters.source)
    .filter((employee) => !filters.role || rolesForEmployee(data, employee.id).some((role) => role.name === filters.role));
  return `
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Employees</h2>
          <p>Employee ID and work email are used for identity matching. Names are display-only.</p>
        </div>
      </div>
      <div class="filters">
        ${searchInput("employees.q", "Employee search", filters.q)}
        ${selectInput("employees.department", "Department", ["", ...new Set(data.employees.map((employee) => employee.department))], filters.department)}
        ${selectInput("employees.designation", "Designation", ["", ...new Set(data.employees.map((employee) => employee.designation))], filters.designation)}
        ${selectInput("employees.role", "Role", ["", ...roleOptions], filters.role)}
        ${selectInput("employees.status", "Status", ["", "Active", "Pending Evaluation", "Partially Configured", "Revoked"], filters.status)}
        ${selectInput("employees.source", "Assignment source", ["", "HRMS Rule", "IAM Group", "Manual", "CSV Import"], filters.source)}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Employee ID</th>
              <th>Work Email</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Grade</th>
              <th>Location</th>
              <th>Assigned Roles</th>
              <th>Assignment Source</th>
              <th>Access Status</th>
              <th>Last Evaluated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((employee) => `
              <tr class="clickable-row" data-route="/permissions/employees/${employee.id}">
                <td><strong>${esc(employee.name)}</strong></td>
                <td>${esc(employee.employeeId)}</td>
                <td>${esc(employee.workEmail)}</td>
                <td>${esc(employee.department)}</td>
                <td>${esc(employee.designation)}</td>
                <td>${esc(employee.grade)}</td>
                <td>${esc(employee.location)}</td>
                <td>${rolesForEmployee(data, employee.id).map((role) => role.name).join(", ") || "None"}</td>
                <td>${esc(employee.assignmentSource)}</td>
                <td>${badge(employee.accessStatus, employee.accessStatus === "Active" ? "active" : "disabled")}</td>
                <td>${formatDate(employee.lastEvaluated)}</td>
                <td><button class="link-btn" data-route="/permissions/employees/${employee.id}" data-stop-row>View Employee</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAssignmentRulesTab(data) {
  return `
    <div class="grid-two">
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Assignment Rules</h2>
            <p>HRMS lifecycle events recalculate access and remove obsolete permissions.</p>
          </div>
          ${actionButton(`${icon("plus")} Create Rule`, "open-rule-modal", "primary")}
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rule Name</th>
                <th>Role</th>
                <th>Source</th>
                <th>Conditions</th>
                <th>Matching Employees</th>
                <th>Lifecycle Events</th>
                <th>Status</th>
                <th>Last Evaluated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.assignmentRules.map((rule) => `
                <tr>
                  <td><strong>${esc(rule.name)}</strong></td>
                  <td>${esc(byId(data.roles, rule.roleId)?.name || "Unknown role")}</td>
                  <td>${esc(rule.source)}</td>
                  <td>${esc(rule.conditions)}</td>
                  <td>${rule.matchingEmployeeIds.length}</td>
                  <td>${esc(rule.lifecycleEvents.join(", "))}</td>
                  <td>${badge(rule.status, rule.status === "Active" ? "active" : "disabled")}</td>
                  <td>${formatDate(rule.lastEvaluated)}</td>
                  <td><div class="row-actions"><button data-action="duplicate-rule" data-id="${rule.id}">${icon("copy")}</button><button data-action="toggle-rule" data-id="${rule.id}">${icon("bolt")}</button><button data-action="delete-rule" data-id="${rule.id}">${icon("trash")}</button></div></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
      ${renderLifecycleSimulator(data)}
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
          <p>Run joiner, mover and leaver previews before mutating state.</p>
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
      ${sim.result ? renderSimulationResult(sim.result) : `<div class="empty-state small">Simulation results will show roles to add, roles to remove, gained permissions, removed permissions, source provisioning actions, manual actions and conflicts.</div>`}
    </div>
  `;
}

function renderSimulationResult(result) {
  const retained = result.rolesRetained || [];
  const added = result.rolesToAdd || [];
  const removed = result.rolesToRemove || [];
  return `
    <div class="result-panel">
      <h3>${esc(result.eventType)} simulation for ${esc(result.employeeName)}</h3>
      <div class="sim-diff">
        <div class="sim-diff-col">
          <h4>Retained</h4>
          ${retained.length ? retained.map((role) => `<div class="diff-item retained">${esc(role)}</div>`).join("") : `<div class="diff-item empty">None</div>`}
        </div>
        <div class="sim-diff-arrow">${icon("chevron")}</div>
        <div class="sim-diff-col">
          <h4>Removed</h4>
          ${removed.length ? removed.map((role) => `<div class="diff-item removed">${esc(role)}</div>`).join("") : `<div class="diff-item empty">None</div>`}
        </div>
        <div class="sim-diff-col">
          <h4>Added</h4>
          ${added.length ? added.map((role) => `<div class="diff-item added">${esc(role)}</div>`).join("") : `<div class="diff-item empty">None</div>`}
        </div>
      </div>
      <div class="chip-row">
        <div><strong>Source provisioning actions</strong>${chipList(result.sourceProvisioningActions)}</div>
        <div><strong>Manual actions required</strong>${chipList(result.manualActionsRequired)}</div>
        ${result.conflictsDetected?.length ? `<div><strong>Conflicts detected</strong>${chipList(result.conflictsDetected, "conflict")}</div>` : ""}
      </div>
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
          <div class="inline-badges">${badge(role.source, "neutral")} ${badge(role.status, role.status === "Active" ? "active" : role.status === "Draft" ? "draft" : "disabled")}</div>
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
          ${definition("Role source", role.source)}
          ${definition("Current corporate", role.currentCorporate)}
          ${definition("Creation date", formatDate(role.createdAt))}
          ${definition("Last updated", formatDate(role.updatedAt))}
          ${definition("Assigned employee count", role.assignedEmployeeIds.length)}
          ${definition("Connected tool count", new Set(role.permissions.map((permission) => permission.tool)).size)}
          ${definition("Selected resource count", resources.size)}
          ${definition("Active assignment rules", data.assignmentRules.filter((rule) => rule.roleId === role.id && rule.status === "Active").length)}
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
  const employees = data.employees.filter((employee) => role.assignedEmployeeIds.includes(employee.id));
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
                <td><div class="row-actions"><button data-route="/permissions/employees/${employee.id}">View Employee</button><button data-action="remove-employee-role" data-role-id="${role.id}" data-employee-id="${employee.id}">Remove</button><button data-action="temp-employee-role" data-role-id="${role.id}" data-employee-id="${employee.id}">Temporary</button><button data-route="/permissions/employees/${employee.id}?tab=explanation">Explain</button></div></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderRoleRules(data, role) {
  const rules = data.assignmentRules.filter((rule) => rule.roleId === role.id);
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
      ${tabs.map((tab) => `<button class="tab ${activeTab === tab ? "active" : ""}" data-route="/permissions/employees/${employee.id}" data-query-tab="${tab}">${{ profile: "Profile", roles: "Assigned Roles", effective: "Effective Access", explanation: "Access Explanation", audit: "Audit History" }[tab]}</button>`).join("")}
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
  if (stateful.modal === "iam") return renderIamWizard(data);
  if (stateful.modal === "import") return renderImportModal(data);
  if (stateful.modal === "agent") return renderAgentWizard(data);
  if (stateful.modal === "access-simulator") return `<div class="modal-backdrop"><div class="modal xl">${modalHeader("Access Simulator")}${renderAccessSimulator(data)}<div class="modal-actions">${actionButton("Close", "close-modal", "secondary")}</div></div></div>`;
  if (stateful.modal === "add-employees") return renderAddEmployeesModal(data);
  if (stateful.modal === "add-role") return renderAddRoleToEmployeeModal(data);
  if (stateful.modal === "rule") return renderRuleModal(data);
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
    source: "Manually Created",
    status: "Active",
    currentCorporate: data.corporate.name,
    assignmentMethods: ["Add Employees Manually"],
    employeeIds: [],
    iamGroupId: "",
    ruleRows: [{ field: "Department", operator: "Equals", value: "Finance", joiner: "AND" }],
    csvText: "",
    csvRows: [],
    previewEmployeeIds: [],
    connectionIds: [],
    resourceIdsByConnection: {},
    matrixByConnection: {},
    fieldRestrictions: {},
    conditions: {
      exportAllowed: true,
      externalSharingAllowed: false,
      maxRecords: 500,
      maxExportSize: "25 MB",
      approvalRequired: false,
      approvalAmount: "",
      effectiveDate: "2026-07-27",
      expiryDate: "",
      location: "Any",
      employmentStatus: "Active",
      managedDeviceRequired: false,
      temporaryAccess: false,
      reasonRequired: false
    },
    provisionToSource: {}
  };
}

function roleDraftFromRole(data, role) {
  const draft = emptyRoleDraft(data);
  return {
    ...draft,
    id: role.id,
    name: role.name,
    code: role.code,
    description: role.description,
    owner: role.owner,
    source: role.source,
    status: role.status,
    employeeIds: [...role.assignedEmployeeIds],
    connectionIds: role.permissions.map((permission) => permission.connectionId),
    resourceIdsByConnection: Object.fromEntries(role.permissions.map((permission) => [permission.connectionId, permission.resourceScope.mode === "all" ? ["__all__"] : permission.resourceScope.resourceIds])),
    matrixByConnection: Object.fromEntries(role.permissions.map((permission) => [permission.connectionId, permission.matrix])),
    fieldRestrictions: role.permissions[0]?.fieldRestrictions || {},
    conditions: { ...draft.conditions, ...(role.permissions[0]?.conditions || {}) },
    provisionToSource: Object.fromEntries(role.permissions.map((permission) => [permission.connectionId, permission.provisionToSource]))
  };
}

function ensureRoleWizard(data) {
  if (!stateful.roleWizard) stateful.roleWizard = { step: 1, draft: emptyRoleDraft(data) };
  return stateful.roleWizard;
}

function renderRoleWizard(data) {
  const wizard = ensureRoleWizard(data);
  const steps = ["Role Details", "Assignment Method", "Tools and Scope", "Permissions", "Restrictions", "Review and Publish"];
  return `
    <div class="modal-backdrop">
      <div class="modal xl" role="dialog" aria-modal="true">
        ${modalHeader(wizard.draft.id ? "Edit Role" : "Create New Role")}
        ${stepper(steps, wizard.step)}
        <div class="wizard-body">
          ${wizard.step === 1 ? renderRoleStepDetails(data, wizard.draft) : ""}
          ${wizard.step === 2 ? renderRoleStepAssignments(data, wizard.draft) : ""}
          ${wizard.step === 3 ? renderRoleStepTools(data, wizard.draft) : ""}
          ${wizard.step === 4 ? renderRoleStepPermissions(data, wizard.draft) : ""}
          ${wizard.step === 5 ? renderRoleStepRestrictions(data, wizard.draft) : ""}
          ${wizard.step === 6 ? renderRoleStepReview(data, wizard.draft) : ""}
        </div>
        <div class="modal-actions">
          ${wizard.step > 1 ? actionButton("Back", "role-back", "secondary") : ""}
          ${actionButton("Cancel", "close-modal", "secondary")}
          ${wizard.step === 6 ? actionButton("Save as Draft", "save-role-draft", "secondary") : ""}
          ${wizard.step < steps.length ? actionButton("Next", "role-next", "primary") : actionButton("Publish Role", "publish-role", "primary")}
        </div>
      </div>
    </div>
  `;
}

function renderRoleStepDetails(data, draft) {
  return `
    <div class="form-grid two">
      ${fieldInput("role.name", "Role Name", draft.name)}
      ${fieldInput("role.code", "Role Code", draft.code)}
      ${fieldInput("role.description", "Description", draft.description)}
      ${fieldInput("role.owner", "Role Owner", draft.owner)}
      ${fieldSelect("role.status", "Status", ["Active", "Draft", "Disabled"], draft.status)}
      <label class="field"><span>Current Corporate</span><input value="${esc(data.corporate.name)}" readonly /></label>
    </div>
  `;
}

function renderRoleStepAssignments(data, draft) {
  const methods = ["IAM Group", "HRMS Attribute Rule", "Add Employees Manually", "Upload CSV"];
  const matched = previewEmployees(data, draft);
  draft.previewEmployeeIds = matched.map((employee) => employee.id);
  return `
    <div class="check-grid compact">
      ${methods.map((method) => `<label class="check-card"><input type="checkbox" data-action="role-assignment-method" value="${method}" ${draft.assignmentMethods.includes(method) ? "checked" : ""} /><span>${method}</span></label>`).join("")}
    </div>
    ${draft.assignmentMethods.includes("IAM Group") ? `
      <div class="subsection">
        <h3>IAM Group → HyperContext Role</h3>
        ${fieldSelect("role.iamGroupId", "IAM Group", data.iamGroups.map((group) => [group.id, `${group.name} (${group.members} members)`]), draft.iamGroupId)}
      </div>
    ` : ""}
    ${draft.assignmentMethods.includes("HRMS Attribute Rule") ? `
      <div class="subsection">
        <h3>HRMS Attribute Rule</h3>
        <div class="rule-builder">
          ${draft.ruleRows.map((row, index) => `
            <div class="rule-row">
              ${index > 0 ? fieldSelect(`role.ruleRows.${index}.joiner`, "Joiner", ["AND", "OR"], row.joiner) : "<span></span>"}
              ${fieldSelect(`role.ruleRows.${index}.field`, "Field", ["Department", "Designation", "Grade", "Location", "Employment Type", "Employment Status", "Manager", "Legal Entity"], row.field)}
              ${fieldSelect(`role.ruleRows.${index}.operator`, "Operator", ["Equals", "Does not equal", "Contains", "Is one of", "Is not one of", "Greater than or equal", "Less than or equal"], row.operator)}
              ${fieldInput(`role.ruleRows.${index}.value`, "Value", row.value)}
            </div>
          `).join("")}
        </div>
        <div class="modal-actions inline">${actionButton("Add Rule Condition", "add-rule-condition", "secondary")} ${actionButton("Preview Matching Employees", "preview-role-employees", "primary")}</div>
        <p class="muted">${matched.length} matching employee(s)</p>
        ${employeePreviewTable(matched.slice(0, 4))}
      </div>
    ` : ""}
    ${draft.assignmentMethods.includes("Add Employees Manually") ? `
      <div class="subsection">
        <h3>Manual Employee Selection</h3>
        <div class="filters mini">
          <input data-filter="employees.q" placeholder="Search employees" />
          ${selectInput("employees.department", "Department", ["", ...new Set(data.employees.map((employee) => employee.department))], stateful.filters.employees.department)}
          ${selectInput("employees.designation", "Designation", ["", ...new Set(data.employees.map((employee) => employee.designation))], stateful.filters.employees.designation)}
          ${selectInput("employees.status", "Employment status", ["", "Active", "Inactive", "Terminated"], "")}
        </div>
        <div class="employee-picker">
          ${data.employees.map((employee) => `<label><input type="checkbox" data-action="role-employee" value="${employee.id}" ${draft.employeeIds.includes(employee.id) ? "checked" : ""} /><span>${esc(employee.name)} · ${esc(employee.employeeId)} · ${esc(employee.department)}</span></label>`).join("")}
        </div>
      </div>
    ` : ""}
    ${draft.assignmentMethods.includes("Upload CSV") ? `
      <div class="subsection">
        <h3>CSV Assignment</h3>
        <div class="drop-zone">
          <input type="file" accept=".csv" data-action="role-csv-file" />
          <span>Drop or choose a CSV with employee_id, employee_name, work_email, role_code, effective_from, effective_until.</span>
        </div>
        <textarea data-bind="role.csvText" placeholder="employee_id,employee_name,work_email,role_code,effective_from,effective_until">${esc(draft.csvText)}</textarea>
        <div class="modal-actions inline">${actionButton("Parse CSV", "parse-role-csv", "secondary")}</div>
        ${draft.csvRows.length ? csvSummary(draft.csvRows) : ""}
      </div>
    ` : ""}
  `;
}

function employeePreviewTable(employees) {
  if (!employees.length) return `<div class="empty-state small">No employees match yet.</div>`;
  return `<div class="table-wrap tight"><table><thead><tr><th>Employee</th><th>Department</th><th>Grade</th><th>Status</th></tr></thead><tbody>${employees.map((employee) => `<tr><td>${esc(employee.name)}</td><td>${esc(employee.department)}</td><td>${esc(employee.grade)}</td><td>${esc(employee.employmentStatus)}</td></tr>`).join("")}</tbody></table></div>`;
}

function previewEmployees(data, draft) {
  if (!draft.assignmentMethods.includes("HRMS Attribute Rule")) return [];
  return data.employees.filter((employee) => draft.ruleRows.every((row) => {
    const sourceValue = String(employee[toCamel(row.field)] || "");
    if (row.operator === "Equals") return sourceValue === row.value;
    if (row.operator === "Does not equal") return sourceValue !== row.value;
    if (row.operator === "Contains") return sourceValue.toLowerCase().includes(row.value.toLowerCase());
    if (row.operator === "Is one of") return row.value.split(",").map((value) => value.trim()).includes(sourceValue);
    if (row.operator === "Is not one of") return !row.value.split(",").map((value) => value.trim()).includes(sourceValue);
    if (row.operator === "Greater than or equal") return sourceValue >= row.value;
    if (row.operator === "Less than or equal") return sourceValue <= row.value;
    return false;
  }));
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
  return `
    <div class="grid-two">
      <div class="subsection">
        <h3>Explicit Denies and Field Masking</h3>
        <div class="chip-list">
          ${fields.map((field) => `
            <label><span>${esc(field)}</span><select data-action="draft-field-restriction" data-field="${esc(field)}">${["Visible", "Masked", "Hidden", "Aggregate Only"].map((mode) => `<option ${draft.fieldRestrictions[field] === mode ? "selected" : ""}>${mode}</option>`).join("")}</select></label>
          `).join("") || `<p class="muted">Select a connection to see field-level options.</p>`}
        </div>
      </div>
      <div class="subsection">
        <h3>Runtime Conditions</h3>
        <div class="form-grid two">
          <label class="check-line"><input type="checkbox" data-bind="role.conditions.exportAllowed" ${draft.conditions.exportAllowed ? "checked" : ""} /> Export allowed</label>
          <label class="check-line"><input type="checkbox" data-bind="role.conditions.externalSharingAllowed" ${draft.conditions.externalSharingAllowed ? "checked" : ""} /> External sharing allowed</label>
          <label class="check-line"><input type="checkbox" data-bind="role.conditions.approvalRequired" ${draft.conditions.approvalRequired ? "checked" : ""} /> Approval required before write actions</label>
          <label class="check-line"><input type="checkbox" data-bind="role.conditions.managedDeviceRequired" ${draft.conditions.managedDeviceRequired ? "checked" : ""} /> Managed-device requirement</label>
          <label class="check-line"><input type="checkbox" data-bind="role.conditions.temporaryAccess" ${draft.conditions.temporaryAccess ? "checked" : ""} /> Temporary access</label>
          <label class="check-line"><input type="checkbox" data-bind="role.conditions.reasonRequired" ${draft.conditions.reasonRequired ? "checked" : ""} /> Reason required before sensitive action</label>
          ${fieldInput("role.conditions.maxRecords", "Maximum records per request", draft.conditions.maxRecords, "number")}
          ${fieldInput("role.conditions.maxExportSize", "Maximum export size", draft.conditions.maxExportSize)}
          ${fieldInput("role.conditions.approvalAmount", "Approval above amount", draft.conditions.approvalAmount)}
          ${fieldInput("role.conditions.effectiveDate", "Effective date", draft.conditions.effectiveDate, "date")}
          ${fieldInput("role.conditions.expiryDate", "Expiry date", draft.conditions.expiryDate, "date")}
          ${fieldSelect("role.conditions.location", "Location restriction", ["Any", ...new Set(data.employees.map((employee) => employee.location))], draft.conditions.location)}
          ${fieldSelect("role.conditions.employmentStatus", "Employment-status restriction", ["Any", "Active", "Inactive", "Terminated"], draft.conditions.employmentStatus)}
        </div>
      </div>
    </div>
  `;
}

function renderRoleStepReview(data, draft) {
  const selectedConnections = draft.connectionIds.map((connectionId) => byId(data.connections, connectionId)).filter(Boolean);
  const allActions = selectedConnections.flatMap((connection) => Object.values(draft.matrixByConnection[connection.id] || {}).flatMap((matrix) => Object.entries(matrix).filter(([, effect]) => effect === "allow").map(([name]) => name)));
  const denies = selectedConnections.flatMap((connection) => Object.values(draft.matrixByConnection[connection.id] || {}).flatMap((matrix) => Object.entries(matrix).filter(([, effect]) => effect === "deny").map(([name]) => name)));
  const sourceSupported = selectedConnections.filter((connection) => getToolCapability(connection.sourceTool).supportsProvisioning).length;
  return `
    <div class="review-grid">
      ${definition("Role details", `${draft.name || "Untitled"} (${draft.code || "No code"})`)}
      ${definition("Assignment methods", draft.assignmentMethods.join(", "))}
      ${definition("Matching employees", new Set([...draft.employeeIds, ...draft.previewEmployeeIds, ...draft.csvRows.filter((row) => row.valid).map((row) => row.employeeId)]).size)}
      ${definition("Selected categories", [...new Set(selectedConnections.map((connection) => connection.category))].join(", ") || "None")}
      ${definition("Selected tools", [...new Set(selectedConnections.map((connection) => connection.sourceTool))].join(", ") || "None")}
      ${definition("Selected connections", selectedConnections.map((connection) => connection.connectionName).join(", ") || "None")}
      ${definition("Selected resources", Object.values(draft.resourceIdsByConnection).flat().length)}
      ${definition("Allowed actions", allActions.length)}
      ${definition("Explicit denies", denies.length)}
      ${definition("Restricted fields", Object.keys(draft.fieldRestrictions).length)}
      ${definition("Approval requirements", draft.conditions.approvalRequired ? "Required" : "Not required")}
      ${definition("Source-provisioning support", `${sourceSupported} connection(s)`)}
      ${definition("Unsupported actions", "Disabled in the generated matrix")}
    </div>
    <div class="impact-summary">
      ${miniMetric("Employees gaining access", new Set([...draft.employeeIds, ...draft.previewEmployeeIds]).size)}
      ${miniMetric("Employees losing access", draft.id ? "0 in this edit" : "0")}
      ${miniMetric("Permission conflicts detected", denies.length ? `${denies.length} explicit deny entries` : "None")}
      ${miniMetric("Manual action required", `${selectedConnections.length - sourceSupported} connection(s)`)}
    </div>
  `;
}

function ensureIamWizard() {
  if (!stateful.iamWizard) {
    stateful.iamWizard = { step: 1, ...iamDefaults("Okta", store.getState()) };
  }
  return stateful.iamWizard;
}

function iamDefaults(provider, data) {
  const defaults = {
    Okta: {
      displayName: "Okta Directory",
      tenantDomain: "tartanhq.okta.com",
      apiBaseUrl: "https://tartanhq.okta.com",
      credentialType: "OAuth Client Credentials",
      scimBaseUrl: "https://tartanhq.okta.com/scim/v2"
    },
    "Microsoft Entra ID (Azure AD)": {
      displayName: "Microsoft Entra Directory",
      tenantDomain: "tartanhq.onmicrosoft.com",
      apiBaseUrl: "https://graph.microsoft.com/v1.0",
      credentialType: "OAuth Client Credentials",
      scimBaseUrl: "https://graph.microsoft.com/v1.0"
    },
    "Google Workspace": {
      displayName: "Google Workspace Directory",
      tenantDomain: "tartanhq.com",
      apiBaseUrl: "https://admin.googleapis.com/admin/directory/v1",
      credentialType: "OAuth Client Credentials",
      scimBaseUrl: ""
    },
    "Custom OIDC / SCIM": {
      displayName: "Custom OIDC / SCIM Directory",
      tenantDomain: "identity.tartanhq.example",
      apiBaseUrl: "https://identity.tartanhq.example",
      credentialType: "SCIM Bearer Token",
      scimBaseUrl: "https://identity.tartanhq.example/scim/v2"
    }
  };
  return {
    provider,
    owner: data.currentUser.name,
    environment: "Production",
    clientId: "",
    clientSecret: "",
    syncUsers: true,
    syncGroups: true,
    ...(defaults[provider] || defaults.Okta)
  };
}

function renderIamWizard(data) {
  const wizard = ensureIamWizard();
  const steps = ["Select Provider", "Connection Details", "API Credentials", "Review and Connect"];
  const providers = ["Okta", "Microsoft Entra ID (Azure AD)", "Google Workspace", "Custom OIDC / SCIM"];
  return `
    <div class="modal-backdrop">
      <div class="modal lg">
        ${modalHeader("Connect IAM")}
        ${stepper(steps, wizard.step)}
        <div class="wizard-body">
          ${wizard.step === 1 ? `<div class="option-grid">${providers.map((provider) => optionCard(provider, "Connect identities and groups from this IAM provider.", wizard.provider === provider, "iam-provider", provider)).join("")}</div><div class="info-banner">IAM provides authentication, identities and group memberships. Resource-level access is still controlled by source permissions and HyperContext policies.</div>` : ""}
          ${wizard.step === 2 ? `<div class="form-grid two">${fieldInput("iam.displayName", "Connection name", wizard.displayName || `${wizard.provider} Directory`)}${fieldInput("iam.tenantDomain", "Tenant domain", wizard.tenantDomain)}${fieldInput("iam.owner", "Connection owner", wizard.owner || data.currentUser.name)}${fieldSelect("iam.environment", "Environment", ["Production", "Sandbox"], wizard.environment || "Production")}</div>` : ""}
          ${wizard.step === 3 ? `<div class="form-grid two">${fieldInput("iam.apiBaseUrl", "API base URL", wizard.apiBaseUrl)}${fieldSelect("iam.credentialType", "Credential type", ["OAuth Client Credentials", "API Token", "OIDC Client Secret", "SCIM Bearer Token"], wizard.credentialType)}${fieldInput("iam.clientId", "Client ID", wizard.clientId)}${fieldInput("iam.clientSecret", "Client secret / API token", wizard.clientSecret, "password")}${fieldInput("iam.scimBaseUrl", "SCIM base URL", wizard.scimBaseUrl)}<label class="field"><span>Credential storage</span><input readonly value="Prototype only. Secret is masked and not used for real API calls." /></label></div>` : ""}
          ${wizard.step === 4 ? `<div class="review-grid">${definition("Provider", wizard.provider)}${definition("Connection name", wizard.displayName || `${wizard.provider} Directory`)}${definition("Tenant domain", wizard.tenantDomain || "Not set")}${definition("API base URL", wizard.apiBaseUrl || "Not set")}${definition("Credential type", wizard.credentialType)}${definition("Client ID", wizard.clientId || "Not set")}${definition("Secret configured", wizard.clientSecret ? "Yes, masked" : "No")}${definition("Users and groups", "Will sync after connection")}${definition("Last sync", "Will run immediately")}</div>` : ""}
        </div>
        <div class="modal-actions">
          ${wizard.step > 1 ? actionButton("Back", "iam-back", "secondary") : ""}
          ${actionButton("Cancel", "close-modal", "secondary")}
          ${wizard.step < steps.length ? actionButton("Next", "iam-next", "primary") : actionButton("Review and Connect", "connect-iam", "primary")}
        </div>
      </div>
    </div>
  `;
}

function ensureImportModal() {
  if (!stateful.importModal) stateful.importModal = { importType: "Roles and Employee Assignments", csvText: "", rows: [], mapped: false };
  return stateful.importModal;
}

function renderImportModal() {
  const modal = ensureImportModal();
  const permissionType = modal.importType === "Role Permission Mapping";
  return `
    <div class="modal-backdrop">
      <div class="modal lg">
        ${modalHeader("Import Role Mapping")}
        <div class="form-grid one">
          ${fieldSelect("import.importType", "Import Type", ["Roles and Employee Assignments", "Role Permission Mapping"], modal.importType)}
          <div class="drop-zone"><input type="file" accept=".csv" data-action="import-csv-file" /><span>Drop or choose a CSV file.</span></div>
          <button class="btn secondary slim" data-action="download-template">Download Template</button>
          <textarea data-bind="import.csvText" placeholder="${permissionType ? "role_code,category,tool,connection_id,resource_type,resource_id,action,effect,field_restrictions,effective_from,effective_until" : "role_code,role_name,employee_id,employee_name,work_email,effective_from,effective_until"}">${esc(modal.csvText)}</textarea>
          <div class="modal-actions inline">${actionButton("Parse CSV", "parse-import-csv", "secondary")} ${actionButton("Map Columns", "map-import-columns", "secondary")}</div>
          ${modal.rows.length ? csvSummary(modal.rows) : ""}
        </div>
        <div class="modal-actions">
          ${actionButton("Cancel", "close-modal", "secondary")}
          ${actionButton("Confirm Import", "confirm-import", "primary", modal.rows.length ? "" : "disabled")}
        </div>
      </div>
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

function renderAddEmployeesModal(data) {
  const role = byId(data.roles, stateful.addEmployeesRoleId);
  return `
    <div class="modal-backdrop">
      <div class="modal lg">
        ${modalHeader(`Add Employees to ${role?.name || "Role"}`)}
        <div class="employee-picker modal-picker">${data.employees.map((employee) => `<label><input type="checkbox" data-action="modal-employee-select" value="${employee.id}" /><span>${esc(employee.name)} · ${esc(employee.employeeId)} · ${esc(employee.department)}</span></label>`).join("")}</div>
        <div class="modal-actions">${actionButton("Cancel", "close-modal", "secondary")}${actionButton("Add Employees", "confirm-add-employees", "primary")}</div>
      </div>
    </div>
  `;
}

function renderAddRoleToEmployeeModal(data) {
  const employee = byId(data.employees, stateful.addRoleEmployeeId);
  return `
    <div class="modal-backdrop">
      <div class="modal sm">
        ${modalHeader(`Add Role to ${employee?.name || "Employee"}`)}
        ${fieldSelect("addRole.roleId", "Role", data.roles.map((role) => [role.id, role.name]), data.roles[0]?.id)}
        <div class="modal-actions">${actionButton("Cancel", "close-modal", "secondary")}${actionButton("Add Role", "confirm-add-role-to-employee", "primary")}</div>
      </div>
    </div>
  `;
}

function renderRuleModal(data) {
  if (!stateful.ruleModal) stateful.ruleModal = { name: "", roleId: data.roles[0]?.id, source: "HRMS", conditions: "Department = Finance AND Employment Status = Active", effectiveDate: "2026-07-27", expiryDate: "", priority: 50, status: "Active", lifecycleEvents: ["Joiner", "Mover"] };
  const rule = stateful.ruleModal;
  return `
    <div class="modal-backdrop">
      <div class="modal lg">
        ${modalHeader("Create Assignment Rule")}
        <div class="form-grid two">
          ${fieldInput("rule.name", "Rule name", rule.name)}
          ${fieldSelect("rule.roleId", "Assign role", data.roles.map((roleItem) => [roleItem.id, roleItem.name]), rule.roleId)}
          ${fieldSelect("rule.source", "Source", ["HRMS", "IAM", "Manual", "CSV Import"], rule.source)}
          ${fieldInput("rule.conditions", "Conditions", rule.conditions)}
          ${fieldInput("rule.effectiveDate", "Effective date", rule.effectiveDate, "date")}
          ${fieldInput("rule.expiryDate", "Expiry date", rule.expiryDate, "date")}
          ${fieldInput("rule.priority", "Priority", rule.priority, "number")}
          ${fieldSelect("rule.status", "Status", ["Active", "Draft", "Disabled"], rule.status)}
        </div>
        <div class="check-grid compact">${["Joiner", "Mover", "Leaver"].map((event) => `<label class="check-card"><input type="checkbox" data-action="rule-event" value="${event}" ${rule.lifecycleEvents.includes(event) ? "checked" : ""}/><span>${event}</span></label>`).join("")}</div>
        <div class="modal-actions">${actionButton("Cancel", "close-modal", "secondary")}${actionButton("Create Rule", "create-rule", "primary")}</div>
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
  if (scope === "iam") write(ensureIamWizard(), key, value);
  if (scope === "import") write(ensureImportModal(), key, value);
  if (scope === "agent") write(ensureAgentWizard().draft, key, value);
  if (scope === "simulator") write(stateful.simulator, key, value);
  if (scope === "lifecycle") write(stateful.lifecycle, key, value);
  if (scope === "rule") write(stateful.ruleModal ||= {}, key, value);
  if (scope === "context") write(stateful.context, key, value);
  if (scope === "filter") write(stateful.filters, key, value);
  if (scope === "addRole") stateful.selectedRoleForEmployee = value;
}

function parseCsv(text, data, type = "assignment") {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((item) => item.trim());
  const seen = new Set();
  return lines.slice(1).map((line, index) => {
    const values = line.split(",").map((item) => item.trim());
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] || ""]));
    const employee = data.employees.find((item) => item.employeeId === row.employee_id || item.workEmail === row.work_email);
    const duplicateKey = type === "permission" ? `${row.role_code}|${row.connection_id}|${row.resource_id}|${row.action}` : `${row.role_code}|${row.employee_id || row.work_email}`;
    const duplicate = seen.has(duplicateKey);
    seen.add(duplicateKey);
    const errors = [];
    if (!row.role_code) errors.push("Missing role_code");
    if (type !== "permission" && !employee) errors.push("No employee matched employee_id or work_email");
    if (type === "permission" && (!row.connection_id || !row.action || !row.effect)) errors.push("Missing permission columns");
    if (duplicate) errors.push("Duplicate row");
    return { ...row, rowNumber: index + 2, employeeId: employee?.id || "", unmatched: !employee && type !== "permission", duplicate, errors, valid: errors.length === 0 };
  });
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
  if (target.matches("[data-action='role-csv-file']") || target.matches("[data-action='import-csv-file']")) readCsvFile(target);
  render();
});

function readCsvFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (input.dataset.action === "role-csv-file") ensureRoleWizard(store.getState()).draft.csvText = String(reader.result);
    if (input.dataset.action === "import-csv-file") ensureImportModal().csvText = String(reader.result);
    render();
  };
  reader.readAsText(file);
}

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
  if (action === "role-assignment-method") return toggleArray(ensureRoleWizard(data).draft.assignmentMethods, el.value, el.checked, true);
  if (action === "role-employee") return toggleArray(ensureRoleWizard(data).draft.employeeIds, el.value, el.checked);
  if (action === "add-rule-condition") {
    ensureRoleWizard(data).draft.ruleRows.push({ joiner: "AND", field: "Department", operator: "Equals", value: "" });
    return render();
  }
  if (action === "preview-role-employees") {
    const wizard = ensureRoleWizard(data);
    wizard.draft.previewEmployeeIds = previewEmployees(data, wizard.draft).map((employee) => employee.id);
    showToast(`${wizard.draft.previewEmployeeIds.length} matching employees found`);
    return render();
  }
  if (action === "parse-role-csv") {
    const wizard = ensureRoleWizard(data);
    wizard.draft.csvRows = parseCsv(wizard.draft.csvText, data, "assignment");
    wizard.draft.employeeIds = [...new Set([...wizard.draft.employeeIds, ...wizard.draft.csvRows.filter((row) => row.valid).map((row) => row.employeeId)])];
    return render();
  }
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
  if (action === "open-add-employees") {
    stateful.addEmployeesRoleId = el.dataset.roleId;
    stateful.selectedModalEmployeeIds = [];
    stateful.modal = "add-employees";
    return render();
  }
  if (action === "modal-employee-select") return toggleArray(stateful.selectedModalEmployeeIds, el.value, el.checked);
  if (action === "confirm-add-employees") {
    store.update((draft) => addEmployeesToRole(draft, stateful.addEmployeesRoleId, stateful.selectedModalEmployeeIds || []));
    closeModal();
    return showToast("Employees added to role");
  }
  if (action === "remove-employee-role") return removeEmployeeRole(el.dataset.roleId, el.dataset.employeeId);
  if (action === "temp-employee-role") return addTempAccess(el.dataset.roleId, el.dataset.employeeId);
  if (action === "open-add-role-to-employee") {
    stateful.addRoleEmployeeId = el.dataset.employeeId;
    stateful.modal = "add-role";
    return render();
  }
  if (action === "confirm-add-role-to-employee") return addRoleToEmployee();
  if (action === "add-temp-access") return addEmployeeTempAccess(el.dataset.employeeId);
  if (action === "add-explicit-restriction") return addExplicitRestriction(el.dataset.employeeId);
  if (action === "open-rule-modal") {
    stateful.ruleModal = null;
    stateful.modal = "rule";
    return render();
  }
  if (action === "rule-event") return toggleArray(stateful.ruleModal.lifecycleEvents, el.value, el.checked);
  if (action === "create-rule") return createRule(data);
  if (action === "duplicate-rule" || action === "toggle-rule" || action === "delete-rule") return mutateRule(action, el.dataset.id);
  if (action === "run-lifecycle-simulation") {
    stateful.lifecycle.result = simulateLifecycleEvent(data, stateful.lifecycle);
    return render();
  }
  if (action === "apply-lifecycle-simulation") return applyLifecycleSimulation();
  if (action === "open-iam-wizard") {
    stateful.iamWizard = null;
    stateful.modal = "iam";
    return render();
  }
  if (action === "iam-provider") {
    const wizard = ensureIamWizard();
    Object.assign(wizard, iamDefaults(el.dataset.value, data));
    return render();
  }
  if (action === "iam-back") {
    ensureIamWizard().step -= 1;
    return render();
  }
  if (action === "iam-next") {
    const wizard = ensureIamWizard();
    if (wizard.step === 2 && (!wizard.displayName || !wizard.tenantDomain || !wizard.owner)) return showToast("Connection name, tenant domain and owner are required", "error");
    if (wizard.step === 3 && (!wizard.apiBaseUrl || !wizard.credentialType || !wizard.clientId || !wizard.clientSecret)) return showToast("API base URL, credential type, client ID and secret/token are required", "error");
    wizard.step += 1;
    return render();
  }
  if (action === "connect-iam") return connectIam(data);
  if (action === "open-import-modal") {
    stateful.importModal = null;
    stateful.modal = "import";
    return render();
  }
  if (action === "download-template") return downloadTemplate();
  if (action === "parse-import-csv") {
    const modal = ensureImportModal();
    modal.rows = parseCsv(modal.csvText, data, modal.importType === "Role Permission Mapping" ? "permission" : "assignment");
    return render();
  }
  if (action === "map-import-columns") {
    ensureImportModal().mapped = true;
    showToast("Columns mapped by header names");
    return render();
  }
  if (action === "confirm-import") return confirmImport(data);
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
  wizard.draft.employeeIds = [...new Set([...wizard.draft.employeeIds, ...wizard.draft.previewEmployeeIds, ...wizard.draft.csvRows.filter((row) => row.valid).map((row) => row.employeeId)])];
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

function removeEmployeeRole(roleId, employeeId) {
  store.update((draft) => {
    const role = byId(draft.roles, roleId);
    const employee = byId(draft.employees, employeeId);
    if (!role || !employee) return;
    role.assignedEmployeeIds = role.assignedEmployeeIds.filter((idValue) => idValue !== employeeId);
    employee.roleIds = employee.roleIds.filter((idValue) => idValue !== roleId);
    addAuditEvent(draft, { eventType: "Employee Removed from Role", principalType: "Employee", principal: employee.name, summary: `${employee.name} removed from ${role.name}` });
  });
  showToast("Employee removed from role");
}

function addTempAccess(roleId, employeeId) {
  store.update((draft) => addEmployeesToRole(draft, roleId, [employeeId], true));
  showToast("Temporary assignment created");
}

function addRoleToEmployee() {
  const roleId = stateful.selectedRoleForEmployee || store.getState().roles[0]?.id;
  store.update((draft) => addEmployeesToRole(draft, roleId, [stateful.addRoleEmployeeId]));
  closeModal();
  showToast("Role added to employee");
}

function addEmployeeTempAccess(employeeId) {
  const roleId = store.getState().roles[0]?.id;
  store.update((draft) => addEmployeesToRole(draft, roleId, [employeeId], true));
  showToast("Temporary access added");
}

function addExplicitRestriction(employeeId) {
  store.update((draft) => {
    const employee = byId(draft.employees, employeeId);
    draft.restrictions.push({ id: `restriction_${Date.now()}`, employeeId, type: "Explicit Deny", summary: "Export blocked for sensitive records", createdAt: new Date().toISOString() });
    addAuditEvent(draft, { eventType: "Permission Denied", principalType: "Employee", principal: employee?.name, summary: "Explicit restriction added" });
  });
  showToast("Explicit restriction added");
}

function createRule(data) {
  const rule = stateful.ruleModal;
  store.update((draft) => {
    const matchingEmployeeIds = draft.employees.filter((employee) => rule.conditions.includes(employee.department) || rule.conditions.includes(employee.employmentStatus)).map((employee) => employee.id);
    draft.assignmentRules.unshift({ id: `rule_${Date.now()}`, ...rule, matchingEmployeeIds, lastEvaluated: new Date().toISOString() });
    addAuditEvent(draft, { eventType: "Assignment Rule Evaluated", principal: byId(draft.roles, rule.roleId)?.name, source: rule.source, summary: `${rule.name} created with ${matchingEmployeeIds.length} matching employee(s)` });
  });
  closeModal();
  showToast("Assignment rule created");
}

function mutateRule(action, ruleId) {
  store.update((draft) => {
    const rule = byId(draft.assignmentRules, ruleId);
    if (!rule) return;
    if (action === "duplicate-rule") draft.assignmentRules.unshift({ ...structuredClone(rule), id: `rule_${Date.now()}`, name: `${rule.name} Copy`, status: "Draft" });
    if (action === "toggle-rule") rule.status = rule.status === "Active" ? "Disabled" : "Active";
    if (action === "delete-rule") draft.assignmentRules = draft.assignmentRules.filter((item) => item.id !== ruleId);
    addAuditEvent(draft, { eventType: "Assignment Rule Evaluated", principal: byId(draft.roles, rule.roleId)?.name, source: rule.source, summary: `${rule.name} ${action.replaceAll("-", " ")}` });
  });
  showToast("Assignment rule updated");
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
      employee.roleIds = [];
      draft.roles.forEach((role) => role.assignedEmployeeIds = role.assignedEmployeeIds.filter((idValue) => idValue !== employee.id));
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

function connectIam(data) {
  const wizard = ensureIamWizard();
  store.update((draft) => connectIamProvider(draft, wizard.provider, {}, {
    displayName: wizard.displayName,
    tenantDomain: wizard.tenantDomain,
    owner: wizard.owner,
    environment: wizard.environment,
    apiBaseUrl: wizard.apiBaseUrl,
    credentialType: wizard.credentialType,
    clientId: wizard.clientId,
    clientSecret: wizard.clientSecret,
    scimBaseUrl: wizard.scimBaseUrl
  }));
  stateful.iamWizard = null;
  stateful.modal = null;
  showToast("IAM connected and groups loaded");
}

function downloadTemplate() {
  const modal = ensureImportModal();
  const text = modal.importType === "Role Permission Mapping"
    ? "role_code,category,tool,connection_id,resource_type,resource_id,action,effect,field_restrictions,effective_from,effective_until\nFIN-MGR,Accounting,Zoho Books,conn_zoho,Invoices,invoices_india,View invoices,allow,Bank account number:Masked,2026-07-27,\n"
    : "role_code,role_name,employee_id,employee_name,work_email,effective_from,effective_until\nFIN-MGR,Finance Manager,EMP-1009,Tanya Bose,tanya.bose@tartanhq.com,2026-07-27,\n";
  const blob = new Blob([text], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = modal.importType === "Role Permission Mapping" ? "role_permission_mapping_template.csv" : "role_employee_assignment_template.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function confirmImport(data) {
  const modal = ensureImportModal();
  store.update((draft) => {
    modal.rows.filter((row) => row.valid).forEach((row) => {
      let role = draft.roles.find((item) => item.code === row.role_code);
      if (!role && modal.importType === "Roles and Employee Assignments") {
        role = createRoleFromDraft(draft, { name: row.role_name || row.role_code, code: row.role_code, employeeIds: [], connectionIds: [], assignmentMethod: "Manual", source: "CSV Import" }, "Draft");
      }
      if (role && modal.importType === "Roles and Employee Assignments") addEmployeesToRole(draft, role.id, [row.employeeId]);
      if (role && modal.importType === "Role Permission Mapping") {
        const grant = role.permissions.find((permission) => permission.connectionId === row.connection_id);
        if (grant && grant.matrix[row.resource_type]?.[row.action] !== undefined) grant.matrix[row.resource_type][row.action] = row.effect === "deny" ? "deny" : "allow";
      }
    });
    addAuditEvent(draft, { eventType: "Role Updated", principal: "CSV Import", source: "CSV Import", summary: `${modal.rows.filter((row) => row.valid).length} CSV row(s) imported` });
  });
  closeModal();
  showToast("Import confirmed");
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
