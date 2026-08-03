export const categories = [
  {
    id: "hrms",
    label: "HRMS",
    integrationLabel: "HRMS Integration",
    description: "Connect an HRMS source to sync employee, employment, payroll and attendance data.",
    tools: ["Darwinbox", "GreytHR", "Workday"],
    modules: ["Employees", "Employment", "Payroll", "Attendance"]
  },
  {
    id: "ticketing",
    label: "Ticketing",
    integrationLabel: "Ticketing Integration",
    description: "Connect a ticketing platform to govern service desks, tickets, comments and attachments.",
    tools: ["Jira", "Freshdesk", "Zendesk", "ServiceNow"],
    modules: ["Tickets", "Users", "Teams", "Comments", "Attachments", "SLA"]
  },
  {
    id: "accounting",
    label: "Accounting",
    integrationLabel: "Accounting Integration",
    description: "Connect accounting systems for accounts, invoices, payments and approval workflows.",
    tools: ["Zoho Books", "QuickBooks Online", "Xero"],
    modules: ["Accounts", "Invoices", "Payments"]
  },
  {
    id: "storage",
    label: "Storage",
    integrationLabel: "Storage Integration",
    description: "Connect storage providers to manage access to drives, folders, files and sharing.",
    tools: ["Google Drive", "Microsoft OneDrive", "Dropbox"],
    modules: ["Drives", "Folders", "Files", "Permissions"]
  },
  {
    id: "knowledge",
    label: "Knowledge Base",
    integrationLabel: "Knowledge Base Integration",
    description: "Connect knowledge systems for spaces, pages, collections, comments and attachments.",
    tools: ["Confluence", "Notion", "SharePoint"],
    modules: ["Spaces", "Collections", "Pages", "Comments", "Attachments"]
  },
  {
    id: "devtools",
    label: "Developer Tools",
    integrationLabel: "Developer Tools Integration",
    description: "Connect developer platforms for organizations, repositories, teams, issues and code workflows.",
    tools: ["GitHub", "GitLab", "Bitbucket"],
    modules: ["Organizations", "Repositories", "Teams", "Issues", "Pull Requests", "Commits"]
  }
];

const action = (name, risk = "Low", options = {}) => ({
  name,
  risk,
  supported: options.supported !== false,
  provisionable: Boolean(options.provisionable),
  hypercontextOnly: Boolean(options.hypercontextOnly),
  description: options.description || ""
});

export const genericActions = [
  "Discover",
  "List",
  "Search",
  "Read metadata",
  "Read content",
  "Aggregate",
  "Export",
  "Create",
  "Update",
  "Delete",
  "Approve",
  "Execute",
  "Manage permissions"
];

