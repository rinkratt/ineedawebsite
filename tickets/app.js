const API_URL = "api/index.php";

const typeNames = ["All", "Incident", "Problem", "Request", "Change"];

const defaultUsers = [
  { id: 1, name: "Kelly Cox", email: "kelly.cox@ineedawebsite.us", role: "Admin" },
  { id: 2, name: "Matt Arnold", email: "Matt.Arnold@ineedawebsite.us", role: "Tier 2 Tech" },
  { id: 3, name: "Larsen Vallecillo", email: "Larsen.Vallecillo@ineedawebsite.us", role: "Tier 2 Tech" },
];

let users = [...defaultUsers];
let tickets = [];
let activeType = "All";
let activeTicketId = null;
let activeDetailTab = "details";
let activeView = "dashboard";
const aiAssists = new Map();
let aiChatBusy = false;
const aiChatMessages = [
  { role: "assistant", content: "Hi, what would you like help with?" },
];

const els = {
  dashboardView: document.querySelector("#dashboardView"),
  ticketsView: document.querySelector("#ticketsView"),
  reportsView: document.querySelector("#reportsView"),
  aiChatView: document.querySelector("#aiChatView"),
  detailView: document.querySelector("#detailView"),
  dashboardNav: document.querySelector("#dashboardNav"),
  ticketsNav: document.querySelector("#ticketsNav"),
  reportsNav: document.querySelector("#reportsNav"),
  aiChatNav: document.querySelector("#aiChatNav"),
  dashboardBoard: document.querySelector("#dashboardBoard"),
  dashboardTypeSummary: document.querySelector("#dashboardTypeSummary"),
  priorityList: document.querySelector("#priorityList"),
  userList: document.querySelector("#userList"),
  reportTotalCount: document.querySelector("#reportTotalCount"),
  reportActiveCount: document.querySelector("#reportActiveCount"),
  reportResolvedCount: document.querySelector("#reportResolvedCount"),
  reportPriorityCount: document.querySelector("#reportPriorityCount"),
  reportStatusList: document.querySelector("#reportStatusList"),
  reportCategoryList: document.querySelector("#reportCategoryList"),
  aiChatMessages: document.querySelector("#aiChatMessages"),
  aiChatForm: document.querySelector("#aiChatForm"),
  aiChatInput: document.querySelector("#aiChatInput"),
  aiChatSend: document.querySelector("#aiChatSend"),
  typeFilters: document.querySelector("#typeFilters"),
  ticketRows: document.querySelector("#ticketRows"),
  search: document.querySelector("#searchInput"),
  filterPanel: document.querySelector("#filterPanel"),
  statusFilter: document.querySelector("#statusFilter"),
  assigneeFilter: document.querySelector("#assigneeFilter"),
  priorityFilter: document.querySelector("#priorityFilter"),
  clearFilters: document.querySelector("#clearFiltersButton"),
  assigneeFilterButton: document.querySelector("#assigneeFilterButton"),
  statusFilterButton: document.querySelector("#statusFilterButton"),
  priorityFilterButton: document.querySelector("#priorityFilterButton"),
  pageSummary: document.querySelector("#pageSummary"),
  composePanel: document.querySelector("#composePanel"),
  form: document.querySelector("#ticketForm"),
  newTicket: document.querySelector("#newTicketButton"),
  newTicketTop: document.querySelector("#newTicketTopButton"),
  closeCompose: document.querySelector("#closeComposeButton"),
  cancel: document.querySelector("#cancelButton"),
  ticketId: document.querySelector("#ticketId"),
  titleInput: document.querySelector("#titleInput"),
  typeInput: document.querySelector("#typeInput"),
  templateInput: document.querySelector("#templateInput"),
  priorityInput: document.querySelector("#priorityInput"),
  categoryInput: document.querySelector("#categoryInput"),
  assigneeInput: document.querySelector("#assigneeInput"),
  statusInput: document.querySelector("#statusInput"),
  descriptionInput: document.querySelector("#descriptionInput"),
  urgencyInput: document.querySelector("#urgencyInput"),
  impactInput: document.querySelector("#impactInput"),
  requestUserInput: document.querySelector("#requestUserInput"),
  assetInput: document.querySelector("#assetInput"),
  backButton: document.querySelector("#backButton"),
  openCount: document.querySelector("#openCount"),
  urgentCount: document.querySelector("#urgentCount"),
  resolvedCount: document.querySelector("#resolvedCount"),
  newTodayCount: document.querySelector("#newTodayCount"),
  averageAge: document.querySelector("#averageAge"),
  needsResponseCount: document.querySelector("#needsResponseCount"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  detailType: document.querySelector("#detailType"),
  detailTitle: document.querySelector("#detailTitle"),
  detailPriority: document.querySelector("#detailPriority"),
  detailCategories: document.querySelector("#detailCategories"),
  detailAssignee: document.querySelector("#detailAssignee"),
  detailStatus: document.querySelector("#detailStatus"),
  detailPanel: document.querySelector("#detailPanel"),
};

els.newTicket.addEventListener("click", () => openCompose());
els.newTicketTop.addEventListener("click", () => openCompose());
els.dashboardNav.addEventListener("click", () => switchView("dashboard"));
els.ticketsNav.addEventListener("click", () => switchView("tickets"));
els.reportsNav.addEventListener("click", () => switchView("reports"));
els.aiChatNav.addEventListener("click", () => switchView("ai-chat"));
els.closeCompose.addEventListener("click", closeCompose);
els.cancel.addEventListener("click", closeCompose);
els.form.addEventListener("submit", saveTicket);
els.aiChatForm.addEventListener("submit", sendAiChatMessage);
els.search.addEventListener("input", renderQueue);
els.statusFilter.addEventListener("change", renderQueue);
els.assigneeFilter.addEventListener("change", renderQueue);
els.priorityFilter.addEventListener("change", renderQueue);
els.clearFilters.addEventListener("click", clearFilters);
els.backButton.addEventListener("click", showQueue);
els.detailTitle.addEventListener("change", updateDetailTitle);
els.exportButton.addEventListener("click", exportTickets);
els.importInput.addEventListener("change", importTickets);

[els.assigneeFilterButton, els.statusFilterButton, els.priorityFilterButton].forEach((button) => {
  button.addEventListener("click", () => {
    els.filterPanel.hidden = !els.filterPanel.hidden;
  });
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    activeDetailTab = tab.dataset.tab;
    renderDetail();
  });
});

