import {
  getAvailableResourceTypes,
  getCategory,
  getModulesForCategory,
  getSupportedBusinessActions,
  getToolCapability,
  getToolCapabilitySummary
} from "./catalogue.js";

export const STORAGE_KEY = "hypersync_permissions_state_v1";

const now = () => new Date().toISOString();
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
const id = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

function permissionMatrix(tool, allowByType = {}) {
  const capability = getToolCapability(tool);
  return Object.fromEntries(
    Object.entries(capability.resourceTypes).map(([resourceType, actions]) => [
      resourceType,
      Object.fromEntries(actions.map((item) => [item.name, allowByType[resourceType]?.includes(item.name) ? "allow" : "unset"]))
    ])
  );
}

function grant(connection, allowByType = {}, overrides = {}) {
  return {
    id: id("grant"),
    corporateId: connection.corporateId,
    category: connection.category,
    tool: connection.sourceTool,
    connectionId: connection.id,
    resourceScope: {
      mode: overrides.resourceScope?.mode || "specific",
      resourceIds: overrides.resourceScope?.resourceIds || []
    },
    matrix: permissionMatrix(connection.sourceTool, allowByType),
    fieldRestrictions: overrides.fieldRestrictions || {},
    conditions: {
      exportAllowed: overrides.conditions?.exportAllowed ?? true,
      externalSharingAllowed: overrides.conditions?.externalSharingAllowed ?? false,
      maxRecords: overrides.conditions?.maxRecords ?? 500,
      maxExportSize: overrides.conditions?.maxExportSize ?? "25 MB",
      approvalRequired: overrides.conditions?.approvalRequired ?? false,
      approvalAmount: overrides.conditions?.approvalAmount ?? "",
      effectiveDate: overrides.conditions?.effectiveDate || "2026-07-01",
      expiryDate: overrides.conditions?.expiryDate || "",
      location: overrides.conditions?.location || "Any",
      employmentStatus: overrides.conditions?.employmentStatus || "Active",
      managedDeviceRequired: overrides.conditions?.managedDeviceRequired ?? false,
      temporaryAccess: overrides.conditions?.temporaryAccess ?? false,
      reasonRequired: overrides.conditions?.reasonRequired ?? false
    },
    restrictions: overrides.restrictions || [],
    provisionToSource: overrides.provisionToSource ?? false,
    sourceProvisioningStatus: overrides.sourceProvisioningStatus || "Enforced in HyperContext"
  };
}

function makeConnection({ id: connectionId, category, tool, name, modules, status = "Active" }) {
  const categoryData = getCategory(category);
  const summary = getToolCapabilitySummary(tool);
  return {
    id: connectionId,
    corporateId: "corp_tartan",
    corporateName: "TartanHQ India",
    category: categoryData.label,
    sourceTool: tool,
    connectionName: name,
    connectionNameLower: name.toLowerCase(),
    modules: modules || getModulesForCategory(categoryData.label),
    dataModels: modules || getModulesForCategory(categoryData.label),
    availableResourceTypes: summary.availableResourceTypes,
    supportedBusinessActions: summary.supportedBusinessActions,
    sourcePermissionsCanRead: summary.sourcePermissionsReadable,
    sourcePermissionsCanUpdate: summary.sourcePermissionsUpdatable,
    sourceProvisioningCapability: summary.supportsProvisioning ? "Source Provisioning Supported" : "HyperContext Only",
    permissionState: "Partially Configured",
    defaultEffectiveAccess: "No Access",
    status,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(2)
  };
}

function resources() {
  return {
    conn_darwinbox: [
      { id: "emp_all", type: "Employees", name: "All employees", parentId: null },
      { id: "emp_finance", type: "Employees", name: "Finance employees", parentId: "emp_all" },
      { id: "emp_hr", type: "Employees", name: "Human Resources employees", parentId: "emp_all" },
      { id: "emp_contractors", type: "Employees", name: "Contractor records", parentId: "emp_all" },
      { id: "payroll_india", type: "Payroll", name: "India payroll", parentId: null },
      { id: "attendance_all", type: "Attendance", name: "Attendance records", parentId: null }
    ],
    conn_jira: [
      { id: "jira_fin", type: "Projects", name: "FIN", parentId: null },
      { id: "jira_pay", type: "Projects", name: "PAY", parentId: null },
      { id: "jira_support", type: "Projects", name: "SUPPORT", parentId: null },
      { id: "jira_eng", type: "Projects", name: "ENG", parentId: null },
      { id: "tickets_support", type: "Tickets", name: "Support tickets", parentId: "jira_support" },
      { id: "tickets_finance", type: "Tickets", name: "Finance tickets", parentId: "jira_fin" },
      { id: "jira_internal_comments", type: "Comments", name: "Internal comments", parentId: "jira_support" }
    ],
    conn_drive: [
      { id: "drive_finance", type: "Drives", name: "Finance Shared Drive", parentId: null },
      { id: "folder_india_finance", type: "Folders", name: "India Finance", parentId: "drive_finance" },
      { id: "folder_audit", type: "Folders", name: "Audit Documents", parentId: "folder_india_finance" },
      { id: "folder_policies", type: "Folders", name: "Employee Policies", parentId: null },
      { id: "folder_engineering_docs", type: "Folders", name: "Engineering Documents", parentId: null },
      { id: "file_invoice_pack", type: "Files", name: "FY26 invoice pack", parentId: "folder_india_finance" },
      { id: "file_audit_report", type: "Files", name: "FY26 statutory audit findings", parentId: "folder_audit" },
      { id: "file_policy_handbook", type: "Files", name: "Employee handbook FY26", parentId: "folder_policies" },
      { id: "file_eng_runbook", type: "Files", name: "Platform on-call runbook", parentId: "folder_engineering_docs" }
    ],
    conn_github: [
      { id: "org_tartanhq", type: "Organizations", name: "tartanhq", parentId: null },
      { id: "repo_frontend", type: "Repositories", name: "frontend-app", parentId: "org_tartanhq" },
      { id: "repo_backend", type: "Repositories", name: "backend-services", parentId: "org_tartanhq" },
      { id: "repo_infra", type: "Repositories", name: "infrastructure", parentId: "org_tartanhq" },
      { id: "repo_internal", type: "Repositories", name: "internal-tools", parentId: "org_tartanhq" },
      { id: "gh_prs", type: "Pull Requests", name: "Open pull requests", parentId: "org_tartanhq" }
    ],
    conn_zoho: [
      { id: "entity_india", type: "Accounts", name: "India Entity", parentId: null },
      { id: "accounts_master", type: "Accounts", name: "Accounts", parentId: "entity_india" },
      { id: "invoices_india", type: "Invoices", name: "Invoices", parentId: "entity_india" },
      { id: "payments_india", type: "Payments", name: "Payments", parentId: "entity_india" }
    ],
    conn_confluence: [
      { id: "space_finance", type: "Spaces", name: "Finance Space", parentId: null },
      { id: "space_engineering", type: "Spaces", name: "Engineering Space", parentId: null },
      { id: "space_hr", type: "Spaces", name: "HR Policies", parentId: null },
      { id: "space_support", type: "Spaces", name: "Customer Support Knowledge Base", parentId: null },
      { id: "page_qbr", type: "Pages", name: "Quarterly finance review", parentId: "space_finance" },
      { id: "page_onboarding", type: "Pages", name: "Employee onboarding", parentId: "space_hr" },
      { id: "page_support_playbook", type: "Pages", name: "Refund escalation playbook", parentId: "space_support" },
      { id: "page_eng_architecture", type: "Pages", name: "Platform architecture decisions", parentId: "space_engineering" }
    ]
  };
}