export const permissionCatalogue = {
  "Google Drive": {
    category: "Storage",
    sourcePermissionsReadable: true,
    sourcePermissionsUpdatable: true,
    supportsProvisioning: true,
    resourceTypes: {
      Drives: [
        action("View drive", "Low", { provisionable: true }),
        action("Manage drive", "Critical", { provisionable: true }),
        action("Aggregate", "Low", { hypercontextOnly: true })
      ],
      Folders: [
        action("View folder", "Low", { provisionable: true }),
        action("Create folder", "Medium", { provisionable: true }),
        action("Edit folder", "Medium", { provisionable: true }),
        action("Delete folder", "Critical", { provisionable: true }),
        action("Move folder", "Medium", { provisionable: true }),
        action("Share folder", "High", { provisionable: true }),
        action("Manage folder permissions", "Critical", { provisionable: true })
      ],
      Files: [
        action("Search files", "Low"),
        action("View file metadata", "Low"),
        action("Read file content", "Medium", { provisionable: true }),
        action("Download file", "Medium", { provisionable: true }),
        action("Upload file", "Medium", { provisionable: true }),
        action("Edit file", "Medium", { provisionable: true }),
        action("Delete file", "Critical", { provisionable: true }),
        action("Move file", "Medium", { provisionable: true }),
        action("Share file", "High", { provisionable: true }),
        action("Manage file permissions", "Critical", { provisionable: true }),
        action("Export file", "High", { hypercontextOnly: true })
      ]
    }
  },
  Jira: {
    category: "Ticketing",
    sourcePermissionsReadable: true,
    sourcePermissionsUpdatable: false,
    supportsProvisioning: false,
    resourceTypes: {
      Projects: [action("View project", "Low"), action("Manage project", "Critical")],
      Tickets: [
        action("Search tickets", "Low"),
        action("View ticket", "Low"),
        action("Create ticket", "Medium"),
        action("Edit ticket", "Medium"),
        action("Assign ticket", "Medium"),
        action("Transition ticket", "High"),
        action("Delete ticket", "Critical"),
        action("Export tickets", "High", { hypercontextOnly: true })
      ],
      Comments: [
        action("View comments", "Low"),
        action("Add comments", "Medium"),
        action("Edit comments", "Medium"),
        action("Delete comments", "High"),
        action("View internal comments", "High")
      ],
      Attachments: [
        action("View attachments", "Low"),
        action("Download attachments", "Medium"),
        action("Upload attachments", "Medium"),
        action("Delete attachments", "High")
      ]
    }
  },
  GitHub: {
    category: "Developer Tools",
    sourcePermissionsReadable: true,
    sourcePermissionsUpdatable: true,
    supportsProvisioning: true,
    resourceTypes: {
      Organizations: [action("View organization", "Low", { provisionable: true }), action("Manage organization", "Critical", { provisionable: true })],
      Repositories: [
        action("View repository", "Low", { provisionable: true }),
        action("Read code", "Medium", { provisionable: true }),
        action("Push code", "High", { provisionable: true }),
        action("Manage repository", "Critical", { provisionable: true }),
        action("Delete repository", "Critical", { provisionable: true })
      ],
      Issues: [
        action("View issue", "Low"),
        action("Create issue", "Medium"),
        action("Edit issue", "Medium"),
        action("Close issue", "Medium"),
        action("Delete issue", "High")
      ],
      "Pull Requests": [
        action("View pull request", "Low"),
        action("Create pull request", "Medium"),
        action("Review pull request", "Medium"),
        action("Merge pull request", "High", { provisionable: true }),
        action("Close pull request", "Medium")
      ],
      Commits: [action("Search", "Low"), action("Read metadata", "Low"), action("Read content", "Medium"), action("Aggregate", "Low")]
    }
  },
  "Zoho Books": {
    category: "Accounting",
    sourcePermissionsReadable: false,
    sourcePermissionsUpdatable: false,
    supportsProvisioning: false,
    resourceTypes: {
      Accounts: [
        action("Search accounts", "Low"),
        action("View accounts", "Low"),
        action("Create accounts", "Medium"),
        action("Edit accounts", "Medium"),
        action("Deactivate accounts", "High"),
        action("Export accounts", "High", { hypercontextOnly: true })
      ],
      Invoices: [
        action("Search invoices", "Low"),
        action("View invoices", "Medium"),
        action("Create invoices", "Medium"),
        action("Edit invoices", "Medium"),
        action("Send invoices", "High"),
        action("Approve invoices", "High"),
        action("Void invoices", "Critical"),
        action("Delete invoices", "Critical"),
        action("Export invoices", "High", { hypercontextOnly: true })
      ],
      Payments: [
        action("Search payments", "Low"),
        action("View payments", "Medium"),
        action("Create payments", "High"),
        action("Edit payments", "High"),
        action("Approve payments", "Critical"),
        action("Refund payments", "Critical"),
        action("Delete payments", "Critical"),
        action("Export payments", "High", { hypercontextOnly: true })
      ]
    }
  },
  Darwinbox: {
    category: "HRMS",
    sourcePermissionsReadable: true,
    sourcePermissionsUpdatable: false,
    supportsProvisioning: false,
    resourceTypes: {
      Employees: [
        action("Search employees", "Low"),
        action("View employee profile", "Low"),
        action("View employment information", "Low"),
        action("View compensation", "High"),
        action("View bank details", "Critical"),
        action("View identity details", "High"),
        action("Update employee profile", "High"),
        action("Update employment information", "High"),
        action("Update compensation", "Critical"),
        action("Export employee data", "High", { hypercontextOnly: true })
      ],
      Employment: [action("Read metadata", "Low"), action("Read content", "Medium"), action("Update", "High"), action("Aggregate", "Low")],
      Payroll: [action("Read metadata", "Medium"), action("Read content", "High"), action("Export", "High"), action("Approve", "Critical")],
      Attendance: [action("Search", "Low"), action("Read content", "Low"), action("Update", "Medium"), action("Aggregate", "Low")]
    }
  },
  Confluence: {
    category: "Knowledge Base",
    sourcePermissionsReadable: true,
    sourcePermissionsUpdatable: true,
    supportsProvisioning: true,
    resourceTypes: {
      Spaces: [
        action("View space", "Low", { provisionable: true }),
        action("Create space", "Medium", { provisionable: true }),
        action("Edit space", "Medium", { provisionable: true }),
        action("Delete space", "Critical", { provisionable: true }),
        action("Manage space permissions", "Critical", { provisionable: true })
      ],
      Pages: [
        action("Search pages", "Low"),
        action("View page", "Low", { provisionable: true }),
        action("Create page", "Medium", { provisionable: true }),
        action("Edit page", "Medium", { provisionable: true }),
        action("Delete page", "Critical", { provisionable: true }),
        action("Export page", "High", { hypercontextOnly: true }),
        action("Share page", "Medium", { provisionable: true })
      ],
      Comments: [
        action("View comments", "Low"),
        action("Add comments", "Medium"),
        action("Edit comments", "Medium"),
        action("Delete comments", "High")
      ],
      Attachments: [action("View attachments", "Low"), action("Download attachments", "Medium"), action("Upload attachments", "Medium"), action("Delete attachments", "High")]
    }
  }
};

