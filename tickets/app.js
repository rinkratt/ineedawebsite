const API_URL = "api/index.php";

const typeNames = ["All", "Incident", "Problem", "Request", "Change"];
const categoryTypeFields = {
  Incident: "enableIncident",
  Request: "enableRequest",
  Change: "enableChange",
  Problem: "enableProblem",
};
const defaultPriorityOptions = ["P1-Highest", "P2-High", "P3-Medium", "P4-Normal", "P5-Low"];
const defaultStatusOptions = ["New", "Open", "In Progress", "Escalated", "Waiting on Customer", "User Responded", "Pending Vendor", "On Hold", "Resolved", "Closed", "Cancelled"];
let priorityOptions = [...defaultPriorityOptions];
let prioritySettings = defaultPriorityOptions.map((label, index) => ({ id: `default-priority-${index}`, label, sortOrder: index + 1, active: true }));
let statusOptions = [...defaultStatusOptions];
let statusSettings = defaultStatusOptions.map((label, index) => ({ id: `default-status-${index}`, label, sortOrder: index + 1, active: true, isResolved: ["Resolved", "Closed", "Cancelled"].includes(label) }));
let resolvedStatuses = ["Resolved", "Closed", "Cancelled"];
const responseStatuses = ["New", "Open", "Escalated", "User Responded"];
const categoryKeySeparator = "|||";
const fallbackCategories = [
  { id: "fallback-application", category: "Application", subCategory: "Ticket System", thirdCategory: "General", active: true },
  { id: "fallback-hardware", category: "Hardware", subCategory: "Device", thirdCategory: "General", active: true },
  { id: "fallback-account", category: "Account", subCategory: "Access", thirdCategory: "General", active: true },
  { id: "fallback-access", category: "Access", subCategory: "Account Access", thirdCategory: "Cannot log on", active: true },
];
const defaultCompanyLogo = "/logo.svg";
const maxCompanyLogoBytes = 1500000;
let categoryOptions = (Array.isArray(window.ticketCategories) && window.ticketCategories.length ? window.ticketCategories : fallbackCategories).map(normalizeCategoryOption);
let companies = [];
let activeCompanyId = null;
let pendingCompanyLogoDataUrl = "";
let pendingCompanyLogoName = "";

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
let currentUser = null;
const initialResetToken = new URLSearchParams(window.location.search).get("reset") || "";
let categorySettingsSearch = "";
let settingsDirectorySearch = "";
let activeSettingsPage = "home";
let activeUserSettingsMode = "admins";
let categoryAddMode = "done";
const aiAssists = new Map();
let aiChatBusy = false;
const aiChatMessages = [
  { role: "assistant", content: "Hi, what would you like help with?" },
];
const settingsPageConfig = {
  categories: { title: "Manage Categories", panel: "categories", canSave: true },
  admins: { title: "Admins", panel: "users", canSave: false, userMode: "admins" },
  "end-users": { title: "End Users", panel: "users", canSave: false, userMode: "end-users" },
  companies: { title: "Companies", panel: "companies", canSave: false },
  statuses: { title: "Status Settings", panel: "statuses", canSave: true },
  priorities: { title: "Priority Settings", panel: "priorities", canSave: true },
};