loadApp();

async function loadApp() {
  try {
    const data = await apiRequest("action=bootstrap");
    users = data.users?.length ? data.users : defaultUsers;
    tickets = Array.isArray(data.tickets) ? data.tickets.map(normalizeTicket) : [];
  } catch (error) {
    console.error(error);
    tickets = starterTickets();
  }
  render();
}

async function apiRequest(query = "", options = {}) {
  const separator = query ? `?${query}` : "";
  const response = await fetch(`${API_URL}${separator}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error || "API request failed");
  }
  return payload;
}

function starterTickets() {
  const now = new Date();
  return [
    makeTicket(1006, "Request", "Add user directory and roles", "New", "Normal - Within a week", "Kelly Cox", "P4-Normal", "Kelly Cox", "Application", "Ticket System", "Users", "Kelly Cox", "Create the first internal users: admin plus Tier 2 technicians.", 0),
    makeTicket(1005, "Request", "Build email intake plan", "New", "High - By the end of tomorrow", "Kelly Cox", "P1-Highest", "Matt Arnold", "Application", "Ticket System", "Email Intake", "Kelly Cox", "Plan how inbound support emails should become tickets with sender, subject, and message body mapped into service records.", 1),
    makeTicket(1004, "Problem", "Local storage is temporary", "In Progress", "Normal - Within a week", "Kelly Cox", "P4-Normal", "Larsen Vallecillo", "Application", "Ticket System", "Data Storage", "Larsen Vallecillo", "Replace browser-only storage with the shared MySQL-backed API.", 2),
    makeTicket(1003, "Change", "Deploy ticket system under /tickets", "Resolved", "Low - Not Urgent", "Kelly Cox", "P5-Low", "Kelly Cox", "Hosting", "Plesk", "Deployment", "Kelly Cox", "Publish the ticket prototype to ineedawebsite.us/tickets and verify the public URL after upload.", 3),
    makeTicket(1002, "Incident", "Mobile create button was hidden", "Resolved", "Low - Not Urgent", "Kelly Cox", "P5-Low", "Matt Arnold", "Interface", "Responsive", "Navigation", "Matt Arnold", "The sidebar create action disappeared on mobile. Add a visible New Ticket action in the top bar.", 4),
    makeTicket(1001, "Request", "Create branded dashboard", "In Progress", "Normal - Within a week", "Kelly Cox", "P4-Normal", "Larsen Vallecillo", "Interface", "Dashboard", "Branding", "Larsen Vallecillo", "Keep the original friendly dashboard style while showing the dense service-record table from the Tickets nav item.", 5),
  ];

  function makeTicket(id, type, title, status, urgency, requestUser, priority, assignee, category, subCategory, thirdCategory, modifyUser, description, daysOld) {
    const requestTime = new Date(now);
    requestTime.setDate(now.getDate() - daysOld);
    return {
      id,
      type,
      title,
      status,
      urgency,
      requestTime: requestTime.toISOString(),
      requestUser,
      priority,
      assignee,
      category,
      subCategory,
      thirdCategory,
      modifyUser,
      description,
      impact: "Individual user",
      asset: "",
      template: "DEFAULT",
      journey: [
        { actor: modifyUser, event: "Service record opened", time: requestTime.toISOString() },
        { actor: modifyUser, event: `Status changed to ${status}`, time: requestTime.toISOString() },
      ],
      attachments: [],
      related: [],
    };
  }
}

function normalizeTicket(ticket) {
  return {
    id: Number(ticket.id),
    type: ticket.type || "Request",
    title: ticket.title || "Untitled ticket",
    status: ticket.status || "New",
    urgency: ticket.urgency || "Low - Not Urgent",
    requestTime: ticket.requestTime || ticket.request_time || new Date().toISOString(),
    requestUser: ticket.requestUser || ticket.request_user || "Kelly Cox",
    priority: ticket.priority || "P5-Low",
    assignee: ticket.assignee || "",
    category: ticket.category || "Application",
    subCategory: ticket.subCategory || ticket.sub_category || "Ticket System",
    thirdCategory: ticket.thirdCategory || ticket.third_category || "General",
    modifyUser: ticket.modifyUser || ticket.modify_user || "Kelly Cox",
    description: ticket.description || "",
    impact: ticket.impact || "Individual user",
    asset: ticket.asset || "",
    template: ticket.template || "DEFAULT",
    journey: Array.isArray(ticket.journey) ? ticket.journey : [],
    attachments: Array.isArray(ticket.attachments) ? ticket.attachments : [],
    related: Array.isArray(ticket.related) ? ticket.related : [],
  };
}

function render() {
  renderAssigneeOptions();
  renderTypeFilters();
  renderDashboard();
  renderUsers();
  renderReports();
  renderAiChat();
  renderQueue();
  updateMetrics();
  switchView(activeView);
}

function renderTypeFilters() {
  els.typeFilters.innerHTML = "";
  typeNames.forEach((type) => {
    const count = type === "All" ? tickets.length : tickets.filter((ticket) => ticket.type === type).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `type-filter ${activeType === type ? "active" : ""}`;
    button.innerHTML = `<span>${type}</span><strong>${count}</strong>`;
    button.addEventListener("click", () => {
      activeType = type;
      renderTypeFilters();
      renderQueue();
    });
    els.typeFilters.appendChild(button);
  });
}

function renderAssigneeOptions() {
  const current = els.assigneeFilter.value || "all";
  const assignees = [...new Set([...users.map((user) => user.name), ...tickets.map((ticket) => ticket.assignee).filter(Boolean)])].sort();
  els.assigneeFilter.innerHTML = `<option value="all">All assignees</option>${assignees.map((name) => `<option>${escapeHtml(name)}</option>`).join("")}`;
  els.assigneeFilter.value = assignees.includes(current) ? current : "all";
}

function getFilteredTickets() {
  const query = els.search.value.trim().toLowerCase();
  return tickets.filter((ticket) => {
    const haystack = [ticket.id, ticket.title, ticket.description, ticket.requestUser, ticket.assignee, ticket.category, ticket.subCategory, ticket.thirdCategory].join(" ").toLowerCase();
    return (activeType === "All" || ticket.type === activeType)
      && (els.statusFilter.value === "all" || ticket.status === els.statusFilter.value)
      && (els.assigneeFilter.value === "all" || ticket.assignee === els.assigneeFilter.value)
      && (els.priorityFilter.value === "all" || ticket.priority === els.priorityFilter.value)
      && (!query || haystack.includes(query));
  });
}

function renderQueue() {
  const filtered = getFilteredTickets().sort((a, b) => b.id - a.id);
  els.ticketRows.innerHTML = filtered.map((ticket) => `
    <tr data-id="${ticket.id}">
      <td><input type="checkbox" aria-label="Select ticket ${ticket.id}" /></td>
      <td><button class="id-button" type="button" data-open="${ticket.id}">${ticket.id}</button></td>
      <td><span class="status-pill">${escapeHtml(ticket.status)}</span></td>
      <td>${escapeHtml(ticket.urgency)}</td>
      <td>${formatDate(ticket.requestTime)}</td>
      <td>${escapeHtml(ticket.requestUser)}</td>
      <td>${escapeHtml(ticket.type)}</td>
      <td class="title-cell">${escapeHtml(ticket.title)}</td>
      <td><span class="chip red-chip">${escapeHtml(ticket.priority)}</span></td>
      <td>${escapeHtml(ticket.assignee || "Unassigned")}</td>
      <td>${escapeHtml(ticket.category)}</td>
      <td>${escapeHtml(ticket.subCategory)}</td>
      <td>${escapeHtml(ticket.modifyUser)}</td>
    </tr>
  `).join("");

  els.ticketRows.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => showDetail(Number(button.dataset.open)));
  });

  els.pageSummary.textContent = filtered.length ? `1 - ${filtered.length} of ${filtered.length}` : "0 - 0 of 0";
}

function showDetail(id) {
  activeTicketId = id;
  activeDetailTab = "details";
  els.dashboardView.hidden = true;
  els.ticketsView.hidden = true;
  els.reportsView.hidden = true;
  els.aiChatView.hidden = true;
  els.detailView.hidden = false;
  renderDetail();
}

function showQueue() {
  activeTicketId = null;
  els.detailView.hidden = true;
  switchView(activeView);
  renderQueue();
}

function renderDetail() {
  const ticket = tickets.find((item) => item.id === activeTicketId);
  if (!ticket) return showQueue();

  els.detailType.textContent = `${ticket.type} ${ticket.id}`;
  els.detailTitle.value = ticket.title;
  els.detailPriority.textContent = ticket.priority;
  els.detailCategories.innerHTML = [ticket.category, ticket.subCategory, ticket.thirdCategory].filter(Boolean).map((category) => `<span class="chip gray-chip">${escapeHtml(category)}</span>`).join("");
  els.detailAssignee.textContent = ticket.assignee || "Unassigned";
  els.detailStatus.textContent = ticket.status;

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === activeDetailTab);
  });

  if (activeDetailTab === "details") {
    els.detailPanel.innerHTML = `
      <section class="accordion-section">
        <h2>General Details</h2>
        <dl class="detail-grid">
          <div class="wide"><dt>Description</dt><dd class="description-box">${escapeHtml(ticket.description)}</dd></div>
          <div><dt>Urgency</dt><dd>${escapeHtml(ticket.urgency)}</dd></div>
          <div><dt>Impact</dt><dd>${escapeHtml(ticket.impact)}</dd></div>
          <div><dt>Asset ID</dt><dd>${escapeHtml(ticket.asset || "Select")}</dd></div>
          <div><dt>Submit user</dt><dd>${escapeHtml(ticket.requestUser)}</dd></div>
          <div><dt>Request user</dt><dd>${escapeHtml(ticket.requestUser)}</dd></div>
          <div><dt>Modify User</dt><dd>${escapeHtml(ticket.modifyUser)}</dd></div>
          <div><dt>Modify time</dt><dd>${formatDate(ticket.requestTime)}</dd></div>
        </dl>
      </section>
      <section class="accordion-section"><h2>Business Impact</h2><p>Main CI: Select</p></section>
      <section class="accordion-section"><h2>Related Items</h2><p>Main project: Select</p><p>Main task: Select</p></section>
    `;
  }

  if (activeDetailTab === "ai") {
    renderAiAssist(ticket);
  }

  if (activeDetailTab === "journey") {
    els.detailPanel.innerHTML = `
      <section class="accordion-section">
        <h2>Highlights</h2>
        <div class="timeline">
          ${ticket.journey.map((event) => `<article><strong>${escapeHtml(event.event)}</strong><span>${escapeHtml(event.actor)} - ${formatDate(event.time)}</span></article>`).join("")}
        </div>
        <label class="note-box">Type your Note, @mention to notify<textarea rows="5" maxlength="20000"></textarea></label>
      </section>
    `;
  }

  if (activeDetailTab === "attachments") {
    els.detailPanel.innerHTML = `<section class="empty-panel">No attachments yet</section>`;
  }

  if (activeDetailTab === "related") {
    els.detailPanel.innerHTML = `<section class="empty-panel"><strong>No related items yet</strong><p>Link this service record to another ticket, knowledge base article, asset, or CI.</p><button class="primary-button" type="button">Create and link</button></section>`;
  }
}

function renderAiAssist(ticket) {
  const assist = aiAssists.get(ticket.id);
  if (!assist) {
    els.detailPanel.innerHTML = `
      <section class="ai-panel">
        <div>
          <h2>AI Assist</h2>
          <p>Generate a technician summary, next steps, missing questions, and a draft response for this ticket.</p>
        </div>
        <button class="primary-button" type="button" id="generateAiButton">Generate AI Assist</button>
      </section>
    `;
    document.querySelector("#generateAiButton").addEventListener("click", () => generateAiAssist(ticket));
    return;
  }

  if (assist.loading) {
    els.detailPanel.innerHTML = `
      <section class="ai-panel">
        <div>
          <h2>AI Assist</h2>
          <p>Reviewing the ticket...</p>
        </div>
      </section>
    `;
    return;
  }

  if (assist.error) {
    els.detailPanel.innerHTML = `
      <section class="ai-panel">
        <div>
          <h2>AI Assist</h2>
          <p>${escapeHtml(assist.error)}</p>
        </div>
        <button class="primary-button" type="button" id="generateAiButton">Try Again</button>
      </section>
    `;
    document.querySelector("#generateAiButton").addEventListener("click", () => generateAiAssist(ticket));
    return;
  }

  const data = assist.data;
  els.detailPanel.innerHTML = `
    <section class="ai-results">
      <div class="ai-result-header">
        <div>
          <h2>AI Assist</h2>
          <p>Review suggestions before using them with a requester.</p>
        </div>
        <button class="secondary-button" type="button" id="generateAiButton">Regenerate</button>
      </div>
      <div class="ai-grid">
        <article>
          <h3>Summary</h3>
          <p>${escapeHtml(data.summary)}</p>
        </article>
        <article>
          <h3>Suggested Routing</h3>
          <p><strong>Priority:</strong> ${escapeHtml(data.suggestedPriority)}</p>
          <p><strong>Category:</strong> ${escapeHtml(data.suggestedCategory)}</p>
        </article>
        <article>
          <h3>Next Steps</h3>
          <ul>${renderAiList(data.nextSteps)}</ul>
        </article>
        <article>
          <h3>Missing Info</h3>
          <ul>${renderAiList(data.missingInfo)}</ul>
        </article>
      </div>
      <article class="ai-draft">
        <h3>Draft Response</h3>
        <p>${escapeHtml(data.draftResponse)}</p>
      </article>
    </section>
  `;
  document.querySelector("#generateAiButton").addEventListener("click", () => generateAiAssist(ticket));
}

function renderAiList(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return "<li>None noted.</li>";
  return list.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

async function generateAiAssist(ticket) {
  aiAssists.set(ticket.id, { loading: true });
  renderAiAssist(ticket);
  try {
    const result = await apiRequest("action=ai-ticket-assist", {
      method: "POST",
      body: JSON.stringify({ ticket }),
    });
    aiAssists.set(ticket.id, { data: result.assist });
  } catch (error) {
    aiAssists.set(ticket.id, { error: error.message || "AI assist could not be generated." });
    console.error(error);
  }
  renderAiAssist(ticket);
}

function renderAiChat() {
  els.aiChatMessages.innerHTML = aiChatMessages.map((message) => {
    const classes = [
      "chat-message",
      message.role === "user" ? "is-user" : "is-assistant",
      message.pending ? "is-pending" : "",
      message.error ? "is-error" : "",
    ].filter(Boolean).join(" ");
    const label = message.role === "user" ? "You" : "AI";
    return `
      <article class="${classes}">
        <span>${label}</span>
        <p>${escapeHtml(message.content)}</p>
      </article>
    `;
  }).join("");

  els.aiChatInput.disabled = aiChatBusy;
  els.aiChatSend.disabled = aiChatBusy;
  els.aiChatMessages.scrollTop = els.aiChatMessages.scrollHeight;
}

async function sendAiChatMessage(event) {
  event.preventDefault();
  const content = els.aiChatInput.value.trim();
  if (!content || aiChatBusy) return;

  aiChatBusy = true;
  els.aiChatInput.value = "";
  aiChatMessages.push({ role: "user", content });
  const pendingMessage = { role: "assistant", content: "Thinking...", pending: true };
  aiChatMessages.push(pendingMessage);
  renderAiChat();

  try {
    const messages = aiChatMessages
      .filter((message) => !message.pending)
      .slice(-12)
      .map((message) => ({ role: message.role, content: message.content }));
    const result = await apiRequest("action=ai-chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    });
    pendingMessage.content = result.message || "I could not generate a response.";
    pendingMessage.pending = false;
  } catch (error) {
    pendingMessage.content = error.message || "AI chat is not available right now.";
    pendingMessage.pending = false;
    pendingMessage.error = true;
    console.error(error);
  } finally {
    aiChatBusy = false;
    renderAiChat();
    els.aiChatInput.focus();
  }
}

function openCompose(ticket = null) {
  els.composePanel.hidden = false;
  els.ticketId.value = ticket?.id || "";
  els.titleInput.value = ticket?.title || "DEFAULT";
  els.typeInput.value = ticket?.type || "Incident";
  els.templateInput.value = ticket?.template || "DEFAULT";
  els.priorityInput.value = ticket?.priority || "P5-Low";
  els.categoryInput.value = ticket?.category || "Application";
  els.assigneeInput.value = ticket?.assignee || "";
  els.statusInput.value = ticket?.status || "New";
  els.descriptionInput.value = ticket?.description || "";
  els.urgencyInput.value = ticket?.urgency || "Low - Not Urgent";
  els.impactInput.value = ticket?.impact || "Individual user";
  els.requestUserInput.value = ticket?.requestUser || "Kelly Cox";
  els.assetInput.value = ticket?.asset || "";
  els.titleInput.focus();
}

function closeCompose() {
  els.composePanel.hidden = true;
  els.form.reset();
}

async function saveTicket(event) {
  event.preventDefault();
  const existingId = Number(els.ticketId.value);
  const existing = tickets.find((ticket) => ticket.id === existingId);
  const now = new Date().toISOString();
  const payload = {
    id: existingId || null,
    type: els.typeInput.value,
    title: els.titleInput.value.trim(),
    status: els.statusInput.value,
    urgency: els.urgencyInput.value,
    requestTime: existing?.requestTime || now,
    requestUser: els.requestUserInput.value.trim(),
    priority: els.priorityInput.value,
    assignee: els.assigneeInput.value.trim(),
    category: els.categoryInput.value,
    subCategory: existing?.subCategory || "Ticket System",
    thirdCategory: existing?.thirdCategory || "General",
    modifyUser: "Kelly Cox",
    description: els.descriptionInput.value.trim(),
    impact: els.impactInput.value,
    asset: els.assetInput.value.trim(),
    template: els.templateInput.value,
  };

  try {
    const saved = await apiRequest("action=save-ticket", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const nextTicket = normalizeTicket(saved.ticket);
    tickets = existing
      ? tickets.map((ticket) => (ticket.id === nextTicket.id ? nextTicket : ticket))
      : [nextTicket, ...tickets];
    closeCompose();
    render();
    showDetail(nextTicket.id);
  } catch (error) {
    alert("Ticket could not be saved. Please try again.");
    console.error(error);
  }
}

function clearFilters() {
  activeType = "All";
  els.search.value = "";
  els.statusFilter.value = "all";
  els.assigneeFilter.value = "all";
  els.priorityFilter.value = "all";
  els.filterPanel.hidden = true;
  renderTypeFilters();
  renderQueue();
}

async function updateDetailTitle() {
  const ticket = tickets.find((item) => item.id === activeTicketId);
  if (!ticket) return;
  ticket.title = els.detailTitle.value.trim() || ticket.title;
  ticket.modifyUser = "Kelly Cox";
  try {
    const saved = await apiRequest("action=save-ticket", {
      method: "POST",
      body: JSON.stringify(ticket),
    });
    Object.assign(ticket, normalizeTicket(saved.ticket));
    renderDashboard();
    renderQueue();
  } catch (error) {
    alert("Title could not be saved.");
    console.error(error);
  }
}

function switchView(view) {
  const validViews = ["dashboard", "tickets", "reports", "ai-chat"];
  activeView = validViews.includes(view) ? view : "dashboard";
  activeTicketId = null;
  els.detailView.hidden = true;
  els.dashboardView.hidden = activeView !== "dashboard";
  els.ticketsView.hidden = activeView !== "tickets";
  els.reportsView.hidden = activeView !== "reports";
  els.aiChatView.hidden = activeView !== "ai-chat";
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === activeView);
  });

  if (activeView === "reports") renderReports();
  if (activeView === "ai-chat") renderAiChat();
}

function updateMetrics() {
  const activeTickets = tickets.filter((ticket) => ticket.status !== "Resolved");
  const totalAge = activeTickets.reduce((sum, ticket) => sum + getTicketAge(ticket), 0);
  const averageAge = activeTickets.length ? Math.round(totalAge / activeTickets.length) : 0;
  const today = new Date().toDateString();

  els.openCount.textContent = tickets.filter((ticket) => ticket.status === "New").length;
  els.urgentCount.textContent = tickets.filter((ticket) => ticket.urgency.includes("Urgent") || ticket.priority === "P1-Highest").length;
  els.resolvedCount.textContent = tickets.filter((ticket) => ticket.status === "Resolved").length;
  els.newTodayCount.textContent = tickets.filter((ticket) => new Date(ticket.requestTime).toDateString() === today).length;
  els.averageAge.textContent = `${averageAge}d`;
  els.needsResponseCount.textContent = tickets.filter((ticket) => ["New", "User Responded"].includes(ticket.status)).length;
}

function renderReports() {
  const activeTickets = tickets.filter((ticket) => ticket.status !== "Resolved");
  els.reportTotalCount.textContent = tickets.length;
  els.reportActiveCount.textContent = activeTickets.length;
  els.reportResolvedCount.textContent = tickets.filter((ticket) => ticket.status === "Resolved").length;
  els.reportPriorityCount.textContent = tickets.filter((ticket) => ticket.priority === "P1-Highest").length;
  els.reportStatusList.innerHTML = renderReportList(countTicketsBy((ticket) => ticket.status || "Unknown"), tickets.length);
  els.reportCategoryList.innerHTML = renderReportList(countTicketsBy((ticket) => ticket.category || "Uncategorized"), tickets.length);
}

function countTicketsBy(getLabel) {
  return tickets.reduce((counts, ticket) => {
    const label = getLabel(ticket);
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});
}

function renderReportList(counts, total) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!entries.length) {
    return `<div class="empty-state">No tickets yet</div>`;
  }

  return entries.map(([label, count]) => {
    const percent = total ? Math.round((count / total) * 100) : 0;
    return `
      <div class="report-row">
        <div>
          <strong>${escapeHtml(label)}</strong>
          <span>${count} ticket${count === 1 ? "" : "s"} - ${percent}%</span>
        </div>
        <div class="report-bar" aria-hidden="true"><span style="width: ${percent}%"></span></div>
      </div>
    `;
  }).join("");
}

function renderDashboard() {
  els.dashboardTypeSummary.innerHTML = typeNames.slice(1).map((type) => {
    const count = tickets.filter((ticket) => ticket.type === type).length;
    return `<div class="type-row"><span>${type}</span><strong>${count}</strong></div>`;
  }).join("");

  const priorityTickets = [...tickets]
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.id - a.id)
    .slice(0, 5);
  els.priorityList.innerHTML = priorityTickets.map((ticket) => `
    <button class="priority-item" type="button" data-open="${ticket.id}">
      <span class="chip red-chip">${escapeHtml(ticket.priority)}</span>
      <strong>${escapeHtml(ticket.title)}</strong>
      <small>${ticket.id} - ${escapeHtml(ticket.requestUser)}</small>
    </button>
  `).join("");

  els.priorityList.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => showDetail(Number(button.dataset.open)));
  });

  const columns = [
    { name: "New", statuses: ["New"] },
    { name: "In Progress", statuses: ["In Progress"] },
    { name: "User Responded", statuses: ["User Responded"] },
    { name: "Resolved", statuses: ["Resolved"] },
  ];

  els.dashboardBoard.innerHTML = columns.map((column) => {
    const columnTickets = tickets.filter((ticket) => column.statuses.includes(ticket.status)).slice(0, 4);
    return `
      <article class="column">
        <div class="column-header">
          <h3>${column.name}</h3>
          <span class="column-count">${tickets.filter((ticket) => column.statuses.includes(ticket.status)).length}</span>
        </div>
        <div class="ticket-list">
          ${columnTickets.length ? columnTickets.map(renderDashboardCard).join("") : `<div class="empty-state">No tickets here</div>`}
        </div>
      </article>
    `;
  }).join("");

  els.dashboardBoard.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => showDetail(Number(button.dataset.open)));
  });
}

function renderUsers() {
  els.userList.innerHTML = users.map((user) => `
    <article class="user-row">
      <div class="user-avatar">${escapeHtml(user.name.split(" ").map((part) => part[0]).join(""))}</div>
      <div>
        <strong>${escapeHtml(user.name)}</strong>
        <span>${escapeHtml(user.email)}</span>
      </div>
      <small>${escapeHtml(user.role)}</small>
    </article>
  `).join("");
}

function renderDashboardCard(ticket) {
  return `
    <button class="ticket-card" type="button" data-open="${ticket.id}">
      <div>
        <h4>${escapeHtml(ticket.title)}</h4>
        <div class="ticket-meta">
          <span>#${ticket.id}</span>
          <span>${escapeHtml(ticket.requestUser)}</span>
          <span>Age ${getTicketAge(ticket)}d</span>
        </div>
      </div>
      <div class="ticket-footer">
        <span class="chip red-chip">${escapeHtml(ticket.priority)}</span>
        <span>${escapeHtml(ticket.assignee || "Unassigned")}</span>
      </div>
    </button>
  `;
}

function priorityRank(priority) {
  return { "P1-Highest": 1, "P4-Normal": 2, "P5-Low": 3 }[priority] || 9;
}

function getTicketAge(ticket) {
  const diff = Date.now() - new Date(ticket.requestTime).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function exportTickets() {
  const blob = new Blob([JSON.stringify(tickets, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tickets-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importTickets(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error("Invalid import");
      tickets = imported.map(normalizeTicket);
      render();
    } catch {
      alert("That file could not be imported.");
    } finally {
      els.importInput.value = "";
    }
  });
  reader.readAsText(file);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character]));
}