function employees() {
  return [
    ["emp_rahul", "EMP-1001", "Rahul Menon", "rahul.menon@tartanhq.com", "Finance", "Finance Manager", "M3", "Bengaluru", "Full-time", "Active", "Aditi Rao", "okta_rahul", "rahul.menon", ["role_finance_manager"]],
    ["emp_aditi", "EMP-1002", "Aditi Rao", "aditi.rao@tartanhq.com", "Finance", "Director Finance", "M5", "Mumbai", "Full-time", "Active", "Meera Iyer", "okta_aditi", "aditi-rao", ["role_finance_manager"]],
    ["emp_sana", "EMP-1003", "Sana Khan", "sana.khan@tartanhq.com", "Support", "Support Agent", "L2", "Pune", "Full-time", "Active", "Vikram Sethi", "okta_sana", "sana-khan", ["role_support_agent"]],
    ["emp_vikram", "EMP-1004", "Vikram Sethi", "vikram.sethi@tartanhq.com", "Support", "Support Lead", "M2", "Pune", "Full-time", "Active", "Meera Iyer", "okta_vikram", "vikram-sethi", ["role_support_agent"]],
    ["emp_ishaan", "EMP-1005", "Ishaan Mehta", "ishaan.mehta@tartanhq.com", "Engineering", "Engineering Lead", "M3", "Bengaluru", "Full-time", "Active", "Neha Kapoor", "okta_ishaan", "ishaan-mehta", ["role_engineering_lead"]],
    ["emp_neha", "EMP-1006", "Neha Kapoor", "neha.kapoor@tartanhq.com", "Engineering", "VP Engineering", "M5", "Bengaluru", "Full-time", "Active", "Meera Iyer", "okta_neha", "neha-kapoor", ["role_engineering_lead"]],
    ["emp_priya", "EMP-1007", "Priya Nair", "priya.nair@tartanhq.com", "Human Resources", "HR Administrator", "M2", "Delhi", "Full-time", "Active", "Meera Iyer", "okta_priya", "priya-nair", ["role_hr_admin"]],
    ["emp_kabir", "EMP-1008", "Kabir Sharma", "kabir.sharma@tartanhq.com", "Sales", "Account Executive", "L3", "Mumbai", "Full-time", "Active", "Meera Iyer", "okta_kabir", "kabir-sharma", ["role_general_employee"]],
    ["emp_tanya", "EMP-1009", "Tanya Bose", "tanya.bose@tartanhq.com", "Finance", "Accounts Analyst", "L2", "Chennai", "Full-time", "Active", "Rahul Menon", "okta_tanya", "tanya-bose", ["role_general_employee"]],
    ["emp_omar", "EMP-1010", "Omar Farooq", "omar.farooq@tartanhq.com", "Engineering", "Backend Engineer", "L3", "Hyderabad", "Full-time", "Active", "Ishaan Mehta", "okta_omar", "omar-farooq", ["role_general_employee"]],
    ["emp_jia", "EMP-1011", "Jia Fernandes", "jia.fernandes@tartanhq.com", "Contractors", "Data Consultant", "C1", "Remote", "Contractor", "Active", "Rahul Menon", "okta_jia", "jia-fernandes", ["role_contractor"]],
    ["emp_rohan", "EMP-1012", "Rohan Das", "rohan.das@tartanhq.com", "Support", "Support Contractor", "C1", "Remote", "Contractor", "Inactive", "Vikram Sethi", "okta_rohan", "rohan-das", ["role_contractor"]]
  ].map(([idValue, employeeId, name, workEmail, department, designation, grade, location, employmentType, employmentStatus, manager, iamUserId, githubUsername, roleIds]) => ({
    id: idValue,
    employeeId,
    name,
    workEmail,
    department,
    designation,
    grade,
    location,
    employmentType,
    employmentStatus,
    manager,
    hrmsSource: "Darwinbox",
    iamIdentity: iamUserId,
    hyperContextPrincipalId: `hcp_${employeeId.toLowerCase().replace("-", "_")}`,
    mappings: {
      hrmsEmployeeId: employeeId,
      workEmail,
      iamUserId,
      googleUserId: workEmail,
      jiraAccountId: `${name.toLowerCase().replaceAll(" ", ".")}:jira`,
      githubUsername
    },
    roleIds,
    assignmentSource: roleIds.includes("role_contractor") ? "CSV Import" : "HRMS Rule",
    accessStatus: employmentStatus === "Active" ? "Active" : "Revoked",
    lastEvaluated: daysAgo(roleIds.includes("role_contractor") ? 4 : 1)
  }));
}