const els = {
  appShell: document.querySelector("#appShell"),
  loginScreen: document.querySelector("#loginScreen"),
  loginForm: document.querySelector("#loginForm"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  loginError: document.querySelector("#loginError"),
  forgotPassword: document.querySelector("#forgotPasswordButton"),
  passwordResetRequestForm: document.querySelector("#passwordResetRequestForm"),
  resetEmailInput: document.querySelector("#resetEmailInput"),
  resetRequestMessage: document.querySelector("#resetRequestMessage"),
  backToLoginFromResetRequest: document.querySelector("#backToLoginFromResetRequest"),
  passwordResetForm: document.querySelector("#passwordResetForm"),
  resetPasswordToken: document.querySelector("#resetPasswordToken"),
  resetPasswordInput: document.querySelector("#resetPasswordInput"),
  resetPasswordConfirmInput: document.querySelector("#resetPasswordConfirmInput"),
  resetPasswordMessage: document.querySelector("#resetPasswordMessage"),
  backToLoginFromResetPassword: document.querySelector("#backToLoginFromResetPassword"),
  passwordChangeForm: document.querySelector("#passwordChangeForm"),
  currentPasswordInput: document.querySelector("#currentPasswordInput"),
  newPasswordInput: document.querySelector("#newPasswordInput"),
  confirmPasswordInput: document.querySelector("#confirmPasswordInput"),
  passwordChangeError: document.querySelector("#passwordChangeError"),
  currentUserName: document.querySelector("#currentUserName"),
  currentUserRole: document.querySelector("#currentUserRole"),
  logoutButton: document.querySelector("#logoutButton"),
  dashboardView: document.querySelector("#dashboardView"),
  ticketsView: document.querySelector("#ticketsView"),
  reportsView: document.querySelector("#reportsView"),
  aiChatView: document.querySelector("#aiChatView"),
  settingsView: document.querySelector("#settingsView"),
  settingsTitle: document.querySelector("#settingsTitle"),
  settingsBack: document.querySelector("#settingsBackButton"),
  settingsHome: document.querySelector("#settingsHome"),
  settingsEditor: document.querySelector("#settingsEditor"),
  settingsDirectorySearch: document.querySelector("#settingsDirectorySearch"),
  detailView: document.querySelector("#detailView"),
  dashboardNav: document.querySelector("#dashboardNav"),
  ticketsNav: document.querySelector("#ticketsNav"),
  reportsNav: document.querySelector("#reportsNav"),
  aiChatNav: document.querySelector("#aiChatNav"),
  settingsNav: document.querySelector("#settingsNav"),
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
  editTicket: document.querySelector("#editTicketButton"),
  openCount: document.querySelector("#openCount"),
  urgentCount: document.querySelector("#urgentCount"),
  resolvedCount: document.querySelector("#resolvedCount"),
  newTodayCount: document.querySelector("#newTodayCount"),
  averageAge: document.querySelector("#averageAge"),
  needsResponseCount: document.querySelector("#needsResponseCount"),
  detailType: document.querySelector("#detailType"),
  detailTitle: document.querySelector("#detailTitle"),
  detailPriority: document.querySelector("#detailPriority"),
  detailCategories: document.querySelector("#detailCategories"),
  detailAssignee: document.querySelector("#detailAssignee"),
  detailStatus: document.querySelector("#detailStatus"),
  detailPanel: document.querySelector("#detailPanel"),
  saveSettings: document.querySelector("#saveSettingsButton"),
  addPriority: document.querySelector("#addPriorityButton"),
  addStatus: document.querySelector("#addStatusButton"),
  addCategory: document.querySelector("#addCategoryButton"),
  prioritySettingsList: document.querySelector("#prioritySettingsList"),
  statusSettingsList: document.querySelector("#statusSettingsList"),
  categorySettingsList: document.querySelector("#categorySettingsList"),
  categorySettingsSearch: document.querySelector("#categorySettingsSearch"),
  categoryAddForm: document.querySelector("#categoryAddForm"),
  cancelCategoryAdd: document.querySelector("#cancelCategoryAddButton"),
  newCategoryName: document.querySelector("#newCategoryName"),
  newSubCategoryName: document.querySelector("#newSubCategoryName"),
  newThirdCategoryName: document.querySelector("#newThirdCategoryName"),
  newCategoryDescription: document.querySelector("#newCategoryDescription"),
  newCategoryVisibleSsp: document.querySelector("#newCategoryVisibleSsp"),
  newCategoryVisibleAdmin: document.querySelector("#newCategoryVisibleAdmin"),
  newCategoryIncident: document.querySelector("#newCategoryIncident"),
  newCategoryRequest: document.querySelector("#newCategoryRequest"),
  newCategoryChange: document.querySelector("#newCategoryChange"),
  newCategoryProblem: document.querySelector("#newCategoryProblem"),
  categoryAddLevelOneOptions: document.querySelector("#categoryAddLevelOneOptions"),
  categoryAddLevelTwoOptions: document.querySelector("#categoryAddLevelTwoOptions"),
  categoryAddLevelThreeOptions: document.querySelector("#categoryAddLevelThreeOptions"),
  categoryLevelOneOptions: document.querySelector("#categoryLevelOneOptions"),
  categoryLevelTwoOptions: document.querySelector("#categoryLevelTwoOptions"),
  categoryLevelThreeOptions: document.querySelector("#categoryLevelThreeOptions"),
  userSettingsList: document.querySelector("#userSettingsList"),
  userSettingsHeading: document.querySelector("#userSettingsHeading"),
  addUserForm: document.querySelector("#addUserForm"),
  newUserName: document.querySelector("#newUserName"),
  newUserEmail: document.querySelector("#newUserEmail"),
  newUserRole: document.querySelector("#newUserRole"),
  newUserPassword: document.querySelector("#newUserPassword"),
  newUserIsTech: document.querySelector("#newUserIsTech"),
  addCompany: document.querySelector("#addCompanyButton"),
  companySettingsList: document.querySelector("#companySettingsList"),
  companySettingsForm: document.querySelector("#companySettingsForm"),
  companyId: document.querySelector("#companyId"),
  companyName: document.querySelector("#companyName"),
  companyPhone: document.querySelector("#companyPhone"),
  companyAddress: document.querySelector("#companyAddress"),
  companyAddress2: document.querySelector("#companyAddress2"),
  companyCity: document.querySelector("#companyCity"),
  companyState: document.querySelector("#companyState"),
  companyZip: document.querySelector("#companyZip"),
  companyTheme: document.querySelector("#companyTheme"),
  companyNotes: document.querySelector("#companyNotes"),
  companyLogoPreview: document.querySelector("#companyLogoPreview"),
  companyLogoName: document.querySelector("#companyLogoName"),
  companyLogoInput: document.querySelector("#companyLogoInput"),
  restoreCompanyLogo: document.querySelector("#restoreCompanyLogoButton"),
  companyActive: document.querySelector("#companyActive"),
  cancelCompany: document.querySelector("#cancelCompanyButton"),
};

els.loginForm.addEventListener("submit", login);
els.forgotPassword.addEventListener("click", showPasswordResetRequest);
els.passwordResetRequestForm.addEventListener("submit", requestPasswordReset);
els.backToLoginFromResetRequest.addEventListener("click", () => showLogin());
els.passwordResetForm.addEventListener("submit", resetPassword);
els.backToLoginFromResetPassword.addEventListener("click", () => showLogin());
els.passwordChangeForm.addEventListener("submit", changePassword);
els.logoutButton.addEventListener("click", logout);
els.newTicket.addEventListener("click", () => openCompose());
els.newTicketTop.addEventListener("click", () => openCompose());
els.dashboardNav.addEventListener("click", () => switchView("dashboard"));
els.ticketsNav.addEventListener("click", () => switchView("tickets"));
els.reportsNav.addEventListener("click", () => switchView("reports"));
els.aiChatNav.addEventListener("click", () => switchView("ai-chat"));
els.settingsNav.addEventListener("click", () => switchView("settings"));
els.closeCompose.addEventListener("click", closeCompose);
els.cancel.addEventListener("click", closeCompose);
els.form.addEventListener("submit", saveTicket);
els.typeInput.addEventListener("change", () => renderCategoryOptions(""));
els.aiChatForm.addEventListener("submit", sendAiChatMessage);
els.settingsBack.addEventListener("click", showSettingsHome);
els.settingsHome.addEventListener("click", openSettingsFromEvent);
els.settingsDirectorySearch.addEventListener("input", () => {
  settingsDirectorySearch = els.settingsDirectorySearch.value.trim().toLowerCase();
  filterSettingsDirectory();
});
els.saveSettings.addEventListener("click", saveSettings);
els.addPriority.addEventListener("click", () => addSettingRow("priority"));
els.addStatus.addEventListener("click", () => addSettingRow("status"));
els.addCategory.addEventListener("click", showCategoryAddForm);
els.categorySettingsSearch.addEventListener("input", () => {
  categorySettingsSearch = els.categorySettingsSearch.value.trim().toLowerCase();
  renderCategorySettings();
});
els.categoryAddForm.addEventListener("submit", saveCategoryFromForm);
els.categoryAddForm.addEventListener("click", (event) => {
  const submitButton = event.target.closest("[data-category-add-mode]");
  if (submitButton) categoryAddMode = submitButton.dataset.categoryAddMode || "done";
});
els.cancelCategoryAdd.addEventListener("click", hideCategoryAddForm);
els.newCategoryName.addEventListener("input", updateCategoryAddLevelOptions);
els.newSubCategoryName.addEventListener("input", updateCategoryAddLevelOptions);
els.newThirdCategoryName.addEventListener("input", updateCategoryAddLevelOptions);
els.addUserForm.addEventListener("submit", saveNewUser);
els.addCompany.addEventListener("click", startNewCompany);
els.companySettingsList.addEventListener("click", selectCompanyFromEvent);
els.companySettingsForm.addEventListener("submit", saveCompany);
els.companyLogoInput.addEventListener("change", readCompanyLogoFile);
els.restoreCompanyLogo.addEventListener("click", restoreCompanyLogo);
els.cancelCompany.addEventListener("click", renderCompanySettings);
els.prioritySettingsList.addEventListener("input", updateSettingFromEvent);
els.prioritySettingsList.addEventListener("change", updateSettingFromEvent);
els.prioritySettingsList.addEventListener("click", removeSettingFromEvent);
els.statusSettingsList.addEventListener("input", updateSettingFromEvent);
els.statusSettingsList.addEventListener("change", updateSettingFromEvent);
els.statusSettingsList.addEventListener("click", removeSettingFromEvent);
els.categorySettingsList.addEventListener("input", updateSettingFromEvent);
els.categorySettingsList.addEventListener("change", updateSettingFromEvent);
els.categorySettingsList.addEventListener("click", removeSettingFromEvent);
els.userSettingsList.addEventListener("click", saveUserFromEvent);
els.search.addEventListener("input", renderQueue);
els.statusFilter.addEventListener("change", renderQueue);
els.assigneeFilter.addEventListener("change", renderQueue);
els.priorityFilter.addEventListener("change", renderQueue);
els.clearFilters.addEventListener("click", clearFilters);
els.backButton.addEventListener("click", showQueue);
els.editTicket.addEventListener("click", () => {
  const ticket = tickets.find((item) => item.id === activeTicketId);
  if (ticket) openCompose(ticket);
});
els.detailTitle.addEventListener("change", updateDetailTitle);
els.detailPriority.addEventListener("change", () => updateDetailField("priority", els.detailPriority.value));
els.detailStatus.addEventListener("change", () => updateDetailField("status", els.detailStatus.value));

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", togglePasswordVisibility);
});

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

if (initialResetToken) {
  showPasswordReset(initialResetToken);
} else {
  loadApp();
}

