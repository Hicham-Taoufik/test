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

  // --- DOM Elements (initial references) ---
  const DOM = {
    body: document.body,
    resultDiv: document.getElementById("getResult"),
    messageDiv: document.getElementById("message"),
    createForm: document.getElementById("createForm"),
    createResultDiv: document.getElementById("createResult"),
    createResultMessage: document.getElementById("createResultMessage"),
    createQrCodeImage: document.getElementById("createQrCodeImage"),
    searchForm: document.getElementById("searchForm"),
    searchButton: document.getElementById("searchBtn"),
    cinInput: document.getElementById("getCin"),
    mutuelleInput: document.getElementById("mutuelle"),
    doctorInput: document.getElementById("doctor"),

    // ID capture elements
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

    toast: document.getElementById("toast"),
  };

  // Will be set on DOMContentLoaded, once the button is guaranteed to be in the DOM
  let createPrintButtonRef = null;

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
    if (input === null || input === undefined) return "";
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
      await fetchWithAuth(
        `${CONFIG.API_BASE_URL}${CONFIG.GET_PATIENT_ENDPOINT}?cin=${encodeURIComponent(
          cin
        )}`
      ),
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
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
      qrTargetUrl
    )}&q=M`;
    console.log("Generated QR Target URL:", qrTargetUrl);
    console.log("Generated QR Image URL:", qrImageUrl);
    return { qrTargetUrl, qrImageUrl };
  }

  // Expose printQRCode Globally
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

  async function startIdCapture() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      updateCaptureMessage("Demande caméra...", "loading");
      DOM.captureIdButton.disabled = true;
      DOM.idCaptureContainer.classList.remove("hidden");
      DOM.idCaptureContainer.style.display = "block";
      DOM.frontPreview.classList.add("hidden");
      DOM.frontPreview.src = "";
      DOM.backPreview.classList.add("hidden");
      DOM.backPreview.src = "";
      isCapturingFront = true;
      DOM.captureInstruction.textContent =
        "Positionnez le RECTO de la CIN et prenez la photo.";
      try {
        idCaptureStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        DOM.idVideo.srcObject = idCaptureStream;
        await DOM.idVideo.play();
        updateCaptureMessage("Caméra prête. Prenez la photo du RECTO.", "info");
        DOM.takePhotoButton.disabled = false;
        DOM.cancelCaptureButton.disabled = false;
      } catch (err) {
        console.error("Camera access error:", err);
        updateCaptureMessage(`Erreur caméra: ${err.message}`, "error");
        stopIdCapture(false);
      }
    } else {
      alert("Accès caméra non supporté.");
      updateCaptureMessage("Caméra non supportée.", "error");
      DOM.captureIdButton.disabled = false;
    }
  }

  function stopIdCapture(clearBlobs = true) {
    if (idCaptureStream) {
      idCaptureStream.getTracks().forEach((track) => track.stop());
    }
    DOM.idVideo.srcObject = null;
    DOM.idCaptureContainer.classList.add("hidden");
    DOM.idCaptureContainer.style.display = "none";
    DOM.takePhotoButton.disabled = true;
    DOM.cancelCaptureButton.disabled = true;
    DOM.captureIdButton.disabled = false;
    idCaptureStream = null;
    updateCaptureMessage("", "");
    if (clearBlobs) {
      frontImageBlob = null;
      backImageBlob = null;
      DOM.frontPreview.src = "";
      DOM.backPreview.src = "";
      DOM.frontPreview.classList.add("hidden");
      DOM.backPreview.classList.add("hidden");
      console.log("ID Capture cancelled and blobs cleared.");
    }
  }

  async function takePhotoAndExtract() {
    if (!idCaptureStream || !DOM.idVideo || DOM.idVideo.videoWidth <= 0) {
      updateCaptureMessage("Caméra non prête.", "warning");
      console.warn("ID capture: Video element not ready", DOM.idVideo);
      return;
    }
    updateCaptureMessage("Capture et analyse...", "loading");
    DOM.takePhotoButton.disabled = true;
    DOM.cancelCaptureButton.disabled = true;
    const canvas = DOM.idCanvas;
    canvas.width = DOM.idVideo.videoWidth;
    canvas.height = DOM.idVideo.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(DOM.idVideo, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          updateCaptureMessage("Erreur capture image.", "error");
          stopIdCapture();
          return;
        }
        if (isCapturingFront) {
          frontImageBlob = blob;
          console.log("Recto captured");
          DOM.frontPreview.src = URL.createObjectURL(frontImageBlob);
          DOM.frontPreview.classList.remove("hidden");
          isCapturingFront = false;
          DOM.captureInstruction.textContent = "Positionnez le VERSO et prenez la photo.";
          updateCaptureMessage("Recto OK. Préparez le verso.", "info");
          DOM.takePhotoButton.disabled = false;
          DOM.cancelCaptureButton.disabled = false;
        } else {
          backImageBlob = blob;
          console.log("Verso captured");
          DOM.backPreview.src = URL.createObjectURL(backImageBlob);
          DOM.backPreview.classList.remove("hidden");
          stopIdCapture(false);
          updateCaptureMessage("Verso OK. Analyse en cours...", "loading");
          if (frontImageBlob && backImageBlob) {
            const formData = new FormData();
            formData.append("data", frontImageBlob, "id_card_front.jpg");
            formData.append("data", backImageBlob, "id_card_back.jpg");
            try {
              const extractedData = await apiService.extractIdInfo(formData);
              console.log("Extracted ID Data:", extractedData);
              if (extractedData && extractedData.data) {
                autofillCreateForm(extractedData);
                showToast("Formulaire pré-rempli!", "success");
                updateCaptureMessage("Données extraites!", "success");
              } else {
                const errorMessage =
                  extractedData?.message || "Aucune donnée extraite.";
                throw new Error(errorMessage);
              }
            } catch (error) {
              console.error("Error extraction API call:", error);
              updateCaptureMessage(`Erreur extraction: ${error.message}`, "error");
            } finally {
              frontImageBlob = null;
              backImageBlob = null;
            }
          } else {
            console.error("Missing blobs.");
            updateCaptureMessage("Erreur: Images manquantes.", "error");
          }
        }
      },
      "image/jpeg",
      0.9
    );
  }

  function autofillCreateForm(data) {
    if (!DOM.createForm || !data || !data.data) {
      console.warn("Autofill failed: Form or data object missing.");
      return;
    }
    const extracted = data.data;
    console.log("Extracted from API for Autofill:", extracted);
    let formattedDateOfBirth = "";
    if (extracted.date_of_birth) {
      const originalDateString = extracted.date_of_birth;
      const dateParts = originalDateString.split("/");
      if (dateParts.length === 3) {
        const day = dateParts[0];
        const month = dateParts[1];
        const year = dateParts[2];
        formattedDateOfBirth = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        console.log("Formatted date_of_birth:", formattedDateOfBirth);
      } else {
        console.warn("DOB format unexpected:", originalDateString);
      }
    } else {
      console.warn("DOB missing.");
    }
    const form = DOM.createForm;
    form.nom.value = extracted.last_name ?? "";
    form.prenom.value = extracted.first_name ?? "";
    form.cin.value = extracted.id_number ?? "";
    form.date_naissance.value = formattedDateOfBirth;
    form.adresse.value = extracted.address ?? "";
    form.ville.value = extracted.city ?? "";
    form.sexe.value = extracted.gender === "F" ? "F" : extracted.gender === "M" ? "M" : "";
    form.querySelectorAll(".input-group.has-error").forEach((el) =>
      el.classList.remove("has-error")
    );
    form.querySelectorAll("input, select").forEach((el) =>
      el.classList.remove("input-error")
    );
    form.querySelectorAll(".error-text").forEach((el) => (el.textContent = ""));
    showMessage("message", "Formulaire pré-rempli. Vérifiez les informations.", "info");
    $(form.sexe).trigger("change");
  }

  // --- Form Validation ---
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
    showMessage("getResult", "", "");
    const cinVal = DOM.cinInput?.value.trim() || "";
    if (!cinVal) {
      showMessage("getResult", "Veuillez entrer un CIN.", "warning");
      DOM.resultDiv.innerHTML = `
        <div class="patient-result-container">
          <p class="message message-warning">Veuillez entrer un CIN.</p>
        </div>`;
      return;
    }
    showMessage("getResult", '<span class="loading-spinner"></span> Recherche patient...', "loading");
    DOM.resultDiv.style.display = "block";

    try {
      const response = await apiService.fetchPatient(cinVal);
      console.log("Patient Search API Response:", response);

      let patientData = null;
      if (Array.isArray(response)) {
        patientData = response.length > 0 ? response[0] : null;
      } else if (typeof response === "object" && response !== null) {
        patientData = response;
      }

      if (!patientData) {
        showMessage("getResult", "", "");
        DOM.resultDiv.innerHTML = `
          <div class="patient-result-container">
            <p class="message message-warning">Patient non trouvé pour ce CIN.</p>
          </div>`;
        return;
      }

      currentIPP = patientData.ipp;
      console.log("Patient found:", patientData);

      const qrCodeData = generateQrData(currentIPP);
      let displayDate = "N/A";
      if (patientData.date_naissance) {
        const parts = patientData.date_naissance.split("T")[0].split("-");
        if (parts.length === 3) {
          displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
          displayDate = sanitizeInput(patientData.date_naissance);
        }
      }

      const searchResultHTML = `
        <div class="patient-result-card">
          <h3>Informations du Patient</h3>
          <ul class="patient-info-list">
            <li><strong>Nom:</strong> ${sanitizeInput(patientData.nom)}</li>
            <li><strong>Prénom:</strong> ${sanitizeInput(patientData.prenom)}</li>
            <li><strong>CIN:</strong> ${sanitizeInput(patientData.cin)}</li>
            <li><strong>IPP:</strong> ${sanitizeInput(currentIPP || 'N/A')}</li>
            <li><strong>Téléphone:</strong> ${sanitizeInput(patientData.telephone)}</li>
            <li><strong>Adresse:</strong> ${sanitizeInput(patientData.adresse)}</li>
            <li><strong>Ville:</strong> ${sanitizeInput(patientData.ville)}</li>
            <li><strong>Date de Naissance:</strong> ${displayDate}</li>
            <li><strong>Sexe:</strong> ${
              patientData.sexe === 'M'
                ? 'Homme'
                : patientData.sexe === 'F'
                ? 'Femme'
                : 'N/A'
            }</li>
            <li><strong>Mutuelle:</strong> ${sanitizeInput(patientData.mutuelle || 'N/A')}</li>
          </ul>
          ${
            qrCodeData
              ? `<div class="qr-section">
                   <img src="${qrCodeData.qrImageUrl}" alt="QR Code Patient IPP ${sanitizeInput(currentIPP)}" loading="lazy" />
                   <div class="btn-group">
                     <button id="searchPrintQR" class="btn btn-secondary btn-sm">
                       <i class="fas fa-print"></i> Imprimer QR Code
                     </button>
                   </div>
                 </div>`
              : '<p class="text-center text-muted mt-3">QR Code non généré (IPP manquant)</p>'
          }
        </div>
      `;
      DOM.resultDiv.innerHTML = searchResultHTML;

      const searchPrintBtn = document.getElementById("searchPrintQR");
      if (searchPrintBtn && qrCodeData) {
        searchPrintBtn.addEventListener("click", () => {
          window.printQRCode(qrCodeData.qrImageUrl);
        });
      }
    } catch (error) {
      console.error("Search Patient Process Error:", error);
      showMessage("getResult", "", "");
      DOM.resultDiv.innerHTML = `
        <div class="patient-result-container">
          <p class="message message-error">Erreur lors de la recherche: ${error.message}</p>
        </div>`;
    }
  }

  async function handleCreatePatient(event) {
    event.preventDefault();
    if (!validateCreateForm()) return;

    showMessage("message", '<span class="loading-spinner"></span> Création patient...', "loading");
    DOM.createPatientBtn.disabled = true;
    DOM.createResultDiv.style.display = "none";

    // Query createPrintButton after DOM is loaded
    const createPrintButton = document.getElementById("createPrintButton");
    if (createPrintButton) {
      createPrintButton.disabled = true;
    } else {
      console.warn("createPrintButton was not found before creating patient!");
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
          showMessage(
            "createResult",
            `Patient créé (IPP: ${sanitizeInput(currentIPP)}). Erreur QR Code.`,
            "warning"
          );
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

  // --- Dropdown Initialization Functions ---
  function populateMutuelleDropdown(mutuelles) {
    const dropdown = DOM.mutuelleInput;
    if (!dropdown) return;
    dropdown.innerHTML = `<option value="" selected>Aucune / Non spécifié</option>`;
    mutuelles.forEach((mutuelleName) => {
      const option = document.createElement("option");
      option.value = mutuelleName;
      option.textContent = mutuelleName;
      dropdown.appendChild(option);
    });
    $(dropdown).select2({
      placeholder: "Choisir une mutuelle...",
      allowClear: true,
      width: "100%",
    });
  }

  function populateDoctorsDropdown(doctors) {
    const dropdown = DOM.doctorInput;
    if (!dropdown) return;
    dropdown.innerHTML = `<option value="" selected>Choisir un médecin...</option>`;
    doctors.forEach((doctor) => {
      const option = document.createElement("option");
      option.value = doctor.matricule;
      option.textContent = `${doctor.nom} ${doctor.prenom} - ${doctor.specialite}`;
      dropdown.appendChild(option);
    });
    $(dropdown).select2({
      placeholder: "Choisir un médecin...",
      allowClear: true,
      width: "100%",
    });
  }

  async function fetchMutuelles() {
    try {
      const data = await apiService.fetchMutuelles();
      if (data.success && Array.isArray(data.mutuelles)) {
        populateMutuelleDropdown(data.mutuelles);
      } else {
        console.error("Failed to fetch mutuelles:", data);
      }
    } catch (error) {
      console.error("Error fetching mutuelles:", error);
    }
  }

  async function fetchDoctors() {
    try {
      const data = await apiService.fetchDoctors();
      if (data.success && Array.isArray(data.doctors)) {
        populateDoctorsDropdown(data.doctors);
      } else {
        console.error("Failed to fetch doctors:", data);
      }
    } catch (error) {
      console.error("Error fetching doctors:", error);
    }
  }

  // --- Initial Setup ---
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

    // Right after DOM loads, we can safely get the createPrintButton
    createPrintButtonRef = document.getElementById("createPrintButton");
    if (!createPrintButtonRef) {
      console.warn("createPrintButton not found in DOM on page init.");
    }

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
  DOM.captureIdButton?.addEventListener("click", startIdCapture);
  DOM.takePhotoButton?.addEventListener("click", takePhotoAndExtract);
  DOM.cancelCaptureButton?.addEventListener("click", () => stopIdCapture(true));

  document.addEventListener("DOMContentLoaded", initializePage);
})();