function assignmentRules() {
  return [
    {
      id: "rule_finance_m2",
      name: "Finance managers M2+",
      roleId: "role_finance_manager",
      source: "HRMS",
      conditions: "Department = Finance AND Grade >= M2 AND Employment Status = Active",
      matchingEmployeeIds: ["emp_rahul", "emp_aditi"],
      lifecycleEvents: ["Joiner", "Mover"],
      priority: 10,
      status: "Active",
      lastEvaluated: daysAgo(1)
    },
    {
      id: "rule_support_active",
      name: "Active support team",
      roleId: "role_support_agent",
      source: "HRMS",
      conditions: "Department = Support AND Employment Status = Active",
      matchingEmployeeIds: ["emp_sana", "emp_vikram"],
      lifecycleEvents: ["Joiner", "Mover", "Leaver"],
      priority: 20,
      status: "Active",
      lastEvaluated: daysAgo(1)
    },
    {
      id: "rule_engineering_leads",
      name: "Engineering leads",
      roleId: "role_engineering_lead",
      source: "IAM",
      conditions: "IAM Group = github-maintainers",
      matchingEmployeeIds: ["emp_ishaan", "emp_neha"],
      lifecycleEvents: ["Joiner", "Mover", "Leaver"],
      priority: 30,
      status: "Active",
      lastEvaluated: daysAgo(2)
    }
  ];
}

function auditEvents() {
  return [
    ["Role Created", "Role", "Finance Manager", "Aditi Rao", "HRMS", "Accounting", "Zoho Books", "India Zoho Books", daysAgo(18), "Created Finance Manager from HRMS rule"],
    ["Permission Granted", "Role", "Engineering Lead", "Neha Kapoor", "Manual", "Developer Tools", "GitHub", "TartanHQ GitHub", daysAgo(12), "Allowed read and merge pull requests"],
    ["Resource Scope Updated", "Role", "Support Agent", "Vikram Sethi", "Manual", "Ticketing", "Jira", "Production Jira", daysAgo(8), "Limited SUPPORT project scope"],
    ["IAM Connected", "IAM Provider", "Okta", "Priya Nair", "IAM", "", "", "", daysAgo(5), "Connected Okta in simulation mode"],
    ["Source Provisioning Completed", "Connection", "Finance Google Workspace", "Aditi Rao", "Source", "Storage", "Google Drive", "Finance Google Workspace", daysAgo(3), "Provisioned Google Drive viewer groups"],
    ["Agent Permission Changed", "Agent", "Support Triage Agent", "Vikram Sethi", "Manual", "Ticketing", "Jira", "Production Jira", daysAgo(1), "Changed high-risk actions to require approval"]
  ].map(([eventType, principalType, principal, performedBy, source, category, tool, connection, timestamp, summary]) => ({
    id: id("audit"),
    eventType,
    principalType,
    principal,
    performedBy,
    source,
    category,
    tool,
    connection,
    timestamp,
    before: "Previous policy snapshot",
    after: summary,
    summary
  }));
}

function agents() {
  return [
    {
      id: "agent_support_triage",
      name: "Support Triage Agent",
      agentId: "AGT-SUPPORT-01",
      type: "Delegated Agent",
      purpose: "Summarize and route new support tickets.",
      businessOwner: "Vikram Sethi",
      technicalOwner: "Ishaan Mehta",
      allowedTools: ["Jira", "Confluence"],
      allowedConnectionIds: ["conn_jira", "conn_confluence"],
      allowedActions: ["Search", "Read", "Summarize", "Add comment"],
      riskLevel: "Medium",
      approvalPolicy: "Approval for high-risk actions",
      status: "Active",
      expiry: "2026-12-31",
      lastUsed: daysAgo(1),
      restrictions: { dataClassification: "Internal", maxRecords: 100, memoryRetention: "7 days", externalNetwork: "Blocked" }
    },
    {
      id: "agent_finance_analysis",
      name: "Finance Analysis Agent",
      agentId: "AGT-FIN-02",
      type: "Delegated Agent",
      purpose: "Analyze invoices and payment aging.",
      businessOwner: "Rahul Menon",
      technicalOwner: "Neha Kapoor",
      allowedTools: ["Zoho Books", "Google Drive"],
      allowedConnectionIds: ["conn_zoho", "conn_drive"],
      allowedActions: ["Search", "Read", "Summarize", "Aggregate", "Export"],
      riskLevel: "High",
      approvalPolicy: "Approval for medium-risk actions",
      status: "Active",
      expiry: "2026-10-01",
      lastUsed: daysAgo(2),
      restrictions: { dataClassification: "Confidential", maxRecords: 250, memoryRetention: "No retention", externalNetwork: "Blocked" }
    },
    {
      id: "agent_hr_assistant",
      name: "HR Assistant",
      agentId: "AGT-HR-03",
      type: "Autonomous Agent",
      purpose: "Draft HR responses from approved policy pages.",
      businessOwner: "Priya Nair",
      technicalOwner: "Ishaan Mehta",
      allowedTools: ["Darwinbox", "Confluence"],
      allowedConnectionIds: ["conn_darwinbox", "conn_confluence"],
      allowedActions: ["Search", "Read", "Summarize", "Draft response"],
      riskLevel: "Medium",
      approvalPolicy: "Require reason",
      status: "Draft",
      expiry: "2026-11-15",
      lastUsed: "",
      restrictions: { dataClassification: "Restricted", maxRecords: 50, memoryRetention: "No retention", externalNetwork: "Blocked" }
    }
  ];
}

