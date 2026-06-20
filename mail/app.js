let activeFolder = "inbox";
let selectedId = null;
let signedInEmail = "";
let currentMessages = [];
let searchTimer = null;

const messageList = document.querySelector("#messageList");
const readingPane = document.querySelector("#readingPane");
const folderTitle = document.querySelector("#folderTitle");
const searchInput = document.querySelector("#searchInput");
const composeDialog = document.querySelector("#composeDialog");
const composeForm = document.querySelector("#composeForm");
const toast = document.querySelector("#toast");
const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const accountEmail = document.querySelector("#accountEmail");
const topbarTitle = document.querySelector(".mail-topbar h1");

const folderLabels = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  spam: "Spam",
  trash: "Trash"
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (error) {
    data = {
      error: "The mail server returned an unreadable response.",
      detail: raw.slice(0, 500)
    };
  }

  if (!response.ok) {
    const details = [data.error, data.detail].filter(Boolean).join(" ");
    const error = new Error(details || `Request failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  return data;
}

function setLoading(message) {
  messageList.innerHTML = `<div class="no-results">${escapeHtml(message)}</div>`;
}

async function checkSession() {
  try {
    const session = await api("api/session.php");
    if (session.signedIn) {
      signedInEmail = session.email;
      accountEmail.textContent = signedInEmail;
      document.body.classList.remove("auth-locked");
      await loadCounts();
      await loadMailbox("inbox");
      return;
    }

    clearSignedOutState();
  } catch (error) {
    clearSignedOutState();
  }
}

async function loadMailbox(folder = activeFolder) {
  activeFolder = folder;
  selectedId = null;
  currentMessages = [];
  updateActiveFolder();
  updateTitles();
  renderEmpty("Loading mail", "Connecting to your mailbox...");
  setLoading("Loading messages...");

  try {
    const query = searchInput.value.trim();
    const data = await api(`api/messages.php?folder=${encodeURIComponent(activeFolder)}&q=${encodeURIComponent(query)}`, {
      headers: {}
    });
    currentMessages = data.messages || [];
    selectedId = currentMessages[0]?.id || null;
    await loadCounts();
    renderList();
    if (selectedId) {
      await loadMessage(selectedId);
    } else {
      const debugText = formatMailboxDebug(data.debug);
      if (debugText) {
        messageList.innerHTML = `<div class="no-results">${escapeHtml(debugText)}</div>`;
        renderEmpty("No messages", debugText);
      } else {
        renderEmpty("No messages", "This folder does not have any messages to show.");
      }
    }
  } catch (error) {
    await loadCounts();
    messageList.innerHTML = `<div class="no-results">${escapeHtml(error.message)}</div>`;
    renderEmpty("Could not load mail", error.message);
    if (error.status === 401) {
      document.body.classList.add("auth-locked");
    }
  }
}

function renderList() {
  messageList.innerHTML = "";

  if (!currentMessages.length) {
    messageList.innerHTML = '<div class="no-results">No messages found.</div>';
    return;
  }

  currentMessages.forEach((message) => {
    const primaryName = activeFolder === "sent"
      ? `To: ${message.to || message.toEmail || "(Unknown recipient)"}`
      : (message.from || message.email || "(Unknown sender)");
    const secondaryLine = activeFolder === "sent"
      ? (message.toEmail || message.to || "")
      : (message.email || message.from || "");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `message-row ${message.unread ? "unread" : ""} ${message.id === selectedId ? "selected" : ""}`;
    button.dataset.id = message.id;
    button.innerHTML = `
      <span class="message-meta">
        <strong>${escapeHtml(primaryName)}</strong>
        <span>${escapeHtml(message.time || "")}</span>
      </span>
      <span class="message-subject">${escapeHtml(message.subject || "(No subject)")}</span>
      <span class="message-preview">${escapeHtml(secondaryLine ? `${secondaryLine} - ${message.preview || ""}` : message.preview || "")}</span>
      <span class="message-tag">${escapeHtml(message.tag || folderLabels[activeFolder] || activeFolder)}</span>
    `;
    button.addEventListener("click", async () => {
      selectedId = message.id;
      renderList();
      renderReadingPane(message);
      await loadMessage(message.id, message.messageNumber, message);
    });
    messageList.appendChild(button);
  });
}

async function loadMessage(id, messageNumber = 0, fallbackMessage = null) {
  try {
    const data = await api(`api/message.php?folder=${encodeURIComponent(activeFolder)}&id=${encodeURIComponent(id)}&messageNumber=${encodeURIComponent(messageNumber || 0)}`, {
      headers: {}
    });
    if (!data.message) {
      throw new Error("The server did not return this message. Refresh the folder and try again.");
    }
    renderReadingPane(data.message);
  } catch (error) {
    if (fallbackMessage?.body || fallbackMessage?.preview) {
      renderReadingPane({
        ...fallbackMessage,
        body: fallbackMessage.body || fallbackMessage.preview
      });
      showToast("Opened from mailbox preview because the full message lookup failed.");
      return;
    }

    renderEmpty("Could not open message", error.message);
  }
}

function renderReadingPane(message) {
  const sentView = activeFolder === "sent";
  const contactLabel = sentView ? "To" : "From";
  const contactName = sentView
    ? (message.to || message.toEmail || "(Unknown recipient)")
    : (message.from || "(Unknown sender)");
  const contactEmail = sentView ? (message.toEmail || "") : (message.email || "");

  readingPane.innerHTML = `
    <div class="reading-content">
      <header class="reading-header">
        <div>
          <p class="message-tag">${escapeHtml(message.tag || folderLabels[activeFolder] || activeFolder)}</p>
          <h2>${escapeHtml(message.subject || "(No subject)")}</h2>
        </div>
      </header>
      <div class="sender-line">
        <span>${escapeHtml(initials(contactName || contactEmail || "?"))}</span>
        <div>
          <strong>${escapeHtml(contactLabel)}: ${escapeHtml(contactName)}</strong>
          <p>${escapeHtml(contactEmail)}</p>
        </div>
        <time>${escapeHtml(message.time || "")}</time>
      </div>
      <div class="message-body">
        ${String(message.body || "").split("\n").map((paragraph) => `<p>${escapeHtml(paragraph || " ")}</p>`).join("")}
      </div>
    </div>
    <div class="quick-reply">
      <div class="quick-reply-inner">
        <textarea id="quickReplyBody" rows="3" placeholder="Start a reply..."></textarea>
        <button class="button primary" type="button" id="replyButton">Reply</button>
      </div>
    </div>
  `;

  document.querySelector("#replyButton").addEventListener("click", () => {
    const quickReplyBody = document.querySelector("#quickReplyBody")?.value.trim() || "";
    const replyTo = sentView ? (message.toEmail || message.to || "") : (message.email || "");
    openCompose(replyTo, replySubject(message.subject || ""), quickReplyBody, "body");
  });
}

function renderEmpty(title = "Select a message", body = "Choose an email from the list to read it here.") {
  readingPane.innerHTML = `
    <div class="empty-state">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(body)}</p>
    </div>
  `;
}

function initials(name) {
  return String(name)
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function renderCounts(counts) {
  Object.entries(counts).forEach(([key, value]) => {
    const count = document.querySelector(`#${key}Count`);
    if (count) count.textContent = value;
  });
}