async function loadApp() {
  try {
    const data = await apiRequest("action=bootstrap");
    currentUser = data.currentUser || null;
    applySettings(data.settings || {});
    users = data.users?.length ? data.users : defaultUsers;
    tickets = Array.isArray(data.tickets) ? data.tickets.map(normalizeTicket) : [];
    if (currentUser?.passwordResetRequired) {
      showPasswordChange();
      return;
    }
    showApp();
    render();
  } catch (error) {
    console.error(error);
    if (error.status === 401) {
      showLogin();
      return;
    }
    showLogin("The ticket system could not be loaded. Please sign in again.");
  }
}

async function apiRequest(query = "", options = {}) {
  const separator = query ? `?${query}` : "";
  const response = await fetch(`${API_URL}${separator}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = { error: "API request failed" };
  }
  if (!response.ok || payload.error) {
    const error = new Error(payload.error || "API request failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function hideLoginForms() {
  els.loginForm.hidden = true;
  els.passwordResetRequestForm.hidden = true;
  els.passwordResetForm.hidden = true;
  els.passwordChangeForm.hidden = true;
}

function setFormMessage(element, message = "", isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function setPasswordVisibility(input, button, visible) {
  input.type = visible ? "text" : "password";
  button.setAttribute("aria-pressed", visible ? "true" : "false");
  button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
}

function resetPasswordVisibility() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    const input = document.getElementById(button.dataset.passwordTarget);
    if (input) setPasswordVisibility(input, button, false);
  });
}

function togglePasswordVisibility(event) {
  const button = event.currentTarget;
  const input = document.getElementById(button.dataset.passwordTarget);
  if (!input) return;
  setPasswordVisibility(input, button, input.type === "password");
}

async function login(event) {
  event.preventDefault();
  els.loginError.textContent = "";
  els.loginError.classList.remove("success-message");

  try {
    const result = await apiRequest("action=login", {
      method: "POST",
      body: JSON.stringify({
        email: els.loginEmail.value.trim(),
        password: els.loginPassword.value,
      }),
    });
    currentUser = result.user;
    els.loginPassword.value = "";
    if (currentUser?.passwordResetRequired) {
      showPasswordChange();
      return;
    }
    await loadApp();
  } catch (error) {
    els.loginError.textContent = error.message || "Sign in failed.";
  }
}

function showPasswordResetRequest() {
  els.appShell.hidden = true;
  els.loginScreen.hidden = false;
  hideLoginForms();
  els.passwordResetRequestForm.hidden = false;
  els.resetEmailInput.value = els.loginEmail.value.trim();
  setFormMessage(els.resetRequestMessage);
  els.resetEmailInput.focus();
}

function showPasswordReset(token) {
  els.appShell.hidden = true;
  els.loginScreen.hidden = false;
  hideLoginForms();
  els.passwordResetForm.hidden = false;
  els.passwordResetForm.reset();
  els.resetPasswordToken.value = token;
  setFormMessage(els.resetPasswordMessage);
  resetPasswordVisibility();
  els.resetPasswordInput.focus();
}

async function requestPasswordReset(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;
  setFormMessage(els.resetRequestMessage, "Sending reset link...");

  try {
    const result = await apiRequest("action=request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email: els.resetEmailInput.value.trim() }),
    });
    setFormMessage(els.resetRequestMessage, result.message || "If that email belongs to an active account, a password reset link has been sent.");
  } catch (error) {
    setFormMessage(els.resetRequestMessage, error.message || "Password reset could not be requested.", true);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function resetPassword(event) {
  event.preventDefault();
  const nextPassword = els.resetPasswordInput.value;
  const confirmPassword = els.resetPasswordConfirmInput.value;

  if (nextPassword.length < 10) {
    setFormMessage(els.resetPasswordMessage, "Use at least 10 characters.", true);
    return;
  }
  if (nextPassword !== confirmPassword) {
    setFormMessage(els.resetPasswordMessage, "The new passwords do not match.", true);
    return;
  }

  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;
  setFormMessage(els.resetPasswordMessage, "Resetting password...");

  try {
    const result = await apiRequest("action=reset-password", {
      method: "POST",
      body: JSON.stringify({
        token: els.resetPasswordToken.value,
        newPassword: nextPassword,
      }),
    });
    window.history.replaceState(null, "", window.location.pathname);
    els.passwordResetForm.reset();
    resetPasswordVisibility();
    showLogin(result.message || "Your password has been reset. Sign in with the new password.", false);
  } catch (error) {
    setFormMessage(els.resetPasswordMessage, error.message || "Password could not be reset.", true);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function changePassword(event) {
  event.preventDefault();
  els.passwordChangeError.textContent = "";
  const nextPassword = els.newPasswordInput.value;
  const confirmPassword = els.confirmPasswordInput.value;

  if (nextPassword.length < 10) {
    els.passwordChangeError.textContent = "Use at least 10 characters.";
    return;
  }
  if (nextPassword !== confirmPassword) {
    els.passwordChangeError.textContent = "The new passwords do not match.";
    return;
  }

  try {
    const result = await apiRequest("action=change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: els.currentPasswordInput.value,
        newPassword: nextPassword,
      }),
    });
    currentUser = result.user;
    els.passwordChangeForm.reset();
    await loadApp();
  } catch (error) {
    els.passwordChangeError.textContent = error.message || "Password could not be changed.";
  }
}

async function logout() {
  try {
    await apiRequest("action=logout", { method: "POST", body: "{}" });
  } catch (error) {
    console.error(error);
  }
  currentUser = null;
  tickets = [];
  showLogin();
}

function showLogin(message = "", isError = true) {
  els.appShell.hidden = true;
  els.loginScreen.hidden = false;
  hideLoginForms();
  els.loginForm.hidden = false;
  els.loginError.textContent = message;
  els.loginError.classList.toggle("success-message", !isError && message !== "");
  setFormMessage(els.resetRequestMessage);
  setFormMessage(els.resetPasswordMessage);
  els.loginPassword.value = "";
  resetPasswordVisibility();
  els.loginEmail.focus();
}

function showPasswordChange(message = "") {
  els.appShell.hidden = true;
  els.loginScreen.hidden = false;
  hideLoginForms();
  els.passwordChangeForm.hidden = false;
  els.passwordChangeError.textContent = message;
  els.currentPasswordInput.focus();
}

function showApp() {
  els.loginScreen.hidden = true;
  els.appShell.hidden = false;
  els.settingsNav.hidden = !isAdmin();
  if (!isAdmin() && activeView === "settings") activeView = "dashboard";
  els.currentUserName.textContent = currentUser?.name || "Signed in";
  els.currentUserRole.textContent = currentUser?.role || "";
}

function actorName() {
  return currentUser?.name || "System";
}

function isAdmin() {
  return (currentUser?.role || "").toLowerCase().includes("admin");
}

function applySettings(settings = {}) {
  prioritySettings = Array.isArray(settings.priorities) && settings.priorities.length
    ? settings.priorities.map(normalizePrioritySetting)
    : prioritySettings;
  priorityOptions = prioritySettings.filter((priority) => priority.active).map((priority) => priority.label);
  if (!priorityOptions.length) priorityOptions = [...defaultPriorityOptions];

  statusSettings = Array.isArray(settings.statuses) && settings.statuses.length
    ? settings.statuses.map(normalizeStatusSetting)
    : statusSettings;
  statusOptions = statusSettings.filter((status) => status.active).map((status) => status.label);
  if (!statusOptions.length) statusOptions = [...defaultStatusOptions];
  resolvedStatuses = statusSettings.filter((status) => status.active && status.isResolved).map((status) => status.label);
  if (!resolvedStatuses.length) resolvedStatuses = ["Resolved", "Closed", "Cancelled"].filter((status) => statusOptions.includes(status));

  categoryOptions = Array.isArray(settings.categories) && settings.categories.length
    ? settings.categories.map(normalizeCategoryOption)
    : categoryOptions;

  companies = Array.isArray(settings.companies)
    ? settings.companies.map(normalizeCompany)
    : companies;
  if (activeCompanyId && !companies.some((company) => company.id === activeCompanyId)) {
    activeCompanyId = companies[0]?.id || null;
  }
}

function normalizePrioritySetting(priority = {}, index = 0) {
  return {
    id: priority.id || `priority-${Date.now()}-${index}`,
    label: String(priority.label || "").trim(),
    sortOrder: Number(priority.sortOrder || index + 1),
    active: priority.active !== false,
  };
}

function normalizeStatusSetting(status = {}, index = 0) {
  return {
    id: status.id || `status-${Date.now()}-${index}`,
    label: String(status.label || "").trim(),
    sortOrder: Number(status.sortOrder || index + 1),
    active: status.active !== false,
    isResolved: Boolean(status.isResolved),
  };
}

function getTechUsers() {
  return users.filter((user) => user.active !== false && user.isTech !== false);
}

function starterTickets() {
  const now = new Date();
  return [
    makeTicket(1006, "Request", "Add user directory and roles", "New", "Normal - Within a week", "Kelly Cox", "P4-Normal", "Kelly Cox", "Application", "Ticket System", "Users", "Kelly Cox", "Create the first internal users: admin plus Tier 2 technicians.", 0),
    makeTicket(1005, "Request", "Build email intake plan", "Escalated", "High - By the end of tomorrow", "Kelly Cox", "P1-Highest", "Matt Arnold", "Application", "Ticket System", "Email Intake", "Kelly Cox", "Plan how inbound support emails should become tickets with sender, subject, and message body mapped into service records.", 1),
    makeTicket(1004, "Problem", "Local storage is temporary", "In Progress", "Normal - Within a week", "Kelly Cox", "P3-Medium", "Larsen Vallecillo", "Application", "Ticket System", "Data Storage", "Larsen Vallecillo", "Replace browser-only storage with the shared MySQL-backed API.", 2),
    makeTicket(1003, "Change", "Deploy ticket system under /tickets", "Closed", "Low - Not Urgent", "Kelly Cox", "P5-Low", "Kelly Cox", "Hosting", "Plesk", "Deployment", "Kelly Cox", "Publish the ticket prototype to ineedawebsite.us/tickets and verify the public URL after upload.", 3),
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
    status: ticket.status || statusOptions[0] || "New",
    urgency: ticket.urgency || "Low - Not Urgent",
    requestTime: ticket.requestTime || ticket.request_time || new Date().toISOString(),
    requestUser: ticket.requestUser || ticket.request_user || "Kelly Cox",
    priority: ticket.priority || priorityOptions[priorityOptions.length - 1] || "P5-Low",
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
  renderFilterOptions();
  renderAssigneeOptions();
  renderTypeFilters();
  renderDashboard();
  renderUsers();
  renderSettings();
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
  const assignees = [...new Set([...getTechUsers().map((user) => user.name), ...tickets.map((ticket) => ticket.assignee).filter(Boolean)])].sort();
  els.assigneeFilter.innerHTML = `<option value="all">All assignees</option>${assignees.map((name) => `<option>${escapeHtml(name)}</option>`).join("")}`;
  els.assigneeFilter.value = assignees.includes(current) ? current : "all";
}

function renderSelectOptions(options, selected) {
  const optionList = [...options];
  if (selected && !optionList.includes(selected)) optionList.unshift(selected);
  return optionList.map((option) => `<option value="${escapeHtml(option)}"${option === selected ? " selected" : ""}>${escapeHtml(option)}</option>`).join("");
}

function renderFilterOptions() {
  const currentStatus = els.statusFilter.value || "all";
  const currentPriority = els.priorityFilter.value || "all";
  els.statusFilter.innerHTML = `<option value="all">All statuses</option>${statusOptions.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("")}`;
  els.priorityFilter.innerHTML = `<option value="all">All priorities</option>${priorityOptions.map((priority) => `<option value="${escapeHtml(priority)}">${escapeHtml(priority)}</option>`).join("")}`;
  els.statusFilter.value = statusOptions.includes(currentStatus) ? currentStatus : "all";
  els.priorityFilter.value = priorityOptions.includes(currentPriority) ? currentPriority : "all";
}

function renderAssigneeInput(selected = "") {
  const techs = getTechUsers();
  const options = techs.map((user) => user.name);
  if (selected && !options.includes(selected)) options.unshift(selected);
  els.assigneeInput.innerHTML = `<option value="">Unassigned</option>${options.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
  els.assigneeInput.value = selected && options.includes(selected) ? selected : "";
}

function normalizeCompany(company = {}) {
  const theme = String(company.theme || "light").toLowerCase();
  return {
    id: company.id ? Number(company.id) : null,
    name: String(company.name || ""),
    address: String(company.address || ""),
    address2: String(company.address2 || company.address_2 || ""),
    city: String(company.city || ""),
    state: String(company.state || ""),
    zip: String(company.zip || ""),
    phone: String(company.phone || ""),
    notes: String(company.notes || ""),
    logoName: String(company.logoName || company.logo_name || ""),
    logoDataUrl: String(company.logoDataUrl || company.logo_data_url || ""),
    logoUrl: String(company.logoUrl || company.logo_url || defaultCompanyLogo),
    theme: theme === "dark" ? "dark" : "light",
    active: company.active !== false,
  };
}

function blankCompany() {
  return normalizeCompany({
    logoUrl: defaultCompanyLogo,
    theme: "light",
    active: true,
  });
}

function normalizeCategoryOption(option = {}) {
  const enableIncident = option.enableIncident ?? option.enable_incident ?? true;
  const enableRequest = option.enableRequest ?? option.enable_request ?? true;
  const enableChange = option.enableChange ?? option.enable_change ?? true;
  const enableProblem = option.enableProblem ?? option.enable_problem ?? true;
  const visibleSsp = option.visibleSsp ?? option.visible_ssp ?? true;
  const visibleAdmin = option.visibleAdmin ?? option.visible_admin ?? option.active ?? true;
  const hasTypeEnabled = Boolean(enableIncident || enableRequest || enableChange || enableProblem);
  return {
    id: option.id || "",
    sysAidId: option.sysAidId || option.sysaid_id || null,
    category: String(option.category || "Application"),
    subCategory: String(option.subCategory || option.sub_category || ""),
    thirdCategory: String(option.thirdCategory || option.third_category || ""),
    description: String(option.description || ""),
    visibleSsp: visibleSsp !== false,
    visibleAdmin: visibleAdmin !== false,
    enableIncident: enableIncident !== false,
    enableRequest: enableRequest !== false,
    enableChange: enableChange !== false,
    enableProblem: enableProblem !== false,
    sortOrder: Number(option.sortOrder || option.sort_order || 0),
    active: option.active !== false && (visibleSsp !== false || visibleAdmin !== false) && hasTypeEnabled,
  };
}

function categoryOptionKey(option) {
  const normalized = normalizeCategoryOption(option);
  return [normalized.category, normalized.subCategory, normalized.thirdCategory].join(categoryKeySeparator);
}

function categoryOptionLabel(option) {
  const normalized = normalizeCategoryOption(option);
  return [normalized.category, normalized.subCategory, normalized.thirdCategory].filter(Boolean).join(" > ");
}

function categoryOptionFromKey(key) {
  const [category, subCategory = "", thirdCategory = ""] = String(key || "").split(categoryKeySeparator);
  return category ? normalizeCategoryOption({ category, subCategory, thirdCategory }) : null;
}

function categorySupportsTicketType(option, type) {
  const field = categoryTypeFields[type] || "";
  return !field || normalizeCategoryOption(option)[field] !== false;
}

function activeCategoryOptions(type = els.typeInput?.value || "Incident") {
  return categoryOptions.filter((option) => {
    const normalized = normalizeCategoryOption(option);
    return normalized.active !== false && normalized.visibleAdmin !== false && categorySupportsTicketType(normalized, type);
  });
}

function categoryOptionFromTicket(ticket) {
  const current = normalizeCategoryOption({
    category: ticket?.category,
    subCategory: ticket?.subCategory,
    thirdCategory: ticket?.thirdCategory,
  });
  return categoryOptions.find((option) => categoryOptionKey(option) === categoryOptionKey(current)) || current;
}

function selectedCategoryOption() {
  const selectedKey = els.categoryInput.value;
  return categoryOptions.find((option) => categoryOptionKey(option) === selectedKey)
    || categoryOptionFromKey(selectedKey)
    || activeCategoryOptions()[0]
    || categoryOptions[0];
}

function renderCategoryOptions(selectedKey, currentCategory = null) {
  const options = [...activeCategoryOptions(els.typeInput.value)];
  const current = currentCategory ? normalizeCategoryOption(currentCategory) : null;
  if (current && !options.some((option) => categoryOptionKey(option) === categoryOptionKey(current))) {
    options.unshift(current);
  }
  const fallbackKey = options.length ? categoryOptionKey(options[0]) : "";
  const validSelectedKey = selectedKey && options.some((option) => categoryOptionKey(option) === selectedKey) ? selectedKey : fallbackKey;
  els.categoryInput.innerHTML = options.map((option) => {
    const key = categoryOptionKey(option);
    return `<option value="${escapeHtml(key)}"${key === validSelectedKey ? " selected" : ""}>${escapeHtml(categoryOptionLabel(option))}</option>`;
  }).join("");
  els.categoryInput.value = validSelectedKey;
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
  els.settingsView.hidden = true;
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
  els.detailPriority.innerHTML = renderSelectOptions(priorityOptions, ticket.priority);
  els.detailPriority.value = ticket.priority;
  els.detailCategories.innerHTML = [ticket.category, ticket.subCategory, ticket.thirdCategory].filter(Boolean).map((category) => `<span class="chip gray-chip">${escapeHtml(category)}</span>`).join("");
  els.detailAssignee.textContent = ticket.assignee || "Unassigned";
  els.detailStatus.innerHTML = renderSelectOptions(statusOptions, ticket.status);
  els.detailStatus.value = ticket.status;

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
        ${renderChatCitations(message.citations)}
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
    pendingMessage.citations = Array.isArray(result.citations) ? result.citations : [];
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

function renderChatCitations(citations) {
  const items = Array.isArray(citations)
    ? citations.map((citation) => ({ ...citation, url: cleanCitationUrl(citation.url) })).filter((citation) => citation.url).slice(0, 5)
    : [];
  if (!items.length) return "";

  return `
    <div class="chat-citations" aria-label="Sources">
      <strong>Sources</strong>
      ${items.map((citation) => `
        <a href="${escapeHtml(citation.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(citation.title || citation.url)}</a>
      `).join("")}
    </div>
  `;
}

function cleanCitationUrl(url) {
  let cleanUrl = String(url || "").trim();
  ["\"https://", "\"http://", "%22https%3A", "%22http%3A"].forEach((marker) => {
    const markerIndex = cleanUrl.toLowerCase().indexOf(marker.toLowerCase());
    if (markerIndex !== -1) cleanUrl = cleanUrl.slice(0, markerIndex);
  });

  try {
    const parsed = new URL(cleanUrl);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function openCompose(ticket = null) {
  const selectedPriority = ticket?.priority || priorityOptions[priorityOptions.length - 1] || "P5-Low";
  const selectedStatus = ticket?.status || statusOptions[0] || "New";
  els.composePanel.hidden = false;
  els.ticketId.value = ticket?.id || "";
  els.titleInput.value = ticket?.title || "DEFAULT";
  els.typeInput.value = ticket?.type || "Incident";
  const selectedCategory = ticket ? categoryOptionFromTicket(ticket) : activeCategoryOptions(els.typeInput.value)[0] || categoryOptions[0];
  const selectedCategoryKey = categoryOptionKey(selectedCategory);
  els.templateInput.value = ticket?.template || "DEFAULT";
  els.priorityInput.innerHTML = renderSelectOptions(priorityOptions, selectedPriority);
  els.priorityInput.value = selectedPriority;
  renderCategoryOptions(selectedCategoryKey, selectedCategory);
  renderAssigneeInput(ticket?.assignee || "");
  els.statusInput.innerHTML = renderSelectOptions(statusOptions, selectedStatus);
  els.statusInput.value = selectedStatus;
  els.descriptionInput.value = ticket?.description || "";
  els.urgencyInput.value = ticket?.urgency || "Low - Not Urgent";
  els.impactInput.value = ticket?.impact || "Individual user";
  els.requestUserInput.value = ticket?.requestUser || actorName();
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
  const category = selectedCategoryOption();
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
    category: category.category,
    subCategory: category.subCategory,
    thirdCategory: category.thirdCategory,
    modifyUser: actorName(),
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
  ticket.modifyUser = actorName();
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

async function updateDetailField(field, value) {
  const options = field === "priority" ? priorityOptions : field === "status" ? statusOptions : [];
  const ticket = tickets.find((item) => item.id === activeTicketId);
  if (!ticket || !options.includes(value) || ticket[field] === value) return;

  const previousValue = ticket[field];
  ticket[field] = value;
  ticket.modifyUser = actorName();

  try {
    const saved = await apiRequest("action=save-ticket", {
      method: "POST",
      body: JSON.stringify(ticket),
    });
    Object.assign(ticket, normalizeTicket(saved.ticket));
    renderDashboard();
    renderQueue();
    renderReports();
    updateMetrics();
    renderDetail();
  } catch (error) {
    ticket[field] = previousValue;
    renderDetail();
    alert(`${field === "priority" ? "Priority" : "Status"} could not be saved.`);
    console.error(error);
  }
}

function showSettingsHome() {
  activeSettingsPage = "home";
  renderSettings();
}

function openSettingsFromEvent(event) {
  const button = event.target.closest("[data-settings-open]");
  if (!button) return;
  const nextPage = button.dataset.settingsOpen;
  const config = settingsPageConfig[nextPage];
  if (!config) return;

  activeSettingsPage = nextPage;
  if (config.userMode) {
    activeUserSettingsMode = config.userMode;
    setNewUserDefaults();
  }
  renderSettings();
}

function filterSettingsDirectory() {
  document.querySelectorAll(".settings-group").forEach((group) => {
    group.hidden = settingsDirectorySearch !== "" && !group.textContent.toLowerCase().includes(settingsDirectorySearch);
  });
}

function setNewUserDefaults() {
  const isEndUserMode = activeUserSettingsMode === "end-users";
  els.newUserRole.value = isEndUserMode ? "End User" : "Admin";
  els.newUserIsTech.checked = !isEndUserMode;
}

function switchView(view) {
  const validViews = ["dashboard", "tickets", "reports", "ai-chat", "settings"];
  if (view === "settings" && !isAdmin()) view = "dashboard";
  activeView = validViews.includes(view) ? view : "dashboard";
  if (activeView === "settings") activeSettingsPage = "home";
  activeTicketId = null;
  els.detailView.hidden = true;
  els.dashboardView.hidden = activeView !== "dashboard";
  els.ticketsView.hidden = activeView !== "tickets";
  els.reportsView.hidden = activeView !== "reports";
  els.aiChatView.hidden = activeView !== "ai-chat";
  els.settingsView.hidden = activeView !== "settings";
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === activeView);
  });

  if (activeView === "reports") renderReports();
  if (activeView === "ai-chat") renderAiChat();
  if (activeView === "settings") renderSettings();
}

function updateMetrics() {
  const activeTickets = tickets.filter((ticket) => !resolvedStatuses.includes(ticket.status));
  const totalAge = activeTickets.reduce((sum, ticket) => sum + getTicketAge(ticket), 0);
  const averageAge = activeTickets.length ? Math.round(totalAge / activeTickets.length) : 0;
  const today = new Date().toDateString();

  els.openCount.textContent = activeTickets.length;
  els.urgentCount.textContent = tickets.filter((ticket) => ticket.urgency.includes("Urgent") || highPriorityOptions().includes(ticket.priority)).length;
  els.resolvedCount.textContent = tickets.filter((ticket) => resolvedStatuses.includes(ticket.status)).length;
  els.newTodayCount.textContent = tickets.filter((ticket) => new Date(ticket.requestTime).toDateString() === today).length;
  els.averageAge.textContent = `${averageAge}d`;
  els.needsResponseCount.textContent = tickets.filter((ticket) => responseStatuses.includes(ticket.status)).length;
}

function renderReports() {
  const activeTickets = tickets.filter((ticket) => !resolvedStatuses.includes(ticket.status));
  els.reportTotalCount.textContent = tickets.length;
  els.reportActiveCount.textContent = activeTickets.length;
  els.reportResolvedCount.textContent = tickets.filter((ticket) => resolvedStatuses.includes(ticket.status)).length;
  els.reportPriorityCount.textContent = tickets.filter((ticket) => highPriorityOptions().includes(ticket.priority)).length;
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

function renderSettings() {
  if (!isAdmin()) return;
  const config = settingsPageConfig[activeSettingsPage] || null;
  const isHome = activeSettingsPage === "home" || !config;

  if (!config && activeSettingsPage !== "home") activeSettingsPage = "home";

  els.settingsTitle.textContent = isHome ? "Settings" : config.title;
  els.settingsHome.hidden = !isHome;
  els.settingsEditor.hidden = isHome;
  els.settingsBack.hidden = isHome;
  els.saveSettings.hidden = isHome || !config.canSave;

  document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.hidden = isHome || panel.dataset.settingsPanel !== config.panel;
  });

  if (isHome) {
    filterSettingsDirectory();
    return;
  }

  if (config.userMode) {
    activeUserSettingsMode = config.userMode;
    els.userSettingsHeading.textContent = config.title;
    renderUserSettings();
    return;
  }

  if (config.panel === "priorities") renderPrioritySettings();
  if (config.panel === "statuses") renderStatusSettings();
  if (config.panel === "categories") renderCategorySettings();
  if (config.panel === "companies") renderCompanySettings();
}

function renderPrioritySettings() {
  els.prioritySettingsList.innerHTML = prioritySettings.map((priority, index) => `
    <div class="setting-row" data-setting-type="priority" data-index="${index}">
      <input class="setting-input" data-setting-field="label" value="${escapeHtml(priority.label)}" placeholder="Priority" />
      <label class="check-label"><input data-setting-field="active" type="checkbox"${priority.active ? " checked" : ""} /> Active</label>
      <button class="ghost-icon" data-remove-setting type="button" title="Remove priority" aria-label="Remove priority">X</button>
    </div>
  `).join("");
}

function renderStatusSettings() {
  els.statusSettingsList.innerHTML = statusSettings.map((status, index) => `
    <div class="setting-row status-setting-row" data-setting-type="status" data-index="${index}">
      <input class="setting-input" data-setting-field="label" value="${escapeHtml(status.label)}" placeholder="Status" />
      <label class="check-label"><input data-setting-field="isResolved" type="checkbox"${status.isResolved ? " checked" : ""} /> Done</label>
      <label class="check-label"><input data-setting-field="active" type="checkbox"${status.active ? " checked" : ""} /> Active</label>
      <button class="ghost-icon" data-remove-setting type="button" title="Remove status" aria-label="Remove status">X</button>
    </div>
  `).join("");
}

function renderCategorySettings() {
  renderCategoryDatalists();
  const rows = categoryOptions
    .map((category, index) => ({ category, index }))
    .filter(({ category }) => {
      if (!categorySettingsSearch) return true;
      return categoryOptionLabel(category).toLowerCase().includes(categorySettingsSearch);
    });

  if (!rows.length) {
    els.categorySettingsList.innerHTML = `<div class="empty-state">No categories found</div>`;
    return;
  }

  els.categorySettingsList.innerHTML = rows.map(({ category, index }) => `
    <div class="setting-row category-setting-row" data-setting-type="category" data-index="${index}">
      <input class="setting-input" list="categoryLevelOneOptions" data-setting-field="category" value="${escapeHtml(category.category)}" placeholder="Category" />
      <input class="setting-input" list="categoryLevelTwoOptions" data-setting-field="subCategory" value="${escapeHtml(category.subCategory)}" placeholder="Sub-category" />
      <input class="setting-input" list="categoryLevelThreeOptions" data-setting-field="thirdCategory" value="${escapeHtml(category.thirdCategory)}" placeholder="Third category" />
      <input class="setting-input category-description-input" data-setting-field="description" value="${escapeHtml(category.description)}" placeholder="Description" />
      <div class="category-row-flags">
        <label class="check-label"><input data-setting-field="visibleSsp" type="checkbox"${category.visibleSsp ? " checked" : ""} /> SSP</label>
        <label class="check-label"><input data-setting-field="visibleAdmin" type="checkbox"${category.visibleAdmin ? " checked" : ""} /> Admin</label>
        <label class="check-label"><input data-setting-field="enableIncident" type="checkbox"${category.enableIncident ? " checked" : ""} /> Incident</label>
        <label class="check-label"><input data-setting-field="enableRequest" type="checkbox"${category.enableRequest ? " checked" : ""} /> Request</label>
        <label class="check-label"><input data-setting-field="enableChange" type="checkbox"${category.enableChange ? " checked" : ""} /> Change</label>
        <label class="check-label"><input data-setting-field="enableProblem" type="checkbox"${category.enableProblem ? " checked" : ""} /> Problem</label>
      </div>
      <button class="ghost-icon" data-remove-setting type="button" title="Remove category" aria-label="Remove category">X</button>
    </div>
  `).join("");
}

function uniqueCategoryValues(field) {
  return [...new Set(categoryOptions.map((category) => normalizeCategoryOption(category)[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function optionValueMarkup(values) {
  return values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function normalizeMatchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function categoryAddMatchesSelection(option, field, selectedValue) {
  const selected = normalizeMatchValue(selectedValue);
  if (!selected) return true;
  const value = normalizeMatchValue(normalizeCategoryOption(option)[field]);
  return value === selected;
}

function uniqueCategoryValuesForSelection(field, filters = {}) {
  const values = categoryOptions
    .map(normalizeCategoryOption)
    .filter((category) => {
      return categoryAddMatchesSelection(category, "category", filters.category)
        && categoryAddMatchesSelection(category, "subCategory", filters.subCategory);
    })
    .map((category) => category[field])
    .filter(Boolean);
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function renderCategoryDatalists() {
  els.categoryLevelOneOptions.innerHTML = optionValueMarkup(uniqueCategoryValues("category"));
  els.categoryLevelTwoOptions.innerHTML = optionValueMarkup(uniqueCategoryValues("subCategory"));
  els.categoryLevelThreeOptions.innerHTML = optionValueMarkup(uniqueCategoryValues("thirdCategory"));
  updateCategoryAddLevelOptions();
}

function updateCategoryAddLevelOptions() {
  const selectedCategory = els.newCategoryName.value.trim();
  const selectedSubCategory = els.newSubCategoryName.value.trim();
  els.categoryAddLevelOneOptions.innerHTML = optionValueMarkup(uniqueCategoryValues("category"));
  els.categoryAddLevelTwoOptions.innerHTML = optionValueMarkup(uniqueCategoryValuesForSelection("subCategory", { category: selectedCategory }));
  els.categoryAddLevelThreeOptions.innerHTML = optionValueMarkup(uniqueCategoryValuesForSelection("thirdCategory", {
    category: selectedCategory,
    subCategory: selectedSubCategory,
  }));
}

function showCategoryAddForm() {
  resetCategoryAddForm();
  renderCategoryDatalists();
  els.categoryAddForm.hidden = false;
  els.newCategoryName.focus();
}

function hideCategoryAddForm() {
  els.categoryAddForm.hidden = true;
  resetCategoryAddForm();
}

function resetCategoryAddForm() {
  els.categoryAddForm.reset();
  els.newCategoryVisibleSsp.checked = true;
  els.newCategoryVisibleAdmin.checked = true;
  els.newCategoryIncident.checked = true;
  els.newCategoryRequest.checked = true;
  els.newCategoryChange.checked = true;
  els.newCategoryProblem.checked = true;
  categoryAddMode = "done";
  updateCategoryAddLevelOptions();
}

function categoryFromAddForm() {
  return normalizeCategoryOption({
    id: `new-category-${Date.now()}`,
    category: els.newCategoryName.value.trim(),
    subCategory: els.newSubCategoryName.value.trim(),
    thirdCategory: els.newThirdCategoryName.value.trim(),
    description: els.newCategoryDescription.value.trim(),
    visibleSsp: els.newCategoryVisibleSsp.checked,
    visibleAdmin: els.newCategoryVisibleAdmin.checked,
    enableIncident: els.newCategoryIncident.checked,
    enableRequest: els.newCategoryRequest.checked,
    enableChange: els.newCategoryChange.checked,
    enableProblem: els.newCategoryProblem.checked,
    sortOrder: categoryOptions.length + 1,
  });
}

function saveCategoryFromForm(event) {
  event.preventDefault();
  const mode = event.submitter?.dataset.categoryAddMode || categoryAddMode;
  const category = categoryFromAddForm();
  if (!category.category || !category.subCategory) {
    alert("Category and Sub-Category are required.");
    return;
  }
  if (!category.enableIncident && !category.enableRequest && !category.enableChange && !category.enableProblem) {
    alert("Select at least one ticket type for this category.");
    return;
  }
  const nextKey = categoryOptionKey(category).toLowerCase();
  if (categoryOptions.some((option) => categoryOptionKey(option).toLowerCase() === nextKey)) {
    alert("That category already exists.");
    return;
  }

  categoryOptions.push(category);
  renderCategorySettings();
  renderCategoryOptions(els.categoryInput.value);

  if (mode === "new") {
    resetCategoryAddForm();
    els.newCategoryName.focus();
    return;
  }

  hideCategoryAddForm();
}

function renderCompanySettings() {
  if (!activeCompanyId && companies.length) {
    activeCompanyId = companies[0].id;
  }
  if (activeCompanyId && !companies.some((company) => company.id === activeCompanyId)) {
    activeCompanyId = companies[0]?.id || null;
  }

  renderCompanyList();
  const selectedCompany = activeCompanyId
    ? companies.find((company) => company.id === activeCompanyId)
    : null;
  renderCompanyForm(selectedCompany || blankCompany());
}

function renderCompanyList() {
  if (!companies.length) {
    els.companySettingsList.innerHTML = `<div class="empty-state">No companies yet</div>`;
    return;
  }

  els.companySettingsList.innerHTML = companies.map((company) => {
    const location = companyLocationLine(company);
    return `
      <button class="company-list-item${company.id === activeCompanyId ? " active" : ""}" type="button" data-company-id="${company.id}">
        <strong>${escapeHtml(company.name || "Unnamed company")}</strong>
        <span>${escapeHtml(location || "No location")}</span>
        <small>${company.active ? "Active" : "Inactive"} - ${company.theme === "dark" ? "Dark" : "Light"} theme</small>
      </button>
    `;
  }).join("");
}

function companyLocationLine(company) {
  return [
    [company.city, company.state].filter(Boolean).join(", "),
    company.zip,
  ].filter(Boolean).join(" ");
}

function startNewCompany() {
  activeCompanyId = null;
  renderCompanyList();
  renderCompanyForm(blankCompany());
  els.companyName.focus();
}

function selectCompanyFromEvent(event) {
  const button = event.target.closest("[data-company-id]");
  if (!button) return;
  activeCompanyId = Number(button.dataset.companyId) || null;
  renderCompanySettings();
}

function renderCompanyForm(company) {
  const normalized = normalizeCompany(company);
  pendingCompanyLogoDataUrl = normalized.logoDataUrl;
  pendingCompanyLogoName = normalized.logoName;

  els.companyId.value = normalized.id || "";
  els.companyName.value = normalized.name;
  els.companyPhone.value = normalized.phone;
  els.companyAddress.value = normalized.address;
  els.companyAddress2.value = normalized.address2;
  els.companyCity.value = normalized.city;
  els.companyState.value = normalized.state;
  els.companyZip.value = normalized.zip;
  els.companyTheme.value = normalized.theme;
  els.companyNotes.value = normalized.notes;
  els.companyActive.checked = normalized.active;
  els.companyLogoInput.value = "";
  updateCompanyLogoPreview();
}

function updateCompanyLogoPreview() {
  const hasUploadedLogo = pendingCompanyLogoDataUrl !== "";
  els.companyLogoPreview.src = hasUploadedLogo ? pendingCompanyLogoDataUrl : defaultCompanyLogo;
  els.companyLogoName.textContent = hasUploadedLogo
    ? pendingCompanyLogoName || "Uploaded logo"
    : "Default logo";
}

function readCompanyLogoFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Please choose an image file.");
    event.target.value = "";
    return;
  }
  if (file.size > maxCompanyLogoBytes) {
    alert("Logo images need to be under 1.5 MB.");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    pendingCompanyLogoDataUrl = String(reader.result || "");
    pendingCompanyLogoName = file.name;
    updateCompanyLogoPreview();
  });
  reader.addEventListener("error", () => {
    alert("Logo could not be read.");
    event.target.value = "";
  });
  reader.readAsDataURL(file);
}

function restoreCompanyLogo() {
  pendingCompanyLogoDataUrl = "";
  pendingCompanyLogoName = "";
  els.companyLogoInput.value = "";
  updateCompanyLogoPreview();
}

function collectCompanyForm() {
  return normalizeCompany({
    id: Number(els.companyId.value) || null,
    name: els.companyName.value.trim(),
    phone: els.companyPhone.value.trim(),
    address: els.companyAddress.value.trim(),
    address2: els.companyAddress2.value.trim(),
    city: els.companyCity.value.trim(),
    state: els.companyState.value.trim(),
    zip: els.companyZip.value.trim(),
    theme: els.companyTheme.value,
    notes: els.companyNotes.value.trim(),
    logoName: pendingCompanyLogoName,
    logoDataUrl: pendingCompanyLogoDataUrl,
    logoUrl: defaultCompanyLogo,
    active: els.companyActive.checked,
  });
}

async function saveCompany(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const payload = collectCompanyForm();

  if (!payload.name) {
    alert("Company name is required.");
    els.companyName.focus();
    return;
  }

  if (submitButton) submitButton.disabled = true;
  try {
    const result = await apiRequest("action=save-company", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    companies = Array.isArray(result.companies) ? result.companies.map(normalizeCompany) : companies;
    const savedCompany = payload.id
      ? companies.find((company) => company.id === payload.id)
      : companies.find((company) => company.name.toLowerCase() === payload.name.toLowerCase());
    activeCompanyId = savedCompany?.id || companies[0]?.id || null;
    renderCompanySettings();
  } catch (error) {
    alert(error.message || "Company could not be saved.");
    console.error(error);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function renderUserSettings() {
  const visibleUsers = users.filter(userMatchesSettingsMode);

  if (!visibleUsers.length) {
    els.userSettingsList.innerHTML = `<div class="empty-state">No ${activeUserSettingsMode === "end-users" ? "end users" : "admins"} yet</div>`;
    return;
  }

  els.userSettingsList.innerHTML = visibleUsers.map((user) => {
    const roles = [...new Set(["Tier 1 Tech", "Tier 2 Tech", "Admin", "End User", user.role].filter(Boolean))];
    return `
      <div class="setting-row user-setting-row" data-user-id="${user.id}">
        <input class="setting-input" data-user-field="name" value="${escapeHtml(user.name)}" placeholder="Name" />
        <input class="setting-input" data-user-field="email" type="email" value="${escapeHtml(user.email)}" placeholder="Email" />
        <select class="setting-input" data-user-field="role">
          ${roles.map((role) => `<option${role === user.role ? " selected" : ""}>${escapeHtml(role)}</option>`).join("")}
        </select>
        <input class="setting-input" data-user-field="temporaryPassword" type="password" placeholder="Reset password" />
        <label class="check-label"><input data-user-field="isTech" type="checkbox"${user.isTech !== false ? " checked" : ""} /> Tech</label>
        <label class="check-label"><input data-user-field="active" type="checkbox"${user.active !== false ? " checked" : ""} /> Active</label>
        <button class="secondary-button" data-save-user type="button">Save</button>
      </div>
    `;
  }).join("");
}

function userMatchesSettingsMode(user) {
  const role = (user.role || "").toLowerCase();
  const isEndUser = role === "end user" || user.isTech === false;
  return activeUserSettingsMode === "end-users" ? isEndUser : !isEndUser;
}

function addSettingRow(type) {
  if (type === "priority") {
    prioritySettings.push({ id: `new-priority-${Date.now()}`, label: "", sortOrder: prioritySettings.length + 1, active: true });
    renderPrioritySettings();
  }
  if (type === "status") {
    statusSettings.push({ id: `new-status-${Date.now()}`, label: "", sortOrder: statusSettings.length + 1, active: true, isResolved: false });
    renderStatusSettings();
  }
  if (type === "category") {
    showCategoryAddForm();
  }
}

function updateSettingFromEvent(event) {
  const row = event.target.closest(".setting-row");
  if (!row || !event.target.dataset.settingField) return;
  const index = Number(row.dataset.index);
  const type = row.dataset.settingType;
  const field = event.target.dataset.settingField;
  const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
  const collection = type === "priority" ? prioritySettings : type === "status" ? statusSettings : categoryOptions;
  if (!collection[index]) return;
  collection[index][field] = value;
  if (type === "category") {
    collection[index] = normalizeCategoryOption(collection[index]);
    renderCategoryOptions(els.categoryInput.value);
  }
}

function removeSettingFromEvent(event) {
  const button = event.target.closest("[data-remove-setting]");
  if (!button) return;
  const row = button.closest(".setting-row");
  const index = Number(row.dataset.index);
  const type = row.dataset.settingType;
  if (type === "priority") {
    prioritySettings.splice(index, 1);
    renderPrioritySettings();
  }
  if (type === "status") {
    statusSettings.splice(index, 1);
    renderStatusSettings();
  }
  if (type === "category") {
    categoryOptions.splice(index, 1);
    renderCategorySettings();
  }
}

async function saveSettings() {
  els.saveSettings.disabled = true;
  const originalText = els.saveSettings.textContent;
  els.saveSettings.textContent = "Saving";

  try {
    const result = await apiRequest("action=save-settings", {
      method: "POST",
      body: JSON.stringify({
        priorities: prioritySettings,
        statuses: statusSettings,
        categories: categoryOptions,
      }),
    });
    applySettings(result.settings || {});
    renderFilterOptions();
    renderAssigneeOptions();
    renderSettings();
    renderDashboard();
    renderReports();
    updateMetrics();
  } catch (error) {
    alert(error.message || "Settings could not be saved.");
    console.error(error);
  } finally {
    els.saveSettings.disabled = false;
    els.saveSettings.textContent = originalText;
  }
}

async function saveNewUser(event) {
  event.preventDefault();
  try {
    const result = await apiRequest("action=save-user", {
      method: "POST",
      body: JSON.stringify({
        name: els.newUserName.value.trim(),
        email: els.newUserEmail.value.trim(),
        role: els.newUserRole.value,
        temporaryPassword: els.newUserPassword.value,
        isTech: els.newUserIsTech.checked,
        active: true,
      }),
    });
    users = result.users || users;
    els.addUserForm.reset();
    setNewUserDefaults();
    renderUsers();
    renderAssigneeOptions();
    renderUserSettings();
  } catch (error) {
    alert(error.message || "User could not be saved.");
    console.error(error);
  }
}

async function saveUserFromEvent(event) {
  const button = event.target.closest("[data-save-user]");
  if (!button) return;
  const row = button.closest(".setting-row");
  const user = collectUserRow(row);
  button.disabled = true;
  try {
    const result = await apiRequest("action=save-user", {
      method: "POST",
      body: JSON.stringify(user),
    });
    users = result.users || users;
    renderUsers();
    renderAssigneeOptions();
    renderUserSettings();
  } catch (error) {
    alert(error.message || "User could not be saved.");
    console.error(error);
  } finally {
    button.disabled = false;
  }
}

function collectUserRow(row) {
  const user = { id: Number(row.dataset.userId) };
  row.querySelectorAll("[data-user-field]").forEach((field) => {
    const key = field.dataset.userField;
    user[key] = field.type === "checkbox" ? field.checked : field.value.trim();
  });
  return user;
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
    { name: "New", statuses: ["New", "Open"] },
    { name: "In Progress", statuses: ["In Progress", "Escalated"] },
    { name: "Waiting", statuses: ["Waiting on Customer", "User Responded", "Pending Vendor", "On Hold"] },
    { name: "Done", statuses: resolvedStatuses },
  ];
  const assignedStatuses = new Set(columns.flatMap((column) => column.statuses));
  const otherStatuses = statusOptions.filter((status) => !assignedStatuses.has(status));
  if (otherStatuses.length) {
    columns.splice(3, 0, { name: "Other", statuses: otherStatuses });
  }

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
  const activeUsers = users.filter((user) => user.active !== false);
  els.userList.innerHTML = activeUsers.map((user) => `
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
  const index = priorityOptions.indexOf(priority);
  return index === -1 ? 999 : index + 1;
}

function highPriorityOptions() {
  return priorityOptions.slice(0, Math.min(2, priorityOptions.length));
}

function getTicketAge(ticket) {
  const diff = Date.now() - new Date(ticket.requestTime).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
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
