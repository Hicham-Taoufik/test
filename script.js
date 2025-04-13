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
    START_VISIT_ENDPOINT: "/webhook/start-visit", // Not called automatically now
  };

  // --- DOM Elements ---
  const DOM = {
    body: document.body,
    resultDiv: document.getElementById("getResult"),
    messageDiv: document.getElementById("message"),
    createForm: document.getElementById("createForm"),
    createResultDiv: document.getElementById("createResult"),
    searchForm: document.getElementById("searchForm"),
    searchButton: document.getElementById("searchBtn"),
    cinInput: document.getElementById("getCin"),
    mutuelleInput: document.getElementById("mutuelle"),
    doctorInput: document.getElementById("doctor"),
    createPatientBtn: document.getElementById("createPatientBtn"),
    createResultMessage: document.getElementById("createResultMessage"),
    createQrCodeImage: document.getElementById("createQrCodeImage"),
    // Updated/New buttons:
    createPrintQrButton: document.getElementById("createPrintQrButton"), // Renamed
    createPrintInfoButton: document.getElementById("createPrintInfoButton"), // New
    toast: document.getElementById("toast"),
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
  };

  // --- State Variables ---
  let currentIPP = null;
  let sessionTimeoutId = null;
  let idCaptureStream = null;
  let frontImageBlob = null;
  let backImageBlob = null;
  let isCapturingFront = true;

  // --- Utility Functions ---
  const showToast = (message, type = "success") => {
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
  };

  const sanitizeInput = (input) => {
    if (input === null || input === undefined) return "";
    const temp = document.createElement("div");
    temp.textContent = String(input);
    return temp.innerHTML;
  };

  const showMessage = (elementId, message, type = "info") => {
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
    const iconHtml = message && type !== "result" ? `<i class="${iconClass}" style="margin-right: 6px;" aria-hidden="true"></i>` : "";
    el.innerHTML = message ? `${iconHtml}${message}` : "";
    el.style.display = message ? "block" : "none";
    el.className = "";

    // For createResult styling specifically
    if (elementId === "createResult") {
      const isResult = type === "result" || type === 'warning'; // Treat warning also as a result display type
      const baseBg = isResult
        ? (type === 'warning' ? "var(--warning-light)" : "var(--success-light)")
        : type === "error"
        ? "var(--danger-light)"
        : "transparent";
      const baseBorder = isResult
        ? (type === 'warning' ? "var(--warning)" : "var(--success)")
        : type === "error"
        ? "var(--danger)"
        : "transparent";
      const textColor = isResult
        ? (type === 'warning' ? "var(--warning)" : "var(--success-dark)")
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
      const img = el.querySelector("#createQrCodeImage");
      const btnContainer = el.querySelector(".print-buttons-container");

      if (msgP) {
        msgP.style.color = textColor;
        msgP.textContent = message ? message : "";
      }
      if (img) img.style.display = isResult && DOM.createQrCodeImage.src ? "block" : "none"; // Show image only if result and src is set
      if (btnContainer) btnContainer.style.display = isResult ? "flex" : "none"; // Show button container if result

    } else {
      el.className = "message";
      if (type) el.classList.add(`message-${type}`);
    }

    // Auto-hide some messages
    if (
      type !== "error" &&
      type !== "result" &&
      type !== "loading" &&
      message &&
      elementId === "message"
    ) {
      setTimeout(() => {
        const currentElement = document.getElementById(elementId);
        if (currentElement && currentElement.innerHTML && currentElement.innerHTML.includes(message)) {
          currentElement.style.display = "none";
        }
      }, CONFIG.MESSAGE_DISPLAY_TIME);
    }
  };

  const resetSessionTimeout = () => {
    if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
    sessionTimeoutId = setTimeout(logout, CONFIG.SESSION_TIMEOUT);
  };

  const logout = () => {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    clearTimeout(sessionTimeoutId);
    showToast("Déconnecté.", "success");
    setTimeout(redirectToLogin, 1000);
  };

  const redirectToLogin = () => {
    window.location.href = CONFIG.LOGIN_PAGE_URL;
  };

  // --- API Call Helper ---
  const fetchWithAuth = async (url, options = {}) => {
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
        console.error(`API Error ${response.status}: ${errorText || response.statusText}`);
        throw new Error(`Erreur ${response.status}: ${errorText || response.statusText}`);
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
  };

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
    // START_VISIT_ENDPOINT is available but not automatically called
  };

  // --- QR Code Functions ---
  const generateQrData = (ipp) => {
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
  };

  // --- Printing Functions ---

  /**
   * Prints only the QR Code image.
   * @param {string} qrImageUrl - The URL of the QR code image to print.
   */
  const printQRCode = (qrImageUrl) => {
    if (!qrImageUrl) {
      console.error("No QR Image URL to print.");
      return;
    }
    const printWindow = window.open("", "_blank", "width=400,height=450");
    if (!printWindow) {
      alert("Veuillez autoriser les pop-ups pour imprimer le QR code.");
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
          @media print { body { margin: 5mm; } button { display: none; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <img src="${qrImageUrl}" alt="QR Code Patient" />
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              setTimeout(function() { window.close(); }, 500); // Close after a delay
            }, 500); // Delay print slightly
          };
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  /**
   * Generates HTML for patient details and opens a print dialog.
   * @param {object} patientData - The patient data object (like the payload used for creation).
   * @param {string} ipp - The assigned patient IPP.
   */
  const printPatientInfo = (patientData, ipp) => {
    if (!patientData || !ipp) {
      console.error("Missing patient data or IPP for printing info.");
      showToast("Données manquantes pour l'impression.", "error");
      return;
    }

    // Format date for display (DD/MM/YYYY)
    let displayDate = "N/A";
    if (patientData.date_naissance) {
        try {
            // Assuming date_naissance is YYYY-MM-DD from the input
            const date = new Date(patientData.date_naissance + 'T00:00:00Z'); // Treat as UTC to avoid timezone shifts affecting date
            if (!isNaN(date)) {
              const day = String(date.getUTCDate()).padStart(2, '0');
              const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
              const year = date.getUTCFullYear();
              displayDate = `${day}/${month}/${year}`;
            }
        } catch(e) { console.warn("Could not format date:", patientData.date_naissance); }
    }

    // Format sexe
    const displaySexe = patientData.sexe === 'M' ? 'Homme' : patientData.sexe === 'F' ? 'Femme' : 'N/A';

    // Get doctor display text if available (check if doctorDisplay was added to payload)
    const doctorText = patientData.doctorDisplay || (patientData.doctor ? `ID: ${patientData.doctor}` : 'Non spécifié');

    const printWindow = window.open("", "_blank", "width=700,height=500");
    if (!printWindow) {
      alert("Veuillez autoriser les pop-ups pour imprimer les informations.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Fiche Patient - ${sanitizeInput(patientData.nom)} ${sanitizeInput(patientData.prenom)}</title>
        <style>
          body { font-family: 'Inter', sans-serif; margin: 20px; line-height: 1.6; color: #333; }
          h1 { text-align: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; font-size: 1.5em; }
          .info-grid { display: grid; grid-template-columns: 150px 1fr; gap: 8px 15px; margin-bottom: 20px; }
          .info-grid strong { font-weight: 600; color: #555; }
          .info-grid span { word-break: break-word; }
          @media print {
            body { margin: 10mm; font-size: 10pt; }
            h1 { font-size: 14pt; }
            button { display: none; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Fiche Patient</h1>
        <div class="info-grid">
          <strong>IPP:</strong> <span>${sanitizeInput(ipp)}</span>
          <strong>Nom:</strong> <span>${sanitizeInput(patientData.nom)}</span>
          <strong>Prénom:</strong> <span>${sanitizeInput(patientData.prenom)}</span>
          <strong>CIN:</strong> <span>${sanitizeInput(patientData.cin || 'N/A')}</span>
          <strong>Date de Naissance:</strong> <span>${displayDate}</span>
          <strong>Sexe:</strong> <span>${displaySexe}</span>
          <strong>Téléphone:</strong> <span>${sanitizeInput(patientData.telephone)}</span>
          <strong>Adresse:</strong> <span>${sanitizeInput(patientData.adresse)}</span>
          <strong>Ville:</strong> <span>${sanitizeInput(patientData.ville)}</span>
          <strong>Mutuelle:</strong> <span>${sanitizeInput(patientData.mutuelle || 'Aucune')}</span>
          <strong>Médecin:</strong> <span>${sanitizeInput(doctorText)}</span>
        </div>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="text-align: center; font-size: 0.8em; color: #777;" class="no-print">
          MediClinic © ${new Date().getFullYear()}
        </p>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              setTimeout(function() { window.close(); }, 500); // Close after a delay
            }, 500); // Delay print slightly
          };
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };


  // --- ID Capture Functions ---
  const updateCaptureMessage = (message, type = "info") =>
    showMessage("captureMessage", message, type);

  const startIdCapture = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      updateCaptureMessage("Demande caméra...", "loading");
      DOM.captureIdButton.disabled = true;
      // Remove "hidden" so container is visible
      DOM.idCaptureContainer.classList.remove("hidden");
      DOM.idCaptureContainer.style.display = "block";
      // Reset previews
      DOM.frontPreview.classList.add("hidden");
      DOM.frontPreview.src = "";
      DOM.backPreview.classList.add("hidden");
      DOM.backPreview.src = "";
      isCapturingFront = true;
      DOM.captureInstruction.textContent = "Positionnez le RECTO de la CIN et prenez la photo.";
      try {
        idCaptureStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        DOM.idVideo.srcObject = idCaptureStream;
        await DOM.idVideo.play();
        updateCaptureMessage("Caméra prête. Prenez la photo du RECTO.", "info");
        DOM.takePhotoButton.disabled = false;
        DOM.cancelCaptureButton.disabled = false;
      } catch (err) {
        console.error("Camera access error:", err);
        updateCaptureMessage(`Erreur caméra: ${err.message}`, "error");
        stopIdCapture(false); // Keep blobs if any were captured before error
      }
    } else {
      alert("Accès caméra non supporté.");
      updateCaptureMessage("Caméra non supportée.", "error");
      DOM.captureIdButton.disabled = false;
    }
  };

  const stopIdCapture = (clearBlobs = true) => {
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
  };

  const takePhotoAndExtract = async () => {
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
          stopIdCapture(); // Stop and clear blobs on error
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
          stopIdCapture(false); // Stop camera but keep blobs for upload
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
                const errorMessage = extractedData?.message || "Aucune donnée extraite.";
                throw new Error(errorMessage);
              }
            } catch (error) {
              console.error("Error extraction API call:", error);
              updateCaptureMessage(`Erreur extraction: ${error.message}`, "error");
            } finally {
              // Clear blobs after attempt regardless of success/failure
              frontImageBlob = null;
              backImageBlob = null;
              // Optionally clear previews after a delay or keep them
              // setTimeout(() => {
              //   DOM.frontPreview.src = ""; DOM.frontPreview.classList.add("hidden");
              //   DOM.backPreview.src = ""; DOM.backPreview.classList.add("hidden");
              // }, 3000);
            }
          } else {
            console.error("Missing blobs for extraction.");
            updateCaptureMessage("Erreur: Images manquantes pour l'analyse.", "error");
          }
        }
      },
      "image/jpeg",
      0.9 // Quality factor
    );
  };

  const autofillCreateForm = (data) => {
    if (!DOM.createForm || !data || !data.data) {
      console.warn("Autofill failed: Form or data object missing.");
      return;
    }
    const extracted = data.data;
    console.log("Extracted from API for Autofill:", extracted);
    let formattedDateOfBirth = "";
    if (extracted.date_of_birth) {
      // Expecting DD/MM/YYYY from API based on previous example
      const originalDateString = extracted.date_of_birth;
      const dateParts = originalDateString.split("/");
      if (dateParts.length === 3) {
        const day = dateParts[0];
        const month = dateParts[1];
        const year = dateParts[2];
        // Format to YYYY-MM-DD for the date input field
        formattedDateOfBirth = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        console.log("Formatted date_of_birth for input:", formattedDateOfBirth);
      } else {
        console.warn("DOB format unexpected from API:", originalDateString);
      }
    } else {
      console.warn("DOB missing from API.");
    }
    const form = DOM.createForm;
    form.nom.value = extracted.last_name ?? "";
    form.prenom.value = extracted.first_name ?? "";
    form.cin.value = extracted.id_number ?? "";
    form.date_naissance.value = formattedDateOfBirth;
    form.adresse.value = extracted.address ?? "";
    form.ville.value = extracted.city ?? "";
    form.sexe.value = extracted.gender === "F" ? "F" : extracted.gender === "M" ? "M" : "";
    // Reset validation states
    form.querySelectorAll(".input-group.has-error").forEach((el) => el.classList.remove("has-error"));
    form.querySelectorAll("input, select").forEach((el) => el.classList.remove("input-error"));
    form.querySelectorAll(".error-text").forEach((el) => (el.textContent = ""));
    showMessage("message", "Formulaire pré-rempli. Vérifiez les informations.", "info");
    // Trigger change for Select2 if used for sexe (though standard select used here)
    $(form.sexe).trigger("change");
  };

  // --- Form Validation ---
  const validateField = (input, validationFn, errorMessage) => {
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
  };

  const validateCreateForm = () => {
    let isValid = true;
    showMessage("message", "", ""); // Clear previous messages
    DOM.createForm?.querySelectorAll(".input-group.has-error").forEach((el) => el.classList.remove("has-error"));
    DOM.createForm?.querySelectorAll("input, select").forEach((el) => el.classList.remove("input-error"));
    DOM.createForm?.querySelectorAll(".error-text").forEach((el) => (el.textContent = "")); // Clear errors

    isValid &= validateField(DOM.createForm.nom, (val) => val.length > 0, "Nom requis");
    isValid &= validateField(DOM.createForm.prenom, (val) => val.length > 0, "Prénom requis");
    // CIN is now optional in create but must match pattern if provided
    isValid &= validateField(
      DOM.createForm.cin,
      (val) => val === "" || /^[A-Za-z]{1,2}\d{5,6}$/.test(val),
      "Format CIN invalide (ex: AB123456) ou laisser vide"
    );
    isValid &= validateField(DOM.createForm.telephone, (val) => /^0[5-7]\d{8}$/.test(val), "Format téléphone 0Xxxxxxxxx requis");
    isValid &= validateField(DOM.createForm.adresse, (val) => val.length > 0, "Adresse requise");
    isValid &= validateField(DOM.createForm.ville, (val) => val.length > 0, "Ville requise");
    isValid &= validateField(DOM.createForm.date_naissance, (val) => val !== "", "Date naissance requise");
    isValid &= validateField(DOM.createForm.sexe, (val) => val !== "", "Sélection sexe requise");
    // Mutuelle and Doctor are optional, no specific validation needed here beyond dropdown selection

    if (!isValid) {
      showMessage("message", "Veuillez corriger les erreurs.", "error");
      const firstError = DOM.createForm.querySelector(".input-error");
      firstError?.focus();
    }
    return Boolean(isValid);
  };

  // --- Event Handlers ---
  /**
   * Handles Searching for a Patient:
   * - Displays minimal info in a card-like format
   * - Only shows a "Print QR" button (no "Print Info")
   * - Does NOT call startVisit automatically
   */
  const handlePatientSearch = async () => {
    showMessage("getResult", "", ""); // Clear previous results
    const cin = DOM.cinInput?.value.trim().toUpperCase() || ""; // Standardize CIN input
    if (!cin || !/^[A-Za-z]{1,2}\d{5,6}$/.test(cin)) { // Validate CIN format for search
      showMessage("getResult", "Veuillez entrer un CIN valide (ex: AB123456).", "warning");
      DOM.resultDiv.innerHTML = `
        <div class="patient-result-container">
          <p class="message message-warning">Veuillez entrer un CIN valide (ex: AB123456).</p>
        </div>`;
      DOM.resultDiv.style.display = "block";
      return;
    }

    showMessage("getResult", '<div class="loading-spinner" role="status" aria-label="Chargement"></div> Recherche patient...', "loading");
    DOM.resultDiv.style.display = "block";

    try {
      const response = await apiService.fetchPatient(cin);
      console.log("Patient Search API Response:", response);

      let patientData = null;
      // Adjust based on expected API response format (object or first element of array)
      if (Array.isArray(response)) {
        patientData = response.length > 0 ? response[0] : null;
      } else if (typeof response === 'object' && response !== null && response.success === false && response.message === 'Patient not found') {
        // Handle specific "not found" JSON response if API returns that
         patientData = null;
      } else if (typeof response === 'object' && response !== null && response.ipp) {
        // Handle if API returns a single patient object directly
        patientData = response;
      }


      if (!patientData) {
        showMessage("getResult", "", ""); // Clear loading message
        DOM.resultDiv.innerHTML = `
          <div class="patient-result-container">
            <p class="message message-warning">Patient non trouvé pour le CIN: ${sanitizeInput(cin)}.</p>
          </div>`;
        return;
      }

      // Patient found
      currentIPP = patientData.ipp; // Store IPP from response
      console.log("Patient found:", patientData);

      // Generate QR code
      const qrCodeData = generateQrData(currentIPP);

      // Format date if ISO-like or other formats
      let displayDate = "N/A";
      if (patientData.date_naissance) {
         try {
            // Attempt to parse common formats (YYYY-MM-DD, DD/MM/YYYY, ISO)
            let date;
            if (patientData.date_naissance.includes('-') && patientData.date_naissance.split('-').length === 3) {
                date = new Date(patientData.date_naissance + 'T00:00:00Z'); // Assume YYYY-MM-DD, treat as UTC
            } else if (patientData.date_naissance.includes('/') && patientData.date_naissance.split('/').length === 3) {
                const parts = patientData.date_naissance.split('/'); // Assume DD/MM/YYYY
                date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00Z`); // Convert to YYYY-MM-DD then treat as UTC
            } else {
                 date = new Date(patientData.date_naissance); // Try parsing directly (might be ISO)
            }

            if (!isNaN(date)) {
              const day = String(date.getUTCDate()).padStart(2, '0');
              const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
              const year = date.getUTCFullYear();
              displayDate = `${day}/${month}/${year}`;
            } else {
                 displayDate = sanitizeInput(patientData.date_naissance); // Fallback if parsing failed
            }
        } catch(e) {
            console.warn("Could not format date from search result:", patientData.date_naissance);
            displayDate = sanitizeInput(patientData.date_naissance); // Fallback
        }
      }

      // Minimal card-like display with single "Imprimer QR" button
      const searchResultHTML = `
        <div class="patient-result-card">
          <h3><i class="fas fa-user-check" aria-hidden="true"></i> Informations du Patient</h3>
          <ul class="patient-info-list">
            <li><strong>Nom:</strong> ${sanitizeInput(patientData.nom)}</li>
            <li><strong>Prénom:</strong> ${sanitizeInput(patientData.prenom)}</li>
            <li><strong>CIN:</strong> ${sanitizeInput(patientData.cin)}</li>
            <li><strong>IPP:</strong> ${sanitizeInput(currentIPP || 'N/A')}</li>
            <li><strong>Téléphone:</strong> ${sanitizeInput(patientData.telephone || 'N/A')}</li>
            <li><strong>Adresse:</strong> ${sanitizeInput(patientData.adresse || 'N/A')}</li>
            <li><strong>Ville:</strong> ${sanitizeInput(patientData.ville || 'N/A')}</li>
            <li><strong>Date Naissance:</strong> ${displayDate}</li>
            <li><strong>Sexe:</strong> ${
              patientData.sexe === 'M'
                ? 'Homme'
                : patientData.sexe === 'F'
                ? 'Femme'
                : 'N/A'
            }</li>
            <li><strong>Mutuelle:</strong> ${sanitizeInput(patientData.mutuelle || 'N/A')}</li>
            <!-- Add doctor info if available from search API -->
            ${patientData.doctor ? `<li><strong>Médecin:</strong> ${sanitizeInput(patientData.doctor)}</li>` : ''}
          </ul>
          ${
            qrCodeData
              ? `
            <div class="qr-section mt-3 text-center">
              <img src="${qrCodeData.qrImageUrl}" alt="QR Code Patient IPP ${sanitizeInput(currentIPP)}" loading="lazy" style="max-width: 150px; margin-bottom: 10px;" />
              <button class="btn btn-secondary btn-sm" onclick="printQRCode('${qrCodeData.qrImageUrl}')">
                <i class="fas fa-print"></i> Imprimer QR
              </button>
            </div>`
              : '<p class="text-center text-muted mt-3">QR Code non généré (IPP manquant)</p>'
          }
        </div>
      `;
      DOM.resultDiv.innerHTML = searchResultHTML;

    } catch (error) {
      console.error("Search Patient Process Error:", error);
      showMessage("getResult", "", ""); // Clear loading message
      DOM.resultDiv.innerHTML = `
        <div class="patient-result-container">
          <p class="message message-error">Erreur lors de la recherche: ${error.message}</p>
        </div>`;
    }
  };

  /**
   * Handles Creating a Patient:
   * - On success, displays QR code + "Imprimer QR" + "Imprimer Infos" buttons
   * - Does NOT print entire info or start a visit automatically
   */
  const handleCreatePatient = async (event) => {
    event.preventDefault();
    if (!validateCreateForm()) return;

    showMessage("message", '<div class="loading-spinner" role="status" aria-label="Chargement"></div> Création patient...', "loading");
    DOM.createPatientBtn.disabled = true;
    DOM.createResultDiv.style.display = "none"; // Hide previous result
    // Ensure buttons are disabled initially or on re-submit
    DOM.createPrintQrButton.disabled = true;
    DOM.createPrintInfoButton.disabled = true;

    const payload = {
      nom: DOM.createForm.nom.value.trim(),
      prenom: DOM.createForm.prenom.value.trim(),
      cin: DOM.createForm.cin.value.trim().toUpperCase() || null, // Standardize CIN
      telephone: DOM.createForm.telephone.value.trim(),
      adresse: DOM.createForm.adresse.value.trim(),
      ville: DOM.createForm.ville.value.trim(),
      date_naissance: DOM.createForm.date_naissance.value, // Should be YYYY-MM-DD
      sexe: DOM.createForm.sexe.value,
      has_insurance: !!DOM.mutuelleInput.value,
      mutuelle: DOM.mutuelleInput.value.trim() || null,
      doctor: DOM.doctorInput.value || null,
      // Store doctor display text for printing later
      doctorDisplay: DOM.doctorInput.selectedOptions.length > 0 && DOM.doctorInput.value ? DOM.doctorInput.selectedOptions[0].text : null
    };
    console.log("Payload for Create Patient:", payload);

    try {
      const createResponse = await apiService.createPatient(payload);
      console.log("Create Patient API Response:", createResponse);
      if (createResponse && createResponse.success && createResponse.ipp) {
        currentIPP = createResponse.ipp;
        console.log(`Patient created (IPP: ${currentIPP})`);
        showToast(createResponse.message || "Patient créé.", "success");
        showMessage("message", "", ""); // Clear loading message

        const qrCodeData = generateQrData(currentIPP);

        if (qrCodeData) {
          showMessage("createResult", `Patient créé (IPP: ${sanitizeInput(currentIPP)})`, "result");
          DOM.createResultMessage.textContent = `Patient créé (IPP: ${sanitizeInput(currentIPP)})`;
          DOM.createQrCodeImage.src = qrCodeData.qrImageUrl;
          DOM.createQrCodeImage.alt = `QR Code pour IPP ${sanitizeInput(currentIPP)}`;

          // Enable and set onclick for QR Print button
          DOM.createPrintQrButton.disabled = false;
          DOM.createPrintQrButton.onclick = () => printQRCode(qrCodeData.qrImageUrl);

          // Enable and set onclick for Info Print button
          DOM.createPrintInfoButton.disabled = false;
          DOM.createPrintInfoButton.onclick = () => printPatientInfo(payload, currentIPP);

          DOM.createResultDiv.style.display = "block";
        } else {
           // Handle QR generation error - still allow printing info
          showMessage("createResult", `Patient créé (IPP: ${sanitizeInput(currentIPP)}). Erreur QR Code.`, "warning");
          DOM.createResultMessage.textContent = `Patient créé (IPP: ${sanitizeInput(currentIPP)}). Erreur QR Code.`;
          DOM.createQrCodeImage.src = ""; // Clear broken image potentially
          DOM.createQrCodeImage.alt = "Erreur génération QR Code";

          DOM.createPrintQrButton.disabled = true; // Disable QR print if QR failed

          // Still enable info print
          DOM.createPrintInfoButton.disabled = false;
          DOM.createPrintInfoButton.onclick = () => printPatientInfo(payload, currentIPP);

          DOM.createResultDiv.style.display = "block";
        }
        // Reset form for next entry
        DOM.createForm.reset();
        $(DOM.mutuelleInput).val(null).trigger("change"); // Reset Select2 dropdowns
        $(DOM.doctorInput).val(null).trigger("change");
        DOM.createForm.querySelectorAll(".input-group.has-error").forEach(el => el.classList.remove("has-error"));
        DOM.createForm.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
        DOM.createForm.querySelectorAll(".error-text").forEach(el => el.textContent = "");


      } else {
        // Handle API failure (e.g., { success: false, message: "..." })
        const errorMessage = createResponse?.message || "Réponse invalide ou échec création.";
        throw new Error(errorMessage);
      }
    } catch (apiError) {
      console.error("Create Patient Process Error:", apiError);
      showMessage("message", `Erreur: ${apiError.message}`, "error");
      DOM.createResultDiv.style.display = "none"; // Hide result area on error
      // Ensure buttons remain disabled on error
      DOM.createPrintQrButton.disabled = true;
      DOM.createPrintInfoButton.disabled = true;
    } finally {
      DOM.createPatientBtn.disabled = false; // Re-enable create button
    }
  };

  // --- Dropdown Initialization Functions ---
  const populateMutuelleDropdown = (mutuelles) => {
    const dropdown = DOM.mutuelleInput;
    if (!dropdown) return;
    // Add a default "None" option that is selectable
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
      theme: "default", // Or your preferred theme
    });
  };

  const populateDoctorsDropdown = (doctors) => {
    const dropdown = DOM.doctorInput;
    if (!dropdown) return;
    // Add a default "None/Select" option
    dropdown.innerHTML = `<option value="" selected>Choisir un médecin...</option>`;
    doctors.forEach((doctor) => {
      const option = document.createElement("option");
      option.value = doctor.matricule; // Assuming 'matricule' is the ID
      // Display Name and Specialty
      option.textContent = `${doctor.nom || ''} ${doctor.prenom || ''} - ${doctor.specialite || 'N/A'}`;
      dropdown.appendChild(option);
    });
    $(dropdown).select2({
      placeholder: "Choisir un médecin...",
      allowClear: true,
      width: "100%",
      theme: "default", // Or your preferred theme
    });
  };

  const fetchMutuelles = async () => {
    try {
      const data = await apiService.fetchMutuelles();
      // Assuming API returns { success: true, mutuelles: ["CNOPS", "FAR", ...] }
      if (data && data.success && Array.isArray(data.mutuelles)) {
        populateMutuelleDropdown(data.mutuelles);
      } else {
        console.error("Failed to fetch or parse mutuelles:", data);
        showToast("Erreur chargement mutuelles.", "error");
      }
    } catch (error) {
      console.error("Error fetching mutuelles:", error);
      showToast("Erreur réseau (mutuelles).", "error");
    }
  };

  const fetchDoctors = async () => {
    try {
      const data = await apiService.fetchDoctors();
      // Assuming API returns { success: true, doctors: [{ matricule: "...", nom: "...", prenom: "...", specialite: "..." }, ...] }
      if (data && data.success && Array.isArray(data.doctors)) {
        populateDoctorsDropdown(data.doctors);
      } else {
        console.error("Failed to fetch or parse doctors:", data);
        showToast("Erreur chargement médecins.", "error");
      }
    } catch (error) {
      console.error("Error fetching doctors:", error);
      showToast("Erreur réseau (médecins).", "error");
    }
  };

  // --- Initial Setup ---
  const initializePage = () => {
    console.log("Initializing page...");
    if (!localStorage.getItem(CONFIG.TOKEN_KEY)) {
      console.log("Reception: No token found. Redirecting to login.");
      redirectToLogin();
      return; // Stop further execution if not authenticated
    }
    DOM.body.classList.add("loaded"); // For potential loading animations
    console.log("Reception: Authenticated. Setting up page.");
    resetSessionTimeout(); // Start session timeout
    // Add activity listeners to reset timeout
    ["mousemove", "keypress", "click", "scroll"].forEach((event) =>
      document.addEventListener(event, resetSessionTimeout, { passive: true })
    );
    // Fetch dynamic data for dropdowns
    fetchMutuelles();
    fetchDoctors();

    // Add listener for logout button
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", logout);
    }

    console.log("Initial setup complete.");
  };

  // --- Event Listeners ---
  DOM.searchForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    handlePatientSearch();
  });
  // Optional: Trigger search on button click as well, if form submit isn't always used
  // DOM.searchButton?.addEventListener("click", (e) => {
  //   e.preventDefault(); // Prevent potential form submission if button is type="submit"
  //   handlePatientSearch();
  // });
  // Optional: Trigger search on Enter key in CIN input
  // DOM.cinInput?.addEventListener("keypress", (e) => {
  //   if (e.key === "Enter") {
  //     e.preventDefault();
  //     handlePatientSearch();
  //   }
  // });

  DOM.createForm?.addEventListener("submit", handleCreatePatient);
  DOM.captureIdButton?.addEventListener("click", startIdCapture);
  DOM.takePhotoButton?.addEventListener("click", takePhotoAndExtract);
  DOM.cancelCaptureButton?.addEventListener("click", () => stopIdCapture(true)); // true to clear blobs on cancel

  // Initialize when the DOM is fully loaded
  document.addEventListener("DOMContentLoaded", initializePage);

})(); // IIFE ends here