function formatMailboxDebug(debug) {
  if (!Array.isArray(debug) || !debug.length) return "";

  return debug.map((item) => {
    const errors = Array.isArray(item.imapErrors) && item.imapErrors.length
      ? ` errors: ${item.imapErrors.join(" | ")}`
      : "";
    const source = item.source ? ` using ${item.source}` : "";
    return `${item.folder}${source}: selected ${item.selectedMessages}, returned ${item.returnedMessages}.${errors}`;
  }).join("\n");
}

function clearSignedOutState() {
  signedInEmail = "";
  selectedId = null;
  currentMessages = [];
  accountEmail.textContent = "Not signed in";
  renderCounts({ inbox: 0, sent: 0, drafts: 0, archive: 0, spam: 0, trash: 0 });
  messageList.innerHTML = "";
  renderEmpty("Sign in to your mailbox", "Your real emails will appear here after sign in.");
  document.body.classList.add("auth-locked");
}

async function loadCounts() {
  try {
    const data = await api("api/counts.php", { headers: {} });
    renderCounts(data.counts || {});
  } catch (error) {
    renderCounts({ [activeFolder]: currentMessages.length });
  }
}

function updateTitles() {
  const label = folderLabels[activeFolder] || activeFolder;
  folderTitle.textContent = label;
  topbarTitle.textContent = label;
}

function updateActiveFolder() {
  document.querySelectorAll(".mailbox-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.folder === activeFolder);
  });
}