/**
 * Observed native access — "the ceiling".
 *
 * What each tool itself grants a person's account today, independent of any
 * HyperContext role. In production a connector produces this by reading native
 * ACLs (readNativeAccess); here a baseline is derived from role grants so the
 * seeded demo keeps working, then patched with the deltas below so every
 * intersection outcome is represented:
 *
 *   remove → role grants it, the tool does not  → limited by ceiling
 *   add    → the tool grants it, no role does   → limited by role (and excess native access)
 */
const observedAccessDeltas = {
  emp_rahul: {
    remove: { conn_zoho: { Invoices: ["Export invoices"], Accounts: ["Export accounts"] } },
    add: {
      conn_zoho: { Invoices: { actions: ["Void invoices"] } },
      conn_drive: { Files: { actions: ["Delete file"] }, Folders: { actions: ["Manage folder permissions"] } }
    }
  },
  emp_aditi: {
    add: { conn_zoho: { Payments: { actions: ["Refund payments"] } } }
  },
  emp_sana: {
    add: {
      conn_jira: {
        // Sana's Jira account can see the finance project natively; the role narrows her to support.
        Tickets: { resourceIds: ["jira_fin", "tickets_finance"], actions: ["Transition ticket"] },
        Comments: { actions: ["View internal comments"] }
      }
    }
  },
  emp_vikram: {
    add: { conn_jira: { Tickets: { actions: ["Transition ticket"] } } }
  },
  emp_ishaan: {
    // Branch protection in GitHub means the merge right the role grants does not actually exist.
    remove: { conn_github: { "Pull Requests": ["Merge pull request"] } },
    add: { conn_github: { Repositories: { actions: ["Delete repository"] } } }
  },
  emp_neha: {
    add: { conn_github: { Organizations: { actions: ["Manage organization"] } } }
  },
  emp_priya: {
    remove: { conn_darwinbox: { Employees: ["Export employee data"] } },
    // Darwinbox itself would show Priya bank details; the HR Administrator role withholds them.
    add: { conn_darwinbox: { Employees: { actions: ["View bank details"] } } }
  },
  emp_jia: {
    add: {
      conn_drive: { Files: { actions: ["Read file content", "Download file"] } },
      conn_confluence: { Pages: { actions: ["Export page"] } }
    }
  },
  emp_kabir: { add: { conn_drive: { Files: { actions: ["Download file"] } } } },
  emp_tanya: { add: { conn_drive: { Files: { actions: ["Download file"] } } } },
  emp_omar: { add: { conn_drive: { Files: { actions: ["Download file"] } } } }
};

function deriveObservedAccess(roleList, employeeList) {
  const map = {};
  employeeList.forEach((employee) => {
    const rows = new Map();
    const upsert = (connectionId, resourceType, resourceIds, actions) => {
      const key = `${connectionId}|${resourceType}`;
      const row = rows.get(key) || { connectionId, resourceType, resourceIds: [], actions: [] };
      resourceIds.forEach((resourceId) => {
        if (resourceId && !row.resourceIds.includes(resourceId)) row.resourceIds.push(resourceId);
      });
      actions.forEach((action) => {
        if (!row.actions.includes(action)) row.actions.push(action);
      });
      rows.set(key, row);
    };

    roleList
      .filter((role) => employee.roleIds.includes(role.id))
      .forEach((role) => {
        role.permissions.forEach((permission) => {
          Object.entries(permission.matrix).forEach(([resourceType, actions]) => {
            const allowed = Object.entries(actions).filter(([, effect]) => effect === "allow").map(([name]) => name);
            if (allowed.length) upsert(permission.connectionId, resourceType, permission.resourceScope.resourceIds || [], allowed);
          });
        });
      });

    const delta = observedAccessDeltas[employee.id];
    Object.entries(delta?.add || {}).forEach(([connectionId, byResourceType]) => {
      Object.entries(byResourceType).forEach(([resourceType, spec]) => {
        upsert(connectionId, resourceType, spec.resourceIds || [], spec.actions || []);
      });
    });
    Object.entries(delta?.remove || {}).forEach(([connectionId, byResourceType]) => {
      Object.entries(byResourceType).forEach(([resourceType, actions]) => {
        const row = rows.get(`${connectionId}|${resourceType}`);
        if (row) row.actions = row.actions.filter((action) => !actions.includes(action));
      });
    });

    map[employee.id] = [...rows.values()].filter((row) => row.actions.length);
  });
  return map;
}