const fallbackToolMap = {
  GreytHR: "Darwinbox",
  Workday: "Darwinbox",
  Freshdesk: "Jira",
  Zendesk: "Jira",
  ServiceNow: "Jira",
  "QuickBooks Online": "Zoho Books",
  Xero: "Zoho Books",
  "Microsoft OneDrive": "Google Drive",
  Dropbox: "Google Drive",
  Notion: "Confluence",
  SharePoint: "Confluence",
  GitLab: "GitHub",
  Bitbucket: "GitHub"
};

export const fieldRestrictionCatalogue = {
  HRMS: ["Salary", "Bank details", "Identity numbers", "Personal address"],
  Accounting: ["Bank account number", "Tax identifier", "Payment details"],
  Ticketing: ["Internal comments", "Attachment URLs", "Customer personal information"],
  Storage: ["File content", "File download", "External sharing"],
  "Knowledge Base": ["Confidential page content", "Comment author details", "Exported page attachments"],
  "Developer Tools": ["Repository secrets", "Protected branch writes", "Security findings"]
};

export const conditionLabels = [
  "Export blocked",
  "External sharing blocked",
  "Approval required before write actions",
  "Approval required above transaction amount",
  "Time-bound access",
  "Location restriction",
  "Employment-status restriction",
  "Managed-device requirement",
  "Temporary access",
  "Reason required before sensitive action"
];

export const sourceEnforcementStatuses = [
  "Enforced in HyperContext",
  "Provisioned in Source",
  "Pending Provisioning",
  "Manual Action Required",
  "Unsupported by Source"
];

export const agentRiskActions = {
  "Low Risk": ["Search", "Read", "Summarize", "Classify"],
  "Medium Risk": ["Draft response", "Update non-sensitive fields", "Add comment"],
  "High Risk": ["Reassign ticket", "Close ticket", "Change employee data", "Modify repository content"],
  "Critical Risk": ["Approve payment", "Delete records", "Change bank details", "Manage permissions"]
};

export function getCategory(categoryIdOrLabel) {
  return categories.find((category) => category.id === categoryIdOrLabel || category.label === categoryIdOrLabel) || categories[0];
}

export function getToolsForCategory(categoryIdOrLabel) {
  return getCategory(categoryIdOrLabel).tools;
}

export function getModulesForCategory(categoryIdOrLabel) {
  return getCategory(categoryIdOrLabel).modules;
}

export function getToolCapability(tool) {
  const source = permissionCatalogue[tool] ? tool : fallbackToolMap[tool];
  return permissionCatalogue[source] || permissionCatalogue["Google Drive"];
}

export function getResourceTypesForTool(tool) {
  return Object.keys(getToolCapability(tool).resourceTypes);
}

export function getActionsForResource(tool, resourceType) {
  return getToolCapability(tool).resourceTypes[resourceType] || [];
}

export function getAvailableResourceTypes(tool) {
  return Object.keys(getToolCapability(tool).resourceTypes);
}

export function getSupportedBusinessActions(tool) {
  return [...new Set(Object.values(getToolCapability(tool).resourceTypes).flat().map((item) => item.name))];
}

export function getToolCapabilitySummary(tool) {
  const capability = getToolCapability(tool);
  return {
    availableResourceTypes: getAvailableResourceTypes(tool),
    supportedBusinessActions: getSupportedBusinessActions(tool),
    sourcePermissionsReadable: capability.sourcePermissionsReadable,
    sourcePermissionsUpdatable: capability.sourcePermissionsUpdatable,
    supportsProvisioning: capability.supportsProvisioning
  };
}
