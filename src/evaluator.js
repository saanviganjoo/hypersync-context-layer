import { getActionsForResource } from "./catalogue.js";

const normalize = (value) => String(value || "").trim().toLowerCase();

function connectionMatches(grant, input) {
  if (input.connectionId && grant.connectionId !== input.connectionId) return false;
  if (input.category && normalize(grant.category) !== normalize(input.category)) return false;
  if (input.tool && normalize(grant.tool) !== normalize(input.tool)) return false;
  return true;
}

function scopeMatches(grant, input) {
  if (grant.resourceScope?.mode === "all") return true;
  if (!input.resourceId) return true;
  return grant.resourceScope?.resourceIds?.includes(input.resourceId);
}

function conditionMatches(grant, employee, runtimeContext = {}) {
  const conditions = grant.conditions || {};
  const today = new Date().toISOString().slice(0, 10);
  if (conditions.effectiveDate && conditions.effectiveDate > today) return { ok: false, reason: "Access is not effective yet." };
  if (conditions.expiryDate && conditions.expiryDate < today) return { ok: false, reason: "Access has expired." };
  if (conditions.employmentStatus && conditions.employmentStatus !== "Any" && employee?.employmentStatus !== conditions.employmentStatus) {
    return { ok: false, reason: `Employment status must be ${conditions.employmentStatus}.` };
  }
  if (conditions.location && conditions.location !== "Any" && employee?.location !== conditions.location) {
    return { ok: false, reason: `Location must be ${conditions.location}.` };
  }
  if (conditions.managedDeviceRequired && runtimeContext.managedDevice === false) {
    return { ok: false, reason: "A managed device is required." };
  }
  if (conditions.reasonRequired && !runtimeContext.reason) {
    return { ok: false, reason: "A reason is required before this sensitive action." };
  }
  return { ok: true, reason: "Runtime conditions matched." };
}

function supportedBySource(tool, resourceType, actionName) {
  const actions = getActionsForResource(tool, resourceType);
  return actions.find((action) => action.name === actionName)?.supported !== false;
}

export function rolesForEmployee(state, employeeId) {
  return state.roles.filter((role) => role.assignedEmployeeIds.includes(employeeId) || state.employees.find((employee) => employee.id === employeeId)?.roleIds?.includes(role.id));
}