export function createDemoState() {
  const connections = [
    makeConnection({ id: "conn_darwinbox", category: "HRMS", tool: "Darwinbox", name: "Darwinbox" }),
    makeConnection({ id: "conn_jira", category: "Ticketing", tool: "Jira", name: "Production Jira" }),
    makeConnection({ id: "conn_drive", category: "Storage", tool: "Google Drive", name: "Finance Google Workspace" }),
    makeConnection({ id: "conn_github", category: "Developer Tools", tool: "GitHub", name: "TartanHQ GitHub" }),
    makeConnection({ id: "conn_zoho", category: "Accounting", tool: "Zoho Books", name: "India Zoho Books" }),
    makeConnection({ id: "conn_confluence", category: "Knowledge Base", tool: "Confluence", name: "Company Confluence" })
  ];
  const byId = Object.fromEntries(connections.map((connection) => [connection.id, connection]));
  const demoRoles = [
    {
      id: "role_finance_manager",
      name: "Finance Manager",
      code: "FIN-MGR",
      description: "Finance leaders who can review finance records and manage approval workflows.",
      owner: "Aditi Rao",
      source: "HRMS Rule",
      status: "Active",
      assignmentMethod: "Automatic",
      assignedEmployeeIds: ["emp_rahul", "emp_aditi"],
      permissions: [
        grant(byId.conn_zoho, { Accounts: ["Search accounts", "View accounts", "Export accounts"], Invoices: ["Search invoices", "View invoices", "Create invoices", "Approve invoices", "Export invoices"], Payments: ["Search payments", "View payments", "Approve payments"] }, { resourceScope: { resourceIds: ["entity_india", "accounts_master", "invoices_india", "payments_india"] }, conditions: { approvalRequired: true, approvalAmount: "250000", maxRecords: 1000 }, fieldRestrictions: { "Bank account number": "Masked", "Tax identifier": "Visible", "Payment details": "Masked" } }),
        grant(byId.conn_drive, { Drives: ["View drive"], Folders: ["View folder", "Share folder"], Files: ["Search files", "View file metadata", "Read file content", "Download file", "Export file"] }, { resourceScope: { resourceIds: ["drive_finance", "folder_india_finance", "folder_audit", "file_invoice_pack", "file_audit_report"] }, provisionToSource: true, sourceProvisioningStatus: "Provisioned in Source", fieldRestrictions: { "External sharing": "Masked" } }),
        grant(byId.conn_confluence, { Spaces: ["View space"], Pages: ["Search pages", "View page"] }, { resourceScope: { resourceIds: ["space_finance", "page_qbr"] } })
      ]
    },
    {
      id: "role_support_agent",
      name: "Support Agent",
      code: "SUP-AGT",
      description: "Frontline support staff with scoped ticket and knowledge-base access.",
      owner: "Vikram Sethi",
      source: "IAM Group",
      status: "Active",
      assignmentMethod: "Mixed",
      assignedEmployeeIds: ["emp_sana", "emp_vikram"],
      permissions: [
        grant(byId.conn_jira, { Projects: ["View project"], Tickets: ["Search tickets", "View ticket", "Create ticket", "Edit ticket", "Assign ticket"], Comments: ["View comments", "Add comments"], Attachments: ["View attachments", "Download attachments"] }, { resourceScope: { resourceIds: ["jira_support", "tickets_support"] }, fieldRestrictions: { "Internal comments": "Hidden", "Attachment URLs": "Masked", "Customer personal information": "Masked" } }),
        grant(byId.conn_confluence, { Spaces: ["View space"], Pages: ["Search pages", "View page"], Comments: ["View comments", "Add comments"] }, { resourceScope: { resourceIds: ["space_support", "page_support_playbook"] } })
      ]
    },
    {
      id: "role_engineering_lead",
      name: "Engineering Lead",
      code: "ENG-LEAD",
      description: "Engineering owners who review code, merge pull requests and manage engineering spaces.",
      owner: "Neha Kapoor",
      source: "IAM Group",
      status: "Active",
      assignmentMethod: "Automatic",
      assignedEmployeeIds: ["emp_ishaan", "emp_neha"],
      permissions: [
        grant(byId.conn_github, { Organizations: ["View organization"], Repositories: ["View repository", "Read code", "Push code", "Manage repository"], Issues: ["View issue", "Create issue", "Edit issue", "Close issue"], "Pull Requests": ["View pull request", "Create pull request", "Review pull request", "Merge pull request"] }, { resourceScope: { resourceIds: ["org_tartanhq", "repo_frontend", "repo_backend", "repo_internal", "gh_prs"] }, provisionToSource: true, sourceProvisioningStatus: "Pending Provisioning" }),
        grant(byId.conn_confluence, { Spaces: ["View space"], Pages: ["Search pages", "View page", "Create page", "Edit page"], Comments: ["View comments", "Add comments"] }, { resourceScope: { resourceIds: ["space_engineering", "page_eng_architecture"] } })
      ]
    },
    {
      id: "role_hr_admin",
      name: "HR Administrator",
      code: "HR-ADMIN",
      description: "HR operations administrators with employee data access and restricted compensation controls.",
      owner: "Priya Nair",
      source: "Manually Created",
      status: "Active",
      assignmentMethod: "Manual",
      assignedEmployeeIds: ["emp_priya"],
      permissions: [
        grant(byId.conn_darwinbox, { Employees: ["Search employees", "View employee profile", "View employment information", "View compensation", "Update employee profile", "Export employee data"], Employment: ["Read metadata", "Read content", "Update"], Attendance: ["Search", "Read content", "Aggregate"] }, { resourceScope: { resourceIds: ["emp_all", "emp_hr", "emp_finance", "attendance_all"] }, fieldRestrictions: { Salary: "Visible", "Bank details": "Hidden", "Identity numbers": "Masked", "Personal address": "Masked" }, conditions: { managedDeviceRequired: true, reasonRequired: true } })
      ]
    },
    {
      id: "role_general_employee",
      name: "General Employee",
      code: "EMP-GEN",
      description: "System-defined baseline access to employee policies and self-service knowledge.",
      owner: "System",
      source: "System Defined",
      status: "Active",
      assignmentMethod: "Automatic",
      assignedEmployeeIds: ["emp_kabir", "emp_tanya", "emp_omar"],
      permissions: [
        grant(byId.conn_confluence, { Spaces: ["View space"], Pages: ["Search pages", "View page"], Comments: ["View comments"] }, { resourceScope: { resourceIds: ["space_hr", "page_onboarding"] } }),
        grant(byId.conn_drive, { Folders: ["View folder"], Files: ["Search files", "View file metadata", "Read file content"] }, { resourceScope: { resourceIds: ["folder_policies", "file_policy_handbook"] }, fieldRestrictions: { "File download": "Hidden", "External sharing": "Hidden" } })
      ]
    },
    {
      id: "role_contractor",
      name: "Contractor",
      code: "CONTRACTOR",
      description: "Restricted external-worker access with explicit deny on exports and sharing.",
      owner: "Priya Nair",
      source: "CSV Import",
      status: "Active",
      assignmentMethod: "Manual",
      assignedEmployeeIds: ["emp_jia", "emp_rohan"],
      permissions: [
        grant(byId.conn_confluence, { Spaces: ["View space"], Pages: ["Search pages", "View page"] }, { resourceScope: { resourceIds: ["space_engineering", "space_support", "page_eng_architecture"] }, conditions: { exportAllowed: false, externalSharingAllowed: false, maxRecords: 50, expiryDate: "2026-09-30" } }),
        grant(byId.conn_drive, { Files: ["Search files", "View file metadata"] }, { resourceScope: { resourceIds: ["folder_engineering_docs", "file_eng_runbook"] }, fieldRestrictions: { "File content": "Hidden", "File download": "Hidden", "External sharing": "Hidden" } })
      ]
    }
  ].map((role, index) => ({
    ...role,
    corporateId: "corp_tartan",
    currentCorporate: "TartanHQ India",
    createdAt: daysAgo(30 - index),
    updatedAt: daysAgo(index + 1),
    activeAssignmentRules: assignmentRules().filter((rule) => rule.roleId === role.id).length
  }));

  const demoEmployees = employees();

  return {
    version: 1,
    generatedAt: now(),
    corporate: { id: "corp_tartan", name: "TartanHQ India", referenceId: "TARTAN-IN-001" },
    currentUser: { name: "Saanvi", email: "saanvi@tartanhq.com" },
    connections,
    resources: resources(),
    roles: demoRoles,
    employees: demoEmployees,
    observedAccess: deriveObservedAccess(demoRoles, demoEmployees),
    ceilingSyncedAt: daysAgo(0.08),
    iamProviders: [{ id: "iam_okta", provider: "Okta", status: "Connected", lastSync: daysAgo(1), groupsLoaded: true }],
    iamGroups: [
      { id: "grp_finance_mgmt", providerId: "iam_okta", name: "finance-management", members: 9, mappedRoleId: "role_finance_manager" },
      { id: "grp_support_ops", providerId: "iam_okta", name: "support-operations", members: 18, mappedRoleId: "role_support_agent" },
      { id: "grp_github_maintainers", providerId: "iam_okta", name: "github-maintainers", members: 7, mappedRoleId: "role_engineering_lead" },
      { id: "grp_all_employees", providerId: "iam_okta", name: "all-employees", members: 142, mappedRoleId: "role_general_employee" }
    ],
    assignmentRules: assignmentRules(),
    temporaryAccess: [],
    restrictions: [],
    agents: agents(),
    auditEvents: auditEvents(),
    provisioningEvents: [
      { id: "prov_drive_1", connectionId: "conn_drive", status: "Completed", summary: "Google Drive groups provisioned", timestamp: daysAgo(3) },
      { id: "prov_github_1", connectionId: "conn_github", status: "Pending", summary: "GitHub team membership update queued", timestamp: daysAgo(1) }
    ],
    app: { lastRoute: "#/permissions", dismissedWarnings: [], permissionsLayerEnabled: true }
  };
}

