import { datasets } from "./datasets.js";
import { evaluateUserAccess } from "./evaluator.js";

export const fetchModes = {
  HRMS: { mode: "Stored / Indexed", note: "Unified schema is proven here, so records are indexed for fast structured search." },
  Ticketing: { mode: "Hybrid", note: "Light metadata is indexed for search; ticket bodies are fetched live at answer time." },
  Accounting: { mode: "Hybrid", note: "Financial line items are never stored at rest; only search metadata is indexed." },
  Storage: { mode: "Hybrid", note: "File content is large and sensitive, so only a metadata index is kept." },
  "Knowledge Base": { mode: "Hybrid", note: "Pages are semantically indexed; the full body is fetched live." },
  "Developer Tools": { mode: "Live Fetch", note: "Low chat volume, so nothing is synced — the source API is called per question." }
};

const STOP_WORDS = new Set([
  "what", "whats", "how", "why", "when", "where", "who", "which", "the", "a", "an", "is", "are", "was", "were",
  "do", "does", "did", "our", "we", "us", "my", "me", "i", "you", "for", "of", "in", "on", "at", "to", "from",
  "and", "or", "with", "about", "show", "give", "tell", "get", "list", "any", "some", "this", "that", "there",
  "it", "its", "be", "been", "can", "could", "should", "would", "have", "has", "had", "much", "many", "please",
  "look", "looking", "see", "know", "current", "currently", "right", "now", "by", "as", "up", "out", "all"
]);

function tokenize(question) {
  return String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function scoreDataset(dataset, tokens, connection) {
  if (!tokens.length) return 0;
  const haystack = `${dataset.name} ${dataset.keywords.join(" ")} ${connection?.category || ""} ${connection?.sourceTool || ""}`.toLowerCase();
  const recordText = dataset.records.map((record) => record.title).join(" ").toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (dataset.keywords.includes(token)) score += 3;
    else if (haystack.includes(token)) score += 2;
    else if (recordText.includes(token)) score += 1;
  }
  return score;
}

function maskValue(value) {
  const text = String(value ?? "");
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 6) return `•••• •••• ${digits.slice(-4)}`;
  return "•••••••• restricted";
}

/**
 * Applies the decision's field obligations to one record. Hidden fields are dropped
 * entirely — the value is never carried into the answer — and masked fields are
 * redacted. A sensitive field with no explicit obligation defaults to hidden.
 */
function applyObligations(record, fieldRestrictions) {
  const cells = record.cells.map((cell) => ({ ...cell, masked: false }));
  const masked = [];
  const hidden = [];
  (record.sensitive || []).forEach((field) => {
    const mode = fieldRestrictions?.[field.label];
    if (mode === "Visible") {
      cells.push({ ...field, masked: false });
      return;
    }
    if (mode === "Masked") {
      masked.push(field.label);
      cells.push({ label: field.label, value: maskValue(field.value), masked: true });
      return;
    }
    hidden.push(field.label);
  });
  return { cells, masked, hidden };
}

function denialHeadline(decision) {
  const steps = decision.pipelineSteps || [];
  const blocking = steps.find((item) => item.status === "fail") || steps.find((item) => item.status === "warn");
  if (blocking) return blocking.detail;
  return decision.explanation?.at(-1) || "No active role grants this resource.";
}

/**
 * Answers a question from the connected tools' record sets, running the Decision
 * Service once per resource and aggregating only the rows the asker may read. Two
 * identities asking the same question therefore see different, individually correct
 * numbers rather than one shared summary.
 */