export function evaluateUserAccess(state, input) {
  const employee = state.employees.find((item) => item.id === input.employeeId || item.employeeId === input.employeeId || item.workEmail === input.employeeId);
  const connection = state.connections.find((item) => item.id === input.connectionId);
  const pipelineSteps = [];
  const step = (name, status, detail) => pipelineSteps.push({ step: name, status, detail });
  const result = {
    final: "Deny",
    principal: employee?.name || input.employeeId || "Unknown employee",
    sourceBoundary: "Denied",
    hyperContextPolicy: "No matching allow",
    explicitRestrictions: [],
    appliedRoles: [],
    requiredApproval: false,
    fieldRestrictions: {},
    explanation: [],
    obligations: [],
    pipelineSteps
  };

  if (state.app?.permissionsLayerEnabled === false) {
    result.explanation.push("The permissions layer is disabled, so the Decision Service is default-closed.");
    step("Decision Service", "fail", "The permissions layer is switched off; every request resolves to Deny.");
    return result;
  }

  if (!employee) {
    result.explanation.push("No employee matched the selected Employee ID or work email.");
    step("Subject Resolution", "fail", "No employee matched the selected Employee ID or work email.");
    return result;
  }
  if (employee.employmentStatus === "Terminated" || employee.employmentStatus === "Inactive") {
    result.explanation.push(`${employee.name} is ${employee.employmentStatus}; leaver rules revoke HyperContext access.`);
    step("Subject Resolution", "fail", `${employee.name} is ${employee.employmentStatus}; leaver rules revoke HyperContext access.`);
    return result;
  }
  step("Subject Resolution", "pass", `${employee.name} resolved with employment status ${employee.employmentStatus}.`);

  if (!connection || connection.status !== "Active") {
    result.explanation.push("The selected connection is unavailable or inactive.");
    step("Source Ceiling", "fail", "The selected connection is unavailable or inactive.");
    return result;
  }
  if (connection.corporateId !== state.corporate.id) {
    result.explanation.push("Tenant/corporate isolation blocked this request.");
    step("Source Ceiling", "fail", "Tenant/corporate isolation blocked this request.");
    return result;
  }
  if (!supportedBySource(connection.sourceTool, input.resourceType, input.action)) {
    result.sourceBoundary = "Denied";
    result.explanation.push("The connected source tool does not support this action.");
    step("Source Ceiling", "fail", "The connected source tool does not support this action.");
    return result;
  }
  result.sourceBoundary = "Allowed";
  result.explanation.push("The source-system permission boundary permits this category, tool and resource type.");
  step("Source Ceiling", "pass", `${connection.sourceTool} permits ${input.action} on ${input.resourceType}.`);

  const activeRoles = rolesForEmployee(state, employee.id).filter((role) => role.status === "Active");
  const matchingGrants = activeRoles.flatMap((role) =>
    role.permissions
      .filter((grant) => connectionMatches(grant, { ...input, tool: connection.sourceTool, category: connection.category }) && scopeMatches(grant, input))
      .map((grant) => ({ role, grant }))
  );

  if (!matchingGrants.length) {
    step("Role Grants", "warn", `${employee.name} has no active role granting ${input.resourceType} on ${connection.connectionName}.`);
  } else {
    step("Role Grants", "info", `${matchingGrants.length} matching grant(s) via: ${[...new Set(matchingGrants.map((item) => item.role.name))].join(", ")}.`);
  }

  let allowed = false;
  let denied = false;
  let conditionBlocked = false;
  for (const { role, grant } of matchingGrants) {
    const effect = grant.matrix?.[input.resourceType]?.[input.action] || "unset";
    if (effect === "deny") {
      denied = true;
      result.explicitRestrictions.push(`${role.name} explicitly denies ${input.action}.`);
    }
    if (effect === "allow") {
      const conditions = conditionMatches(grant, employee, input.runtimeContext);
      if (conditions.ok) {
        allowed = true;
        result.appliedRoles.push(role.name);
        result.fieldRestrictions = { ...result.fieldRestrictions, ...(grant.fieldRestrictions || {}) };
        result.requiredApproval = result.requiredApproval || Boolean(grant.conditions?.approvalRequired);
      } else {
        conditionBlocked = true;
        result.explicitRestrictions.push(`${role.name}: ${conditions.reason}`);
      }
    }
  }

  if (denied) {
    result.hyperContextPolicy = "Explicit deny";
    result.explanation.push("An explicit deny overrides every matching allow.");
    step("Deny Check", "fail", result.explicitRestrictions.join(" "));
    return result;
  }
  step("Deny Check", "pass", "No explicit deny matched.");

  if (!allowed) {
    result.explanation.push("No active role allowed the selected action after scope and runtime checks.");
    step("Conditions", conditionBlocked ? "fail" : "warn", conditionBlocked ? result.explicitRestrictions.join(" ") : "No matching allow grant to evaluate runtime conditions against.");
    return result;
  }

  result.final = "Allow";
  result.hyperContextPolicy = "Allowed by HyperContext role policy";
  result.explanation.push(`${employee.name} has a matching active role: ${result.appliedRoles.join(", ")}.`);
  step("Conditions", "pass", "Effective/expiry date, employment status, location, device and reason conditions matched.");
  if (result.requiredApproval) result.explanation.push("The action is allowed but requires approval before execution.");
  if (Object.keys(result.fieldRestrictions).length) {
    result.explanation.push("Field-level restrictions apply to the final response.");
    result.obligations = Object.entries(result.fieldRestrictions).map(([field, mode]) => `${field}: ${mode}`);
    step("Obligations", "warn", `Field restrictions apply: ${result.obligations.join(", ")}.`);
  } else {
    step("Obligations", "pass", "No field-level obligations apply.");
  }
  return result;
}