function normalizeState(input) {
  const demo = createDemoState();
  if (!input || typeof input !== "object") return demo;
  return {
    ...demo,
    ...input,
    corporate: { ...demo.corporate, ...(input.corporate || {}) },
    currentUser: { ...demo.currentUser, ...(input.currentUser || {}) },
    app: { ...demo.app, ...(input.app || {}) },
    connections: Array.isArray(input.connections) ? input.connections : demo.connections,
    resources: { ...demo.resources, ...(input.resources || {}) },
    roles: Array.isArray(input.roles) ? input.roles : demo.roles,
    employees: Array.isArray(input.employees) ? input.employees : demo.employees,
    observedAccess: input.observedAccess && typeof input.observedAccess === "object" ? input.observedAccess : demo.observedAccess,
    ceilingSyncedAt: input.ceilingSyncedAt || demo.ceilingSyncedAt,
    iamProviders: Array.isArray(input.iamProviders) ? input.iamProviders : demo.iamProviders,
    iamGroups: Array.isArray(input.iamGroups) ? input.iamGroups : demo.iamGroups,
    assignmentRules: Array.isArray(input.assignmentRules) ? input.assignmentRules : demo.assignmentRules,
    temporaryAccess: Array.isArray(input.temporaryAccess) ? input.temporaryAccess : demo.temporaryAccess,
    restrictions: Array.isArray(input.restrictions) ? input.restrictions : demo.restrictions,
    agents: Array.isArray(input.agents) ? input.agents : demo.agents,
    auditEvents: Array.isArray(input.auditEvents) ? input.auditEvents : demo.auditEvents,
    provisioningEvents: Array.isArray(input.provisioningEvents) ? input.provisioningEvents : demo.provisioningEvents
  };
}

function canUseLocalStorage() {
  try {
    return typeof window !== "undefined" && "localStorage" in window;
  } catch {
    return false;
  }
}

function load() {
  if (!canUseLocalStorage()) return createDemoState();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const demo = createDemoState();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
    return demo;
  }
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return createDemoState();
  }
}

let state = load();
const listeners = new Set();

