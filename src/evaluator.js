import { getActionsForResource } from "./catalogue.js";
import { isGroupMember, rolesForEmployeeViaGroups } from "./state.js";

const normalize = (value) => String(value || "").trim().toLowerCase();

function formatObservedAt(state) {
  if (!state.ceilingSyncedAt) return "at last sync";
  const hours = (Date.now() - new Date(state.ceilingSyncedAt).getTime()) / 3600000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

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

/**
 * The observed native access ("ceiling") for one identity on one resource type —
 * what the connector last read out of the tool itself. Effective access is always
 * intersected with this, so no policy can widen access beyond the source system.
 */
export function observedAccessFor(state, employeeId, connectionId, resourceType) {
  const rows = state.observedAccess?.[employeeId] || [];
  return rows.find((row) => row.connectionId === connectionId && row.resourceType === resourceType) || null;
}

export function observedRowsFor(state, employeeId) {
  return state.observedAccess?.[employeeId] || [];
}

function ceilingCheck(state, employeeId, input) {
  const row = observedAccessFor(state, employeeId, input.connectionId, input.resourceType);
  if (!row) return { ok: false, reason: `no native access to ${input.resourceType} in this tool` };
  if (!row.actions.includes(input.action)) return { ok: false, reason: `the tool does not grant "${input.action}" to this account` };
  if (input.resourceId && row.resourceIds.length && !row.resourceIds.includes(input.resourceId)) {
    return { ok: false, reason: "the tool does not grant this account access to that specific resource" };
  }
  return { ok: true, reason: `the tool grants "${input.action}" to this account` };
}

/** Roles reach a person only through group membership — one path, no alternatives. */
export function rolesForEmployee(state, employeeId) {
  return rolesForEmployeeViaGroups(state, employeeId);
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
    step("Source Ceiling", "fail", `${connection.sourceTool} has no such action on ${input.resourceType}.`);
    return result;
  }

  const ceiling = ceilingCheck(state, employee.id, input);
  if (!ceiling.ok) {
    result.sourceBoundary = "Denied";
    result.explanation.push(`The source-system ceiling blocked this request: ${ceiling.reason}.`);
    step("Source Ceiling", "fail", `${connection.sourceTool} does not grant this to ${employee.name} — ${ceiling.reason}. Access can be narrowed below the tool's own permissions, never widened above them.`);
    return result;
  }
  result.sourceBoundary = "Allowed";
  result.explanation.push("The source-system permission boundary permits this action for this identity.");
  step("Source Ceiling", "pass", `${connection.sourceTool} grants ${employee.name} "${input.action}" on ${input.resourceType} (observed ${formatObservedAt(state)}).`);

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
  // For a delegated agent the ceiling that applies is its principal's, checked again
  // during Principal Intersection below. An autonomous agent is bounded by its own
  // allow-list plus whatever the tool supports.
  if (agent.type === "Delegated Agent" && input.actingUserId) {
    const principalCeiling = ceilingCheck(state, input.actingUserId, input);
    if (!principalCeiling.ok) {
      result.sourcePermissionResult = "Denied";
      result.explanation.push(`The requesting user's source-system ceiling blocked this: ${principalCeiling.reason}.`);
      step("Source Ceiling", "fail", `${connection.sourceTool} does not grant this to the requesting user — ${principalCeiling.reason}. A delegated agent inherits its principal's ceiling.`);
      return result;
    }
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

/**
 * Joiner / mover / leaver, driven entirely by group rules.
 *
 * A synced employee record is matched against every group's rule; the groups they
 * land in decide their roles, and the roles decide what must be provisioned in each
 * connected tool. Nothing here is role-specific or hand-coded per department.
 */
export function simulateLifecycleEvent(state, form) {
  const employee = state.employees.find((item) => item.id === form.employeeId);
  if (!employee) return null;

  const groupsFor = (record) => (state.groups || []).filter((group) => isGroupMember(record, group));
  const rolesFor = (groupList) => {
    const ids = groupList.map((group) => group.id);
    return (state.roles || []).filter((role) => role.status === "Active" && (role.groupIds || []).some((groupId) => ids.includes(groupId)));
  };

  const before = { ...employee };
  let after = { ...employee };
  if (form.eventType === "Joiner") after = { ...employee, employmentStatus: "Active" };
  if (form.eventType === "Mover") after = { ...employee, [form.changedField]: form.newValue };
  if (form.eventType === "Leaver") after = { ...employee, employmentStatus: "Terminated" };

  const groupsBefore = form.eventType === "Joiner" ? [] : groupsFor(before);
  const groupsAfter = form.eventType === "Leaver" ? [] : groupsFor(after);
  const rolesBefore = form.eventType === "Joiner" ? [] : rolesFor(groupsBefore);
  const rolesAfter = form.eventType === "Leaver" ? [] : rolesFor(groupsAfter);

  const nameOf = (items) => items.map((item) => item.name);
  const added = rolesAfter.filter((role) => !rolesBefore.some((item) => item.id === role.id));
  const removed = rolesBefore.filter((role) => !rolesAfter.some((item) => item.id === role.id));
  const retained = rolesAfter.filter((role) => rolesBefore.some((item) => item.id === role.id));

  // What has to change in each tool, derived from the grants the roles carry.
  const planFor = (roles, verb) => {
    const byConnection = new Map();
    roles.forEach((role) => (role.permissions || []).forEach((permission) => {
      const connection = state.connections.find((item) => item.id === permission.connectionId);
      if (!connection) return;
      const entry = byConnection.get(connection.id) || { connection, roles: new Set(), actions: new Set() };
      entry.roles.add(role.name);
      Object.entries(permission.matrix || {}).forEach(([resourceType, actions]) => {
        Object.entries(actions).filter(([, effect]) => effect === "allow").forEach(([action]) => entry.actions.add(`${resourceType}: ${action}`));
      });
      byConnection.set(connection.id, entry);
    }));
    return [...byConnection.values()].map((entry) => ({
      connectionName: entry.connection.connectionName,
      tool: entry.connection.sourceTool,
      category: entry.connection.category,
      verb,
      viaRoles: [...entry.roles],
      actionCount: entry.actions.size,
      writable: entry.connection.sourcePermissionsCanUpdate !== false,
      note: entry.connection.sourcePermissionsCanUpdate === false
        ? `${entry.connection.sourceTool} has no write API - this becomes a manual task.`
        : `${verb} ${entry.actions.size} action(s) in ${entry.connection.sourceTool}.`
    }));
  };

  const grantPlan = planFor(added, "Grant");
  const revokePlan = planFor(removed, "Revoke");
  const manualActions = [...grantPlan, ...revokePlan].filter((item) => !item.writable).map((item) => item.note);

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    eventType: form.eventType,
    groupsBefore: nameOf(groupsBefore),
    groupsAfter: nameOf(groupsAfter),
    groupsGained: nameOf(groupsAfter.filter((group) => !groupsBefore.some((item) => item.id === group.id))),
    groupsLost: nameOf(groupsBefore.filter((group) => !groupsAfter.some((item) => item.id === group.id))),
    rolesToAdd: nameOf(added),
    rolesToRemove: nameOf(removed),
    rolesRetained: nameOf(retained),
    grantPlan,
    revokePlan,
    manualActionsRequired: manualActions
  };
}