export function explainEmployeeAccess(state, employeeId) {
  const employee = state.employees.find((item) => item.id === employeeId);
  if (!employee) return [];
  const roles = rolesForEmployee(state, employeeId).filter((role) => role.status === "Active");
  const financeRule = state.assignmentRules.find((rule) => rule.roleId === "role_finance_manager");
  const firstRole = roles[0];
  const examples = [];
  if (firstRole) {
    examples.push(`${employee.name} has access because ${firstRole.name} is assigned through ${employee.assignmentSource}.`);
    examples.push(`${firstRole.name} grants scoped permissions on ${firstRole.permissions.map((permission) => permission.tool).join(", ")}.`);
    examples.push("No explicit deny applies for the displayed allow result.");
    examples.push("The source-system permission boundary is checked before HyperContext returns data or performs an action.");
  }
  if (employee.department === "Finance" && financeRule) {
    examples.unshift(`${employee.name}'s department is Finance and the ${financeRule.name} assignment rule matched.`);
  }
  if (roles.some((role) => role.id === "role_contractor")) {
    examples.push(`${employee.name} cannot export restricted data because the Contractor role blocks exports and sharing.`);
  }
  return examples;
}

export function evaluateAgentAccess(state, input) {
  const agent = state.agents.find((item) => item.id === input.agentId);
  const connection = state.connections.find((item) => item.id === input.connectionId);
  const pipelineSteps = [];
  const step = (name, status, detail) => pipelineSteps.push({ step: name, status, detail });
  const result = {
    final: "Deny",
    sourcePermissionResult: "Denied",
    userPermissionResult: "Not applicable",
    agentPermissionResult: "Denied",
    taskScopeResult: "Denied",
    approvalRequired: false,
    explanation: [],
    obligations: [],
    pipelineSteps
  };
  if (state.app?.permissionsLayerEnabled === false) {
    result.explanation.push("The permissions layer is disabled, so the Decision Service is default-closed.");
    step("Decision Service", "fail", "The permissions layer is switched off; every agent request resolves to Deny.");
    return result;
  }

  if (!agent || agent.status !== "Active") {
    result.explanation.push("The selected agent is not active.");
    step("Agent Identity", "fail", "The selected agent is not active.");
    return result;
  }
  step("Agent Identity", "pass", `${agent.name} is Active (${agent.type}).`);

  if (!connection || !agent.allowedConnectionIds.includes(connection.id)) {
    result.explanation.push("The agent policy does not include the selected connection.");
    step("Allow-List", "fail", "The agent policy does not include the selected connection.");
    return result;
  }
  step("Allow-List", "pass", `${connection.connectionName} is on the agent's allowed connections.`);

  result.sourcePermissionResult = supportedBySource(connection.sourceTool, input.resourceType, input.action) ? "Allowed" : "Denied";
  if (result.sourcePermissionResult === "Denied") {
    result.explanation.push("The source tool does not support the selected business action.");
    step("Source Ceiling", "fail", "The source tool does not support the selected business action.");
    return result;
  }
  const broadAction = input.action?.split(" ")[0];
  const actionAllowed = agent.allowedActions.includes(input.action) || agent.allowedActions.includes(broadAction) || agent.allowedActions.some((allowed) => normalize(input.action).includes(normalize(allowed)));
  if (!actionAllowed) {
    result.explanation.push("The agent's allowed-action policy does not include this business action.");
    step("Source Ceiling", "fail", "The agent's allowed-action policy does not include this business action.");
    return result;
  }
  result.agentPermissionResult = "Allowed";
  step("Source Ceiling", "pass", `${connection.sourceTool} supports ${input.action} and it is on the agent's allowed actions.`);

  const taskScope = normalize(input.taskScope || "");
  const resourceName = normalize(input.resourceName || input.resourceId || "");
  if (taskScope && resourceName && !taskScope.includes(resourceName.split(" ")[0])) {
    result.taskScopeResult = "Denied";
    result.explanation.push("The selected resource is outside the current task scope.");
    step("Task Scope", "fail", "The selected resource is outside the current task scope.");
    return result;
  }
  result.taskScopeResult = "Allowed";
  step("Task Scope", "pass", `Task scope "${input.taskScope || "unscoped"}" covers the selected resource.`);

  if (agent.type === "Delegated Agent") {
    const userResult = evaluateUserAccess(state, {
      ...input,
      employeeId: input.actingUserId,
      runtimeContext: { managedDevice: true, reason: input.reason || "Agent task" }
    });
    result.userPermissionResult = userResult.final;
    if (userResult.final !== "Allow") {
      result.explanation.push("Delegated mode intersects the requesting user's effective permission, which denied the action.");
      step("Principal Intersection", "fail", "The requesting user's own effective access denies this action; a delegated agent can never exceed its principal.");
      return result;
    }
    step("Principal Intersection", "pass", "The requesting user's effective access allows this action.");
    result.obligations = userResult.obligations || [];
  } else {
    result.userPermissionResult = "Service identity";
    step("Principal Intersection", "info", `${agent.name} acts as an autonomous service identity; there is no principal to intersect.`);
  }

  result.approvalRequired = /medium|high|dual|reason/i.test(agent.approvalPolicy) && !/no approval/i.test(agent.approvalPolicy);
  result.final = "Allow";
  result.explanation.push(`${agent.name} is allowed by agent policy, source boundary, task scope and runtime checks.`);
  if (result.approvalRequired) {
    result.explanation.push(`${agent.approvalPolicy} applies before execution.`);
    step("Approval Check", "warn", `${agent.approvalPolicy} applies before execution.`);
  } else {
    step("Approval Check", "pass", "No approval required before execution.");
  }
  return result;
}