function persist() {
  if (canUseLocalStorage()) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function emit() {
  persist();
  listeners.forEach((listener) => listener(state));
}

export const store = {
  getState() {
    return state;
  },
  setState(nextState) {
    state = normalizeState(nextState);
    emit();
  },
  update(mutator) {
    const draft = structuredClone(state);
    mutator(draft);
    state = normalizeState(draft);
    emit();
    return state;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset() {
    state = createDemoState();
    emit();
  }
};

export function addAuditEvent(draft, event) {
  draft.auditEvents.unshift({
    id: id("audit"),
    eventType: event.eventType,
    principalType: event.principalType || "Role",
    principal: event.principal || "",
    performedBy: event.performedBy || draft.currentUser.name,
    source: event.source || "Manual",
    category: event.category || "",
    tool: event.tool || "",
    connection: event.connection || "",
    timestamp: now(),
    before: event.before || "",
    after: event.after || event.summary || "",
    summary: event.summary || event.after || ""
  });
}

export function createConnectionFromDraft(draft, form) {
  const category = getCategory(form.category);
  const tool = form.sourceTool || category.tools[0];
  const summary = getToolCapabilitySummary(tool);
  const connectionId = id("conn");
  const connectionName = form.connectionName || `${form.corporateName || draft.corporate.name} ${tool}`;
  const connection = {
    id: connectionId,
    corporateId: draft.corporate.id,
    corporateName: form.corporateName || draft.corporate.name,
    corporateReferenceId: form.corporateReferenceId || draft.corporate.referenceId,
    category: category.label,
    sourceTool: tool,
    connectionName,
    connectionNameLower: connectionName.toLowerCase(),
    contact: {
      fullName: form.fullName || "",
      email: form.email || "",
      phone: form.phone || ""
    },
    initialSyncDate: form.initialSyncDate || "",
    transferMethod: form.transferMethod || category.integrationLabel,
    modules: form.modules?.length ? form.modules : getModulesForCategory(category.label),
    dataModels: form.modules?.length ? form.modules : getModulesForCategory(category.label),
    dataScope: form.dataScope || "Selected resources only",
    syncSchedule: form.syncSchedule || "Daily at 02:00",
    availableResourceTypes: summary.availableResourceTypes,
    supportedBusinessActions: summary.supportedBusinessActions,
    sourcePermissionsCanRead: summary.sourcePermissionsReadable,
    sourcePermissionsCanUpdate: summary.sourcePermissionsUpdatable,
    sourceProvisioningCapability: summary.supportsProvisioning ? "Source Provisioning Supported" : "HyperContext Only",
    permissionState: "Unconfigured",
    defaultEffectiveAccess: "No Access",
    status: "Active",
    createdAt: now(),
    updatedAt: now()
  };
  draft.connections.unshift(connection);
  draft.resources[connectionId] = summary.availableResourceTypes.flatMap((type, index) => [
    { id: `${connectionId}_${type.toLowerCase().replace(/\s+/g, "_")}_root`, type, name: `${type} root`, parentId: null },
    { id: `${connectionId}_${type.toLowerCase().replace(/\s+/g, "_")}_sample_${index}`, type, name: `${type} sample scope`, parentId: `${connectionId}_${type.toLowerCase().replace(/\s+/g, "_")}_root` }
  ]);
  addAuditEvent(draft, {
    eventType: "Source Provisioning Started",
    principalType: "Connection",
    principal: connection.connectionName,
    category: connection.category,
    tool,
    connection: connection.connectionName,
    summary: `Created ${connection.category} connection with default No Access`
  });
  return connection;
}

export function createRoleFromDraft(draft, form, status = "Active") {
  const roleId = form.id || id("role");
  const selectedConnectionIds = form.connectionIds?.length ? form.connectionIds : [];
  const selectedEmployeeIds = form.employeeIds?.length ? form.employeeIds : [];
  const role = {
    id: roleId,
    name: form.name,
    code: form.code,
    description: form.description || "",
    owner: form.owner || draft.currentUser.name,
    source: form.source || "Manually Created",
    status,
    assignmentMethod: form.assignmentMethod || "Manual",
    corporateId: draft.corporate.id,
    currentCorporate: draft.corporate.name,
    createdAt: form.createdAt || now(),
    updatedAt: now(),
    assignedEmployeeIds: selectedEmployeeIds,
    permissions: selectedConnectionIds.map((connectionId) => {
      const connection = draft.connections.find((item) => item.id === connectionId);
      const resourceIds = form.resourceIdsByConnection?.[connectionId] || [];
      const matrix = form.matrixByConnection?.[connectionId];
      const defaultGrant = grant(connection, {}, { resourceScope: { mode: resourceIds.includes("__all__") ? "all" : "specific", resourceIds: resourceIds.filter((item) => item !== "__all__") } });
      return {
        ...defaultGrant,
        matrix: matrix || defaultGrant.matrix,
        fieldRestrictions: form.fieldRestrictions || {},
        conditions: { ...defaultGrant.conditions, ...(form.conditions || {}) },
        provisionToSource: Boolean(form.provisionToSource?.[connectionId]),
        sourceProvisioningStatus: form.provisionToSource?.[connectionId] ? "Pending Provisioning" : "Enforced in HyperContext"
      };
    }),
    activeAssignmentRules: form.ruleCount || 0
  };
  const index = draft.roles.findIndex((item) => item.id === roleId);
  if (index >= 0) draft.roles[index] = role;
  else draft.roles.unshift(role);
  draft.employees.forEach((employee) => {
    const hasRole = employee.roleIds.includes(roleId);
    if (selectedEmployeeIds.includes(employee.id) && !hasRole) employee.roleIds.push(roleId);
    if (!selectedEmployeeIds.includes(employee.id) && hasRole) employee.roleIds = employee.roleIds.filter((item) => item !== roleId);
  });
  addAuditEvent(draft, {
    eventType: status === "Draft" ? "Role Updated" : "Role Created",
    principalType: "Role",
    principal: role.name,
    summary: `${role.name} ${status === "Draft" ? "saved as draft" : "published"} with ${selectedConnectionIds.length} connection scope(s)`
  });
  return role;
}

export function duplicateRole(draft, roleId) {
  const role = draft.roles.find((item) => item.id === roleId);
  if (!role) return null;
  const copy = structuredClone(role);
  copy.id = id("role");
  copy.name = `${role.name} Copy`;
  copy.code = `${role.code}-COPY`;
  copy.source = "Manually Created";
  copy.status = "Draft";
  copy.createdAt = now();
  copy.updatedAt = now();
  draft.roles.unshift(copy);
  addAuditEvent(draft, { eventType: "Role Created", principal: copy.name, summary: `Duplicated from ${role.name}` });
  return copy;
}

export function toggleRoleStatus(draft, roleId) {
  const role = draft.roles.find((item) => item.id === roleId);
  if (!role) return null;
  role.status = role.status === "Disabled" ? "Active" : "Disabled";
  role.updatedAt = now();
  addAuditEvent(draft, {
    eventType: role.status === "Disabled" ? "Role Disabled" : "Role Enabled",
    principal: role.name,
    summary: `${role.name} is now ${role.status}`
  });
  return role;
}

export function deleteRole(draft, roleId) {
  const role = draft.roles.find((item) => item.id === roleId);
  if (!role || role.source === "System Defined") return false;
  draft.roles = draft.roles.filter((item) => item.id !== roleId);
  draft.employees.forEach((employee) => {
    employee.roleIds = employee.roleIds.filter((item) => item !== roleId);
  });
  addAuditEvent(draft, { eventType: "Role Disabled", principal: role.name, summary: `${role.name} deleted from prototype state` });
  return true;
}

export function addEmployeesToRole(draft, roleId, employeeIds, temporary = false) {
  const role = draft.roles.find((item) => item.id === roleId);
  if (!role) return;
  employeeIds.forEach((employeeId) => {
    if (!role.assignedEmployeeIds.includes(employeeId)) role.assignedEmployeeIds.push(employeeId);
    const employee = draft.employees.find((item) => item.id === employeeId);
    if (employee && !employee.roleIds.includes(roleId)) employee.roleIds.push(roleId);
    if (temporary) {
      draft.temporaryAccess.push({
        id: id("temp"),
        employeeId,
        roleId,
        reason: "Temporary access granted from prototype",
        effectiveFrom: new Date().toISOString().slice(0, 10),
        effectiveUntil: "2026-08-31",
        approver: draft.currentUser.name,
        approvalStatus: "Approved"
      });
    }
  });
  role.updatedAt = now();
  addAuditEvent(draft, { eventType: "Employee Added to Role", principal: role.name, summary: `${employeeIds.length} employee(s) added` });
}

export function connectIamProvider(draft, provider, mappings = {}, details = {}) {
  const providerId = id("iam");
  draft.iamProviders.unshift({
    id: providerId,
    provider,
    displayName: details.displayName || `${provider} Directory`,
    tenantDomain: details.tenantDomain || "",
    owner: details.owner || draft.currentUser.name,
    environment: details.environment || "Production",
    apiBaseUrl: details.apiBaseUrl || "",
    credentialType: details.credentialType || "OAuth Client Credentials",
    credentialConfigured: Boolean(details.clientSecret),
    clientIdSuffix: details.clientId ? details.clientId.slice(-4) : "",
    scimBaseUrl: details.scimBaseUrl || "",
    status: "Connected",
    lastSync: now(),
    groupsLoaded: true
  });
  const groupNames = {
    Okta: ["finance-management", "support-operations", "github-maintainers", "all-employees"],
    "Microsoft Entra ID (Azure AD)": ["entra-finance", "entra-support", "entra-engineering", "entra-contractors"],
    "Google Workspace": ["gws-finance", "gws-support", "gws-engineering", "gws-all"],
    "Custom OIDC / SCIM": ["scim-finance", "scim-support", "scim-engineering", "scim-all"]
  }[provider] || ["finance-management", "support-operations"];
  groupNames.forEach((name, index) => {
    draft.iamGroups.unshift({
      id: id("grp"),
      providerId,
      name,
      members: [9, 18, 7, 142][index] || 6,
      mappedRoleId: mappings[name] || ""
    });
  });
  addAuditEvent(draft, { eventType: "IAM Connected", principalType: "IAM Provider", principal: provider, source: "IAM", summary: `${provider} connected with ${details.credentialType || "OAuth Client Credentials"} in simulation mode` });
}

export function syncIamProvider(draft, providerId) {
  const provider = draft.iamProviders.find((item) => item.id === providerId);
  if (!provider) return;
  provider.lastSync = now();
  addAuditEvent(draft, { eventType: "IAM Synced", principalType: "IAM Provider", principal: provider.provider, source: "IAM", summary: `${provider.provider} sync completed` });
}

export function createAgentProfile(draft, form, status = "Active") {
  const agent = {
    id: form.id || id("agent"),
    name: form.name,
    agentId: form.agentId || `AGT-${Math.floor(Math.random() * 9000 + 1000)}`,
    type: form.type || "Delegated Agent",
    purpose: form.purpose || form.description || "",
    businessOwner: form.businessOwner || draft.currentUser.name,
    technicalOwner: form.technicalOwner || "Platform Engineering",
    allowedTools: form.allowedTools || [],
    allowedConnectionIds: form.allowedConnectionIds || [],
    allowedActions: form.allowedActions || [],
    riskLevel: form.riskLevel || "Medium",
    approvalPolicy: form.approvalPolicy || "Approval for high-risk actions",
    status,
    expiry: form.expiry || "",
    lastUsed: "",
    restrictions: form.restrictions || { dataClassification: "Internal", maxRecords: 100, memoryRetention: "No retention", externalNetwork: "Blocked" }
  };
  const index = draft.agents.findIndex((item) => item.id === agent.id);
  if (index >= 0) draft.agents[index] = agent;
  else draft.agents.unshift(agent);
  addAuditEvent(draft, { eventType: "Agent Created", principalType: "Agent", principal: agent.name, summary: `${agent.name} ${status === "Draft" ? "saved as draft" : "published"}` });
  return agent;
}

export function toggleAgentStatus(draft, agentId) {
  const agent = draft.agents.find((item) => item.id === agentId);
  if (!agent) return;
  agent.status = agent.status === "Disabled" ? "Active" : "Disabled";
  addAuditEvent(draft, { eventType: agent.status === "Disabled" ? "Agent Disabled" : "Agent Permission Changed", principalType: "Agent", principal: agent.name, summary: `${agent.name} is now ${agent.status}` });
}

export function togglePermissionsLayer(draft) {
  draft.app.permissionsLayerEnabled = !draft.app.permissionsLayerEnabled;
  addAuditEvent(draft, {
    eventType: draft.app.permissionsLayerEnabled ? "Permissions Layer Enabled" : "Permissions Layer Disabled",
    principalType: "System",
    principal: "HyperContext Decision Service",
    source: "Manual",
    summary: draft.app.permissionsLayerEnabled
      ? "Permissions layer enabled — Decision Service now evaluates every request."
      : "Permissions layer disabled — every request now resolves to default-deny."
  });
  return draft.app.permissionsLayerEnabled;
}
