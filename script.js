const studioConfig = {
  email: "your-email@example.com",
  whatsAppNumber: "639000000000",
  adminEmail: "admin@editwave.com",
  adminPassword: "admin123"
};

const storageKeys = {
  users: "editwave_users",
  requests: "editwave_requests",
  session: "editwave_session"
};

const requestForm = document.getElementById("requestForm");
const requestOutput = document.getElementById("requestOutput");
const copyButton = document.getElementById("copyButton");
const emailLink = document.getElementById("emailLink");
const whatsAppLink = document.getElementById("whatsAppLink");
const packageSelect = document.querySelector('select[name="packageType"]');
const pricingCards = document.querySelectorAll(".pricing-card");
const packageButtons = document.querySelectorAll(".package-button");
const loadPreviewButtons = document.querySelectorAll(".load-preview-button");
const customerRegisterForm = document.getElementById("customerRegisterForm");
const customerLoginForm = document.getElementById("customerLoginForm");
const adminLoginForm = document.getElementById("adminLoginForm");
const authMessage = document.getElementById("authMessage");
const customerRequestsList = document.getElementById("customerRequestsList");
const adminRequestsList = document.getElementById("adminRequestsList");
const adminPanel = document.getElementById("adminPanel");
const sessionLabel = document.getElementById("sessionLabel");
const logoutButton = document.getElementById("logoutButton");
const customerDashboardTitle = document.getElementById("customerDashboardTitle");

function readStorage(key, fallbackValue) {
  try {
    const rawValue = localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallbackValue;
  } catch (error) {
    return fallbackValue;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getUsers() {
  return readStorage(storageKeys.users, []);
}

function saveUsers(users) {
  writeStorage(storageKeys.users, users);
}

function getRequests() {
  return readStorage(storageKeys.requests, []);
}

function saveRequests(requests) {
  writeStorage(storageKeys.requests, requests);
}

function getSession() {
  return readStorage(storageKeys.session, null);
}

function saveSession(session) {
  if (!session) {
    localStorage.removeItem(storageKeys.session);
    return;
  }

  writeStorage(storageKeys.session, session);
}

function showMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.style.color = isError ? "#ff9d9d" : "";
}

function normalizeVideoUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.hostname.includes("youtube.com")) {
      const videoId = parsedUrl.searchParams.get("v");
      if (videoId) {
        return { type: "embed", url: `https://www.youtube.com/embed/${videoId}` };
      }
    }

    if (parsedUrl.hostname.includes("youtu.be")) {
      const videoId = parsedUrl.pathname.replace("/", "");
      if (videoId) {
        return { type: "embed", url: `https://www.youtube.com/embed/${videoId}` };
      }
    }

    if (parsedUrl.hostname.includes("vimeo.com")) {
      const videoId = parsedUrl.pathname.split("/").filter(Boolean).pop();
      if (videoId) {
        return { type: "embed", url: `https://player.vimeo.com/video/${videoId}` };
      }
    }

    return { type: "video", url };
  } catch (error) {
    return null;
  }
}