export function simulateLifecycleEvent(state, form) {
  const employee = state.employees.find((item) => item.id === form.employeeId);
  if (!employee) return null;
  const roleIdsBefore = new Set(employee.roleIds);
  let roleIdsAfter = new Set(employee.roleIds);
  const sourceActions = [];
  const manualActions = [];
  const conflicts = [];

  if (form.eventType === "Joiner") {
    state.assignmentRules
      .filter((rule) => rule.status === "Active" && rule.lifecycleEvents.includes("Joiner"))
      .forEach((rule) => {
        if (/Finance/.test(rule.conditions) && employee.department === "Finance") roleIdsAfter.add(rule.roleId);
        if (/Support/.test(rule.conditions) && employee.department === "Support") roleIdsAfter.add(rule.roleId);
        if (/github-maintainers/.test(rule.conditions) && employee.department === "Engineering" && employee.grade.startsWith("M")) roleIdsAfter.add(rule.roleId);
      });
    sourceActions.push("Create or match HyperContext principal", "Activate HyperContext permissions");
  }

  if (form.eventType === "Mover") {
    const changedEmployee = { ...employee, [form.changedField]: form.newValue };
    roleIdsAfter = new Set(["role_general_employee"]);
    if (changedEmployee.department === "Finance" && ["M2", "M3", "M4", "M5"].includes(changedEmployee.grade)) roleIdsAfter.add("role_finance_manager");
    if (changedEmployee.department === "Support") roleIdsAfter.add("role_support_agent");
    if (changedEmployee.department === "Engineering" && changedEmployee.grade.startsWith("M")) roleIdsAfter.add("role_engineering_lead");
    sourceActions.push("Recalculate applicable roles", "Remove obsolete permissions", "Apply newly applicable permissions");
  }

  if (form.eventType === "Leaver") {
    roleIdsAfter = new Set();
    sourceActions.push("Disable HyperContext access", "Revoke active role assignments", "Revoke delegated agent access");
    manualActions.push("Create manual revocation task for Zoho Books because source provisioning is unsupported");
  }

  const rolesToAdd = [...roleIdsAfter].filter((roleId) => !roleIdsBefore.has(roleId)).map((roleId) => state.roles.find((role) => role.id === roleId)?.name).filter(Boolean);
  const rolesToRemove = [...roleIdsBefore].filter((roleId) => !roleIdsAfter.has(roleId)).map((roleId) => state.roles.find((role) => role.id === roleId)?.name).filter(Boolean);
  const rolesRetained = [...roleIdsAfter].filter((roleId) => roleIdsBefore.has(roleId)).map((roleId) => state.roles.find((role) => role.id === roleId)?.name).filter(Boolean);
  if (rolesToAdd.includes("Finance Manager") && rolesToAdd.includes("Contractor")) conflicts.push("Finance Manager and Contractor contain conflicting export policies.");

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    eventType: form.eventType,
    rolesToAdd,
    rolesToRemove,
    rolesRetained,
    permissionsGained: rolesToAdd.length ? rolesToAdd.map((role) => `${role} permissions`) : ["No new permissions"],
    permissionsRemoved: rolesToRemove.length ? rolesToRemove.map((role) => `${role} permissions`) : ["No permissions removed"],
    sourceProvisioningActions: sourceActions,
    manualActionsRequired: manualActions,
    conflictsDetected: conflicts
  };
}
