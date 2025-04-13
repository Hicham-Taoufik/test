(() => {
  // --- Configuration & Constants ---
  const CONFIG = {
    API_BASE_URL: "https://workflows.aphelionxinnovations.com",
    QR_TARGET_BASE_URL: "app://medilink/patient",
    LOGIN_PAGE_URL: "https://hicham-taoufik.github.io/login/",
    TOKEN_KEY: "authToken",
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
    MESSAGE_DISPLAY_TIME: 7000,
    TOAST_DISPLAY_TIME: 4000,

    // API Endpoints
    CREATE_PATIENT_ENDPOINT: "/webhook/create-patient",
    GET_PATIENT_ENDPOINT: "/webhook/get-patient",
    EXTRACT_ID_ENDPOINT: "/webhook/extract-id-info",
    GET_MUTUELLES_ENDPOINT: "/webhook/get-mutuelles",
    GET_DOCTORS_ENDPOINT: "/webhook/get-doctors",
  };

  // --- DOM Elements ---
  const DOM = {
    // Key elements from the HTML
    body: document.body,
    messageDiv: document.getElementById("message"),

    // Create Patient
    createForm: document.getElementById("createForm"),
    createResultDiv: document.getElementById("createResult"),
    createResultMessage: document.getElementById("createResultMessage"),
    createQrCodeImage: document.getElementById("createQrCodeImage"),

    // Search
    searchForm: document.getElementById("searchForm"),
    searchButton: document.getElementById("searchBtn"),
    cinInput: document.getElementById("getCin"),
    resultDiv: document.getElementById("getResult"),

    // Additional form fields
    mutuelleInput: document.getElementById("mutuelle"),
    doctorInput: document.getElementById("doctor"),

    // ID Capture elements
    captureIdButton: document.getElementById("captureIdButton"),
    idCaptureContainer: document.getElementById("idCaptureContainer"),
    idVideo: document.getElementById("idVideo"),
    takePhotoButton: document.getElementById("takePhotoButton"),
    cancelCaptureButton: document.getElementById("cancelCaptureButton"),
    captureMessage: document.getElementById("captureMessage"),
    idCanvas: document.getElementById("idCanvas"),
    frontPreview: document.getElementById("frontPreview"),
    backPreview: document.getElementById("backPreview"),
    captureInstruction: document.getElementById("captureInstruction"),

    // Toast
    toast: document.getElementById("toast"),
  };

  // --- State Variables ---
  let currentIPP = null;
  let sessionTimeoutId = null;
  let idCaptureStream = null;
  let frontImageBlob = null;
  let backImageBlob = null;
  let isCapturingFront = true;

  // --- Utility Functions ---
  function showToast(message, type = "success") {
    if (!message || !DOM.toast) return;
    const icon =
      type === "success"
        ? '<i class="fas fa-check-circle" aria-hidden="true"></i>'
        : '<i class="fas fa-exclamation-circle" aria-hidden="true"></i>';
    DOM.toast.innerHTML = `${icon} ${message}`;
    DOM.toast.className = `toast ${type}`;
    DOM.toast.classList.add("show");
    setTimeout(() => {
      DOM.toast.classList.remove("show");
    }, CONFIG.TOAST_DISPLAY_TIME);
  }

  function sanitizeInput(input) {
    if (input == null) return "";
    const temp = document.createElement("div");
    temp.textContent = String(input);
    return temp.innerHTML;
  }

  function showMessage(elementId, message, type = "info") {
    const el = document.getElementById(elementId);
    if (!el) {
      console.error(`showMessage Error: Element ID "${elementId}" not found.`);
      return;
    }
    const statusIcons = {
      info: "fas fa-info-circle",
      success: "fas fa-check-circle",
      warning: "fas fa-exclamation-triangle",
      error: "fas fa-times-circle",
      loading: "fas fa-spinner fa-spin",
    };
    const iconClass = statusIcons[type] || statusIcons.info;
    const iconHtml =
      message && type !== "result"
        ? `<i class="${iconClass}" style="margin-right: 6px;" aria-hidden="true"></i>`
        : "";
    el.innerHTML = message ? `${iconHtml}${message}` : "";
    el.style.display = message ? "block" : "none";
    el.className = "";

    if (elementId === "createResult") {
      // Additional styling for createResult area
      const isResult = type === "result";
      const baseBg = isResult
        ? "var(--success-light)"
        : type === "warning"
        ? "var(--warning-light)"
        : type === "error"
        ? "var(--danger-light)"
        : "transparent";
      const baseBorder = isResult
        ? "var(--success)"
        : type === "warning"
        ? "var(--warning)"
        : type === "error"
        ? "var(--danger)"
        : "transparent";
      const textColor = isResult
        ? "var(--success-dark)"
        : type === "warning"
        ? "var(--warning)"
        : type === "error"
        ? "var(--danger)"
        : "inherit";
      el.style.backgroundColor = baseBg;
      el.style.borderLeft = `4px solid ${baseBorder}`;
      el.style.textAlign = "center";
      el.style.marginTop = "20px";
      el.style.padding = "1rem";
      el.style.borderRadius = "var(--border-radius)";
      const msgP = el.querySelector("#createResultMessage");
      if (msgP) {
        msgP.style.color = textColor;
        msgP.textContent = message ? message : "";
      }
    } else {
      el.className = "message";
      if (type) el.classList.add(`message-${type}`);
    }

    if (
      type !== "error" &&
      type !== "result" &&
      type !== "loading" &&
      message &&
      elementId === "message"
    ) {
      setTimeout(() => {
        const currentElement = document.getElementById(elementId);
        if (
          currentElement &&
          currentElement.innerHTML &&
          currentElement.innerHTML.includes(message)
        ) {
          currentElement.style.display = "none";
        }
      }, CONFIG.MESSAGE_DISPLAY_TIME);
    }
  }

  function resetSessionTimeout() {
    if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
    sessionTimeoutId = setTimeout(logout, CONFIG.SESSION_TIMEOUT);
  }

  function logout() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    clearTimeout(sessionTimeoutId);
    showToast("Déconnecté.", "success");
    setTimeout(redirectToLogin, 1000);
  }

  function redirectToLogin() {
    window.location.href = CONFIG.LOGIN_PAGE_URL;
  }

  // --- API Call Helper ---
  async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    if (!token) {
      console.error("No token found. Redirecting to login.");
      alert("Session expirée. Veuillez vous reconnecter.");
      redirectToLogin();
      throw new Error("Token non trouvé.");
    }
    resetSessionTimeout();
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
    if (options.body && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    } else if (options.body instanceof FormData) {
      delete headers["Content-Type"];
    }
    try {
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          console.error("Authentication error:", response.status);
          localStorage.removeItem(CONFIG.TOKEN_KEY);
          alert("Session invalide. Veuillez vous reconnecter.");
          redirectToLogin();
          throw new Error(`Authentication Failed: ${response.status}`);
        }
        const errorText = await response.text();
        console.error(
          `API Error ${response.status}: ${errorText || response.statusText}`
        );
        throw new Error(
          `Erreur ${response.status}: ${errorText || response.statusText}`
        );
      }
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        return response.json();
      } else {
        return response.text();
      }
    } catch (error) {
      if (!error.message.startsWith("Authentication Failed")) {
        console.error("Fetch error caught:", error);
      }
      throw error;
    }
  }

  // --- API Service ---
  const apiService = {
    fetchPatient: async (cin) =>
      await fetchWithAuth(`${CONFIG.API_BASE_URL}${CONFIG.GET_PATIENT_ENDPOINT}?cin=${encodeURIComponent(cin)}`),
    createPatient: async (payload) =>
      await fetchWithAuth(`${CONFIG.API_BASE_URL}${CONFIG.CREATE_PATIENT_ENDPOINT}`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    extractIdInfo: async (formData) =>
      await fetchWithAuth(`${CONFIG.API_BASE_URL}${CONFIG.EXTRACT_ID_ENDPOINT}`, {
        method: "POST",
        body: formData,
      }),
    fetchMutuelles: async () =>
      await fetchWithAuth(`${CONFIG.API_BASE_URL}${CONFIG.GET_MUTUELLES_ENDPOINT}`),
    fetchDoctors: async () =>
      await fetchWithAuth(`${CONFIG.API_BASE_URL}${CONFIG.GET_DOCTORS_ENDPOINT}`),
  };

  // --- QR Code Functions ---
  function generateQrData(ipp) {
    if (!ipp) {
      console.error("IPP missing for QR generation.");
      return null;
    }
    const qrTargetUrl = `${CONFIG.QR_TARGET_BASE_URL}?ipp=${encodeURIComponent(ipp)}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrTargetUrl)}&q=M`;
    return { qrTargetUrl, qrImageUrl };
  }

  // Expose printQRCode globally
  window.printQRCode = function (qrImageUrl) {
    if (!qrImageUrl) {
      console.error("No QR Image URL to print.");
      return;
    }
    const printWindow = window.open("", "_blank", "width=400,height=450");
    if (!printWindow) {
      alert("Veuillez autoriser les pop-ups pour imprimer.");
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Imprimer QR Code</title>
        <style>
          body { text-align: center; margin: 20px; font-family: sans-serif; }
          img { max-width: 250px; max-height: 250px; border: 1px solid #ccc; padding: 5px; }
          @media print {
            body { margin: 5mm; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <img src="${qrImageUrl}" alt="QR Code Patient" />
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }, 500);
          };
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // --- ID Capture Functions ---
  function updateCaptureMessage(message, type = "info") {
    showMessage("captureMessage", message, type);
  }

  // (Assume startIdCapture, stopIdCapture, and takePhotoAndExtract if you use ID capture)

  // --- Form Validation Example ---
  function validateField(input, validationFn, errorMessage) {
    if (!input) return true;
    const value = input.value.trim();
    const group = input.closest(".input-group");
    if (!group) return true;
    const isValid = validationFn(value);
    group.classList.toggle("has-error", !isValid);
    input.classList.toggle("input-error", !isValid);
    const errorDiv = group.querySelector(".error-text");
    if (errorDiv) errorDiv.textContent = isValid ? "" : errorMessage;
    return isValid;
  }

  function validateCreateForm() {
    let isValid = true;
    showMessage("message", "", "");
    DOM.createForm?.querySelectorAll(".input-group.has-error").forEach((el) =>
      el.classList.remove("has-error")
    );
    DOM.createForm?.querySelectorAll("input, select").forEach((el) =>
      el.classList.remove("input-error")
    );

    isValid &= validateField(DOM.createForm.nom, (val) => val.length > 0, "Nom requis");
    isValid &= validateField(DOM.createForm.prenom, (val) => val.length > 0, "Prénom requis");
    isValid &= validateField(
      DOM.createForm.cin,
      (val) => /^[A-Za-z]{1,2}\d{5,6}$/.test(val) || val === "",
      "Format CIN invalide (ex: AB123456)"
    );
    isValid &= validateField(DOM.createForm.telephone, (val) => /^0[5-7]\d{8}$/.test(val), "Format téléphone 0Xxxxxxxxx requis");
    isValid &= validateField(DOM.createForm.adresse, (val) => val.length > 0, "Adresse requise");
    isValid &= validateField(DOM.createForm.ville, (val) => val.length > 0, "Ville requise");
    isValid &= validateField(DOM.createForm.date_naissance, (val) => val !== "", "Date naissance requise");
    isValid &= validateField(DOM.createForm.sexe, (val) => val !== "", "Sélection sexe requise");

    if (!isValid) {
      showMessage("message", "Veuillez corriger les erreurs.", "error");
      const firstError = DOM.createForm.querySelector(".input-error");
      firstError?.focus();
    }
    return Boolean(isValid);
  }

  // --- Event Handlers ---
  async function handlePatientSearch() {
    // ...
    // Example search logic
  }

  async function handleCreatePatient(event) {
    event.preventDefault();
    if (!validateCreateForm()) return;

    showMessage("message", '<span class="loading-spinner"></span> Création patient...', "loading");
    DOM.createPatientBtn.disabled = true;
    DOM.createResultDiv.style.display = "none";

    // Attempt to get the createPrintButton fresh
    const createPrintButton = document.getElementById("createPrintButton");
    if (createPrintButton) {
      // This can't throw an error because if it's null, we won't do anything
      createPrintButton.disabled = true;
    } else {
      console.warn("createPrintButton not found. Skipping 'disabled' assignment.");
    }

    const payload = {
      nom: DOM.createForm.nom.value.trim(),
      prenom: DOM.createForm.prenom.value.trim(),
      cin: DOM.createForm.cin.value.trim() || null,
      telephone: DOM.createForm.telephone.value.trim(),
      adresse: DOM.createForm.adresse.value.trim(),
      ville: DOM.createForm.ville.value.trim(),
      date_naissance: DOM.createForm.date_naissance.value,
      sexe: DOM.createForm.sexe.value,
      has_insurance: !!DOM.mutuelleInput.value,
      mutuelle: DOM.mutuelleInput.value.trim() || null,
      doctor: DOM.doctorInput.value || null,
    };
    console.log("Payload for Create Patient:", payload);

    try {
      const createResponse = await apiService.createPatient(payload);
      console.log("Create Patient API Response:", createResponse);
      if (createResponse && createResponse.success && createResponse.ipp) {
        currentIPP = createResponse.ipp;
        console.log(`Patient created (IPP: ${currentIPP})`);
        showToast(createResponse.message || "Patient créé.", "success");

        const qrCodeData = generateQrData(currentIPP);
        if (qrCodeData) {
          showMessage("createResult", `Patient créé (IPP: ${sanitizeInput(currentIPP)})`, "result");
          DOM.createResultMessage.textContent = `Patient créé (IPP: ${sanitizeInput(currentIPP)})`;
          DOM.createQrCodeImage.src = qrCodeData.qrImageUrl;
          DOM.createQrCodeImage.alt = `QR Code pour IPP ${sanitizeInput(currentIPP)}`;

          if (createPrintButton) {
            createPrintButton.disabled = false;
            createPrintButton.onclick = () => window.printQRCode(qrCodeData.qrImageUrl);
          }
          DOM.createResultDiv.style.display = "block";
        } else {
          showMessage("createResult", `Patient créé (IPP: ${sanitizeInput(currentIPP)}). Erreur QR Code.`, "warning");
          DOM.createResultDiv.style.display = "block";
          DOM.createResultMessage.textContent = `Patient créé (IPP: ${sanitizeInput(currentIPP)}). Erreur QR Code.`;
        }
        DOM.createForm.reset();
        $(DOM.mutuelleInput).val(null).trigger("change");
        $(DOM.doctorInput).val(null).trigger("change");
      } else {
        const errorMessage = createResponse?.message || "Réponse invalide ou échec création.";
        throw new Error(errorMessage);
      }
    } catch (apiError) {
      console.error("Create Patient Process Error:", apiError);
      showMessage("message", `Erreur: ${apiError.message}`, "error");
      DOM.createResultDiv.style.display = "none";
    } finally {
      DOM.createPatientBtn.disabled = false;
    }
  }

  // --- Initialization Functions ---
  function populateMutuelleDropdown(mutuelles) {
    // ...
  }
  function populateDoctorsDropdown(doctors) {
    // ...
  }
  async function fetchMutuelles() {
    // ...
  }
  async function fetchDoctors() {
    // ...
  }

  function initializePage() {
    console.log("Initializing page...");
    if (!localStorage.getItem(CONFIG.TOKEN_KEY)) {
      console.log("No token found. Redirecting to login.");
      redirectToLogin();
      return;
    }
    DOM.body.classList.add("loaded");
    console.log("Authenticated. Setting up page.");
    resetSessionTimeout();
    ["mousemove", "keypress", "click", "scroll"].forEach((event) =>
      document.addEventListener(event, resetSessionTimeout, { passive: true })
    );
    fetchMutuelles();
    fetchDoctors();
    console.log("Initial setup complete.");
  }

  // --- Event Listeners ---
  DOM.searchForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    handlePatientSearch();
  });
  DOM.searchButton?.addEventListener("click", (e) => {
    e.preventDefault();
    handlePatientSearch();
  });
  DOM.cinInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handlePatientSearch();
    }
  });
  DOM.createForm?.addEventListener("submit", handleCreatePatient);

  // For ID capture
  DOM.captureIdButton?.addEventListener("click", startIdCapture);
  DOM.takePhotoButton?.addEventListener("click", takePhotoAndExtract);
  DOM.cancelCaptureButton?.addEventListener("click", () => stopIdCapture(true));

  document.addEventListener("DOMContentLoaded", initializePage);
})();