function setPortfolioPreview(targetName, source) {
  const preview = document.querySelector(`[data-preview="${targetName}"]`);
  if (!preview) {
    return;
  }

  if (source.type === "embed") {
    preview.innerHTML = `<iframe src="${source.url}" title="Portfolio video preview" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    return;
  }

  preview.innerHTML = `<video controls playsinline src="${source.url}"></video>`;
}

function buildMessage(formData) {
  const lines = [
    "Hello, I want to request an edit.",
    "",
    `Name: ${formData.get("clientName") || "-"}`,
    `Contact: ${formData.get("clientContact") || "-"}`,
    `Package: ${formData.get("packageType") || "-"}`,
    `Type of Edit: ${formData.get("editType") || "-"}`,
    `Deadline: ${formData.get("deadline") || "-"}`,
    `Reference Link: ${formData.get("referenceLink") || "-"}`,
    "",
    "Project Details:",
    formData.get("projectDetails") || "-"
  ];

  return lines.join("\n");
}

function updateShareLinks(message) {
  const encodedMessage = encodeURIComponent(message);
  emailLink.href = `mailto:${studioConfig.email}?subject=Editing%20Request&body=${encodedMessage}`;
  whatsAppLink.href = `https://wa.me/${studioConfig.whatsAppNumber}?text=${encodedMessage}`;
}

function getPackageBasePrice(packageName) {
  const prices = {
    "Basic Cut - $15": "$15",
    "Content Creator Pack - $25": "$25",
    "Cinematic Edit - $45": "$45",
    "Custom Quote": "Pending Quote"
  };

  return prices[packageName] || "Pending Quote";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderCustomerDashboard() {
  const session = getSession();

  if (!session || session.role !== "customer") {
    customerDashboardTitle.textContent = "Your requests";
    customerRequestsList.innerHTML = '<p class="empty-state">Log in as a customer to see your request history.</p>';
    return;
  }

  customerDashboardTitle.textContent = `${session.name}'s requests`;
  const customerRequests = getRequests().filter((request) => request.customerEmail === session.email);

  if (!customerRequests.length) {
    customerRequestsList.innerHTML = '<p class="empty-state">No requests yet. Submit your first edit request above.</p>';
    return;
  }

  customerRequestsList.innerHTML = customerRequests
    .slice()
    .reverse()
    .map((request) => `
      <article class="request-card">
        <span class="request-status">${escapeHtml(request.status)}</span>
        <h4>${escapeHtml(request.editType)}</h4>
        <p class="request-meta">Package: ${escapeHtml(request.packageType)}</p>
        <p class="request-meta">Deadline: ${escapeHtml(request.deadline || "-")}</p>
        <p class="request-meta">Price: ${escapeHtml(request.price)}</p>
        <p class="request-body">${escapeHtml(request.projectDetails)}</p>
        <p class="request-meta">Admin note: ${escapeHtml(request.adminNote || "No update yet.")}</p>
      </article>
    `)
    .join("");
}

function renderAdminDashboard() {
  const session = getSession();

  if (!session || session.role !== "admin") {
    adminPanel.classList.add("hidden");
    adminRequestsList.innerHTML = '<p class="empty-state">Log in as admin to manage customer orders.</p>';
    return;
  }

  adminPanel.classList.remove("hidden");
  const requests = getRequests();

  if (!requests.length) {
    adminRequestsList.innerHTML = '<p class="empty-state">No edit requests yet.</p>';
    return;
  }

  adminRequestsList.innerHTML = requests
    .slice()
    .reverse()
    .map((request) => `
      <article class="request-card" data-request-id="${request.id}">
        <span class="request-status">${escapeHtml(request.status)}</span>
        <h4>${escapeHtml(request.customerName)} - ${escapeHtml(request.editType)}</h4>
        <p class="request-meta">Contact: ${escapeHtml(request.customerContact)}</p>
        <p class="request-meta">Package: ${escapeHtml(request.packageType)}</p>
        <p class="request-meta">Deadline: ${escapeHtml(request.deadline || "-")}</p>
        <p class="request-meta">Reference: ${escapeHtml(request.referenceLink || "-")}</p>
        <p class="request-body">${escapeHtml(request.projectDetails)}</p>
        <div class="request-actions">
          <select data-field="status">
            <option value="Pending" ${request.status === "Pending" ? "selected" : ""}>Pending</option>
            <option value="In Progress" ${request.status === "In Progress" ? "selected" : ""}>In Progress</option>
            <option value="Revision" ${request.status === "Revision" ? "selected" : ""}>Revision</option>
            <option value="Completed" ${request.status === "Completed" ? "selected" : ""}>Completed</option>
          </select>
          <input data-field="price" type="text" value="${escapeHtml(request.price)}" placeholder="Price">
          <textarea data-field="adminNote" rows="3" placeholder="Admin note">${escapeHtml(request.adminNote || "")}</textarea>
          <button class="button button-primary admin-save-button" type="button">Save update</button>
        </div>
      </article>
    `)
    .join("");

  document.querySelectorAll(".admin-save-button").forEach((button) => {
    button.addEventListener("click", () => {
      const requestCard = button.closest(".request-card");
      const requestId = requestCard?.dataset.requestId;

      if (!requestId) {
        return;
      }

      const status = requestCard.querySelector('[data-field="status"]').value;
      const price = requestCard.querySelector('[data-field="price"]').value.trim() || "Pending Quote";
      const adminNote = requestCard.querySelector('[data-field="adminNote"]').value.trim();
      const requests = getRequests().map((request) => {
        if (request.id !== requestId) {
          return request;
        }

        return {
          ...request,
          status,
          price,
          adminNote
        };
      });

      saveRequests(requests);
      renderCustomerDashboard();
      renderAdminDashboard();
      showMessage("Admin dashboard updated.");
    });
  });
}

function renderSession() {
  const session = getSession();

  if (!session) {
    sessionLabel.textContent = "Not logged in";
    logoutButton.disabled = true;
    showMessage("Create an account or log in to manage edit requests.");
    return;
  }

  logoutButton.disabled = false;
  sessionLabel.textContent = session.role === "admin"
    ? `Admin: ${session.email}`
    : `Customer: ${session.name}`;

  if (session.role === "admin") {
    showMessage("Admin session active. You can manage all edit requests below.");
  } else {
    showMessage(`Customer session active for ${session.name}. You can submit and track edit requests.`);
  }
}

function renderApp() {
  renderSession();
  renderCustomerDashboard();
  renderAdminDashboard();
}

packageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const card = button.closest(".pricing-card");
    const packageValue = card?.dataset.package;

    if (!packageValue) {
      return;
    }

    packageSelect.value = packageValue;
    pricingCards.forEach((pricingCard) => {
      pricingCard.classList.toggle("selected", pricingCard === card);
    });
    packageSelect.focus();
    document.getElementById("request").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

loadPreviewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetName = button.dataset.target;
    const urlInput = document.querySelector(`.portfolio-url[data-target="${targetName}"]`);
    const fileInput = document.querySelector(`.portfolio-file[data-target="${targetName}"]`);
    const file = fileInput?.files?.[0];
    const url = urlInput?.value.trim();

    if (file) {
      setPortfolioPreview(targetName, {
        type: "video",
        url: URL.createObjectURL(file)
      });
      return;
    }

    const normalizedSource = normalizeVideoUrl(url);
    if (normalizedSource) {
      setPortfolioPreview(targetName, normalizedSource);
    }
  });
});

customerRegisterForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(customerRegisterForm);
  const name = formData.get("name").trim();
  const email = formData.get("email").trim().toLowerCase();
  const password = formData.get("password").trim();
  const users = getUsers();

  if (users.some((user) => user.email === email)) {
    showMessage("That customer email is already registered.", true);
    return;
  }

  users.push({ name, email, password, role: "customer" });
  saveUsers(users);
  saveSession({ name, email, role: "customer" });
  customerRegisterForm.reset();
  renderApp();
});

customerLoginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(customerLoginForm);
  const email = formData.get("email").trim().toLowerCase();
  const password = formData.get("password").trim();
  const user = getUsers().find((entry) => entry.email === email && entry.password === password);

  if (!user) {
    showMessage("Customer login failed. Check your email and password.", true);
    return;
  }

  saveSession({ name: user.name, email: user.email, role: "customer" });
  customerLoginForm.reset();
  renderApp();
});

adminLoginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(adminLoginForm);
  const email = formData.get("email").trim().toLowerCase();
  const password = formData.get("password").trim();

  if (email !== studioConfig.adminEmail || password !== studioConfig.adminPassword) {
    showMessage("Admin login failed. Use the demo admin credentials.", true);
    return;
  }

  saveSession({ name: "Admin", email, role: "admin" });
  adminLoginForm.reset();
  renderApp();
});

logoutButton.addEventListener("click", () => {
  saveSession(null);
  renderApp();
});

requestForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(requestForm);
  const message = buildMessage(formData);
  requestOutput.textContent = message;
  updateShareLinks(message);

  const session = getSession();
  if (!session || session.role !== "customer") {
    showMessage("Log in as a customer before saving an edit request.", true);
    return;
  }

  const requests = getRequests();
  requests.push({
    id: `req_${Date.now()}`,
    customerName: formData.get("clientName").trim(),
    customerEmail: session.email,
    customerContact: formData.get("clientContact").trim(),
    packageType: formData.get("packageType").trim(),
    editType: formData.get("editType").trim(),
    deadline: formData.get("deadline").trim(),
    referenceLink: formData.get("referenceLink").trim(),
    projectDetails: formData.get("projectDetails").trim(),
    status: "Pending",
    price: getPackageBasePrice(formData.get("packageType").trim()),
    adminNote: ""
  });

  saveRequests(requests);
  renderCustomerDashboard();
  renderAdminDashboard();
  requestForm.reset();
  pricingCards.forEach((pricingCard) => pricingCard.classList.remove("selected"));
  showMessage("Edit request saved to your customer dashboard.");
});

copyButton.addEventListener("click", async () => {
  const text = requestOutput.textContent.trim();

  if (!text || text.startsWith("Fill out the form")) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    copyButton.textContent = "Copied";
    window.setTimeout(() => {
      copyButton.textContent = "Copy Message";
    }, 1500);
  } catch (error) {
    copyButton.textContent = "Copy Failed";
    window.setTimeout(() => {
      copyButton.textContent = "Copy Message";
    }, 1500);
  }
});

updateShareLinks("Hello, I want to request an edit.");
renderApp();