function openCompose(to = "", subject = "", body = "", focusTarget = "") {
  document.querySelector("#composeTo").value = to;
  document.querySelector("#composeSubject").value = subject;
  const composeBody = document.querySelector("#composeBody");
  composeBody.value = body;
  composeDialog.showModal();
  const target = focusTarget === "body" || to ? composeBody : document.querySelector("#composeTo");
  target.focus();
  if (target === composeBody) {
    composeBody.setSelectionRange(composeBody.value.length, composeBody.value.length);
  }
}

function replySubject(subject = "") {
  return /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`;
}

document.querySelectorAll(".mailbox-link").forEach((button) => {
  button.addEventListener("click", () => {
    searchInput.value = "";
    loadMailbox(button.dataset.folder);
  });
});

searchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => loadMailbox(activeFolder), 350);
});

document.querySelector("#composeButton").addEventListener("click", () => openCompose());
document.querySelector("#composeButtonTop").addEventListener("click", () => openCompose());

document.querySelector("#replyTop").addEventListener("click", () => {
  const message = currentMessages.find((item) => item.id === selectedId);
  if (!message) return showToast("Select a message first.");
  const replyTo = activeFolder === "sent" ? (message.toEmail || message.to || "") : (message.email || "");
  openCompose(replyTo, replySubject(message.subject || ""), "");
});

document.querySelector("#forwardTop").addEventListener("click", () => {
  const message = currentMessages.find((item) => item.id === selectedId);
  if (!message) return showToast("Select a message first.");
  openCompose("", `Fwd: ${message.subject || ""}`, `\n\n---------- Forwarded message ----------\n${message.preview || ""}`);
});

document.querySelector("#archiveTop").addEventListener("click", () => {
  moveSelectedMessage("archive");
});

document.querySelector("#deleteTop").addEventListener("click", () => {
  moveSelectedMessage("trash");
});

document.querySelector("#closeCompose").addEventListener("click", () => {
  composeDialog.close();
});

document.querySelector("#saveDraft").addEventListener("click", async () => {
  const to = document.querySelector("#composeTo").value.trim();
  const subject = document.querySelector("#composeSubject").value.trim();
  const body = document.querySelector("#composeBody").value.trim();

  try {
    await api("api/draft.php", {
      method: "POST",
      body: JSON.stringify({ to, subject, body })
    });
    composeForm.reset();
    composeDialog.close();
    showToast("Draft saved.");
    if (activeFolder === "drafts") {
      await loadMailbox("drafts");
    }
  } catch (error) {
    showToast(error.message);
  }
});

composeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const to = document.querySelector("#composeTo").value.trim();
  const subject = document.querySelector("#composeSubject").value.trim();
  const body = document.querySelector("#composeBody").value.trim();

  try {
    const result = await api("api/send.php", {
      method: "POST",
      body: JSON.stringify({ to, subject, body })
    });
    composeForm.reset();
    composeDialog.close();
    showToast(result.savedToSent ? "Message sent and saved to Sent." : "Message sent, but the Sent copy was not saved.");
    await loadCounts();
    if (result.savedToSent) {
      await loadMailbox("sent");
    }
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#refreshButton").addEventListener("click", () => {
  loadMailbox(activeFolder);
});

document.querySelector("#signOutButton").addEventListener("click", async () => {
  try {
    await api("api/logout.php", { method: "POST", body: "{}" });
  } catch (error) {
    // Still clear the local interface if the session has already expired.
  }

  loginForm.reset();
  clearSignedOutState();
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  try {
    showToast("Signing in...");
    const result = await api("api/login.php", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    signedInEmail = result.email;
    loginPassword.value = "";
    accountEmail.textContent = signedInEmail;
    document.body.classList.remove("auth-locked");
    showToast("Signed in.");
    await loadCounts();
    await loadMailbox("inbox");
  } catch (error) {
    showToast(error.message);
  }
});

async function moveSelectedMessage(destination) {
  if (!selectedId) {
    showToast("Select a message first.");
    return;
  }

  try {
    await api("api/move.php", {
      method: "POST",
      body: JSON.stringify({ id: selectedId, from: activeFolder, to: destination })
    });
    showToast(destination === "trash" ? "Message moved to Trash." : "Message archived.");
    await loadCounts();
    await loadMailbox(activeFolder);
  } catch (error) {
    showToast(error.message);
  }
}

checkSession();