export function answerQuestion(state, { employeeId, question, managedDevice = true, reason = "" }) {
  const employee = state.employees.find((item) => item.id === employeeId);
  const tokens = tokenize(question);
  const layerEnabled = state.app?.permissionsLayerEnabled !== false;

  const candidates = datasets
    .map((dataset) => {
      const connection = state.connections.find((item) => item.id === dataset.connectionId);
      return { dataset, connection, score: scoreDataset(dataset, tokens, connection) };
    })
    .filter((item) => item.score > 0 && item.connection)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

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
    result.excluded = candidates.map(({ dataset, connection }) => ({
      title: dataset.name,
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
    result.answer = "Nothing in the connected tools matched that question. Try naming a record type — invoices, payments, tickets, headcount, compensation, files, pages or pull requests.";
    return result;
  }

  for (const { dataset, connection } of candidates) {
    const resourceIds = [...new Set(dataset.records.map((record) => record.resourceId))];
    const permittedResources = [];
    const excludedResources = [];
    let representative = null;

    // One decision per resource, not per dataset — resource scope is where roles differ most.
    for (const resourceId of resourceIds) {
      const decision = evaluateUserAccess(state, {
        employeeId: employee.id,
        connectionId: connection.id,
        resourceType: dataset.resourceType,
        resourceId,
        action: dataset.action,
        runtimeContext: { managedDevice, reason }
      });
      const resourceName = (state.resources[connection.id] || []).find((item) => item.id === resourceId)?.name || resourceId;
      if (decision.final === "Allow") {
        permittedResources.push({ resourceId, resourceName, decision });
        representative = representative || decision;
      } else {
        excludedResources.push({ resourceId, resourceName, reason: denialHeadline(decision), decision });
      }
    }

    if (!permittedResources.length) {
      result.excluded.push({
        title: dataset.name,
        connectionName: connection.connectionName,
        category: connection.category,
        reason: excludedResources[0]?.reason || "No permitted resources in this tool.",
        decision: excludedResources[0]?.decision
      });
      continue;
    }

    const permittedIds = permittedResources.map((item) => item.resourceId);
    const permitted = dataset.records.filter((record) => permittedIds.includes(record.resourceId));
    // Counts only records this identity may not read. Rows dropped below for being
    // off-topic are not "excluded by access" and must not be disclosed as such.
    const withheldRecordCount = dataset.records.length - permitted.length;

    // If the dataset only surfaced because a record title matched — not one of its
    // keywords — narrow to those records rather than answering with the whole table.
    let rows = permitted;
    const keywordHit = tokens.some((token) => dataset.keywords.includes(token));
    if (!keywordHit) {
      rows = rows.filter((record) => tokens.some((token) => record.title.toLowerCase().includes(token)));
      if (!rows.length) continue;
    }
    const maskedFields = new Set();
    const hiddenFields = new Set();
    const shapedRows = rows.map((record) => {
      const { cells, masked, hidden } = applyObligations(record, representative.fieldRestrictions);
      masked.forEach((label) => maskedFields.add(label));
      hidden.forEach((label) => hiddenFields.add(label));
      return { id: record.id, title: record.title, cells };
    });

    result.sources.push({
      docId: dataset.id,
      title: dataset.name,
      summary: dataset.summarise(rows),
      connectionName: connection.connectionName,
      category: connection.category,
      tool: connection.sourceTool,
      action: dataset.action,
      fetchMode: fetchModes[connection.category]?.mode || "Hybrid",
      fetchNote: fetchModes[connection.category]?.note || "",
      appliedRoles: representative.appliedRoles,
      approvalRequired: representative.requiredApproval,
      metrics: dataset.metrics(rows),
      columns: shapedRows[0]?.cells.map((cell) => cell.label) || [],
      rows: shapedRows,
      recordCount: rows.length,
      totalRecordCount: dataset.records.length,
      withheldRecordCount,
      permittedResources: permittedResources.map((item) => item.resourceName),
      excludedResources,
      maskedFields: [...maskedFields],
      hiddenFields: [...hiddenFields],
      decision: representative
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

  const lead = result.sources.map((source) => source.summary).join(" ");
  const withheldRows = result.sources.reduce((total, source) => total + source.withheldRecordCount, 0);
  const scopeNote = withheldRows
    ? ` These figures cover only the records you are allowed to read — ${withheldRows} matching record${withheldRows === 1 ? "" : "s"} in scope elsewhere ${withheldRows === 1 ? "was" : "were"} excluded, so totals will differ from someone with wider access.`
    : "";
  const excludedNote = result.excluded.length
    ? ` ${result.excluded.length} further source${result.excluded.length === 1 ? "" : "s"} in ${[...new Set(result.excluded.map((item) => item.connectionName))].join(", ")} ${result.excluded.length === 1 ? "was" : "were"} excluded entirely.`
    : "";
  const maskNote = maskedTotal.length || hiddenTotal.length ? " Some fields were masked or withheld under your role's field obligations." : "";

  result.answer = `${lead}${scopeNote}${excludedNote}${maskNote}`;
  return result;
}

export function suggestedPrompts(state, employeeId) {
  const employee = state.employees.find((item) => item.id === employeeId);
  const byDepartment = {
    Finance: ["What is our invoice and collections position?", "Show me vendor payment aging", "What did the statutory audit find?"],
    Support: ["How many open tickets do we have?", "What is the refund escalation process?", "Which tickets are breaching SLA?"],
    Engineering: ["How is pull request review velocity looking?", "What are the latest architecture decisions?", "Where is the on-call runbook?"],
    "Human Resources": ["What is our headcount by department?", "Show me compensation bands by grade", "What does attendance look like this quarter?"],
    Contractors: ["What are the platform architecture decisions?", "Show me the on-call runbook", "What is the refund escalation playbook?"]
  };
  return byDepartment[employee?.department] || ["What is our headcount by department?", "How many open tickets do we have?", "What is the leave policy?"];
}
