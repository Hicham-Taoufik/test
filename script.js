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
    START_VISIT_ENDPOINT: "/webhook/start-visit",
  };

  // --- DOM Elements ---
  const DOM = {
    body: document.body,
    resultDiv: document.getElementById("getResult"),
    messageDiv: document.getElementById("message"),
    createForm: document.getElementById("createForm"),
    createResultDiv: document.getElementById("createResult"),
    searchButton: document.getElementById("searchBtn"),
    cinInput: document.getElementById("getCin"),
    mutuelleInput: document.getElementById("mutuelle"),
    doctorInput: document.getElementById("doctor"),
    createPatientBtn: document.getElementById("createPatientBtn"),
    createResultMessage: document.getElementById("createResultMessage"),
    createQrCodeImage: document.getElementById("createQrCodeImage"),
    createPrintButton: document.getElementById("createPrintButton"),
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

  /**
   * Displays a temporary toast message.
   * @param {string} message - The message to display.
   * @param {string} [type="success"] - The type: "success" or "error".
   */
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

  /**
   * Sanitizes the input to prevent HTML injection.
   * @param {*} input - The input to sanitize.
   * @returns {string} - The sanitized string.
   */
  const sanitizeInput = (input) => {
    if (input === null || input === undefined) return "";
    const temp = document.createElement("div");
    temp.textContent = String(input);
    return temp.innerHTML;
  };

  /**
   * Displays a message in a specified element by its ID.
   * @param {string} elementId - The ID of the element.
   * @param {string} message - The message content.
   * @param {string} [type="info"] - Message type: info, success, warning, error, loading, or result.
   */
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
    const iconHtml =
      message && type !== "result"
        ? `<i class="${iconClass}" style="margin-right: 6px;" aria-hidden="true"></i>`
        : "";

    el.innerHTML = message ? `${iconHtml}${message}` : "";
    el.style.display = message ? "block" : "none";
    el.className = "";

    if (type === "result") {
      // Additional styling for result messages if needed.
    } else if (elementId === "createResult") {
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
      const img = el.querySelector("#createQrCodeImage");
      const btn = el.querySelector("#createPrintButton");
      if (msgP) {
        msgP.style.color = textColor;
        msgP.textContent = message ? message : "";
      }
      if (img) img.style.display = isResult ? "block" : "none";
      if (btn) btn.style.display = isResult ? "inline-block" : "none";
    } else {
      el.className = "message";
      if (type) {
        el.classList.add(`message-${type}`);
      }
    }

    // Auto-hide for general messages
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
  };

  /**
   * Resets the session timeout timer.
   */
  const resetSessionTimeout = () => {
    if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
    sessionTimeoutId = setTimeout(logout, CONFIG.SESSION_TIMEOUT);
  };

  /**
   * Logs out the user by clearing the token and redirecting to the login page.
   */
  const logout = () => {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    clearTimeout(sessionTimeoutId);
    showToast("Déconnecté.", "success");
    setTimeout(redirectToLogin, 1000);
  };

  /**
   * Redirects the user to the login page.
   */
  const redirectToLogin = () => {
    window.location.href = CONFIG.LOGIN_PAGE_URL;
  };

  // --- API Call Helper ---
  /**
   * Helper function to perform fetch requests with Authorization.
   * @param {string} url - The request URL.
   * @param {Object} [options={}] - Fetch options.
   * @returns {Promise<any>} - Returns a promise with the parsed response.
   */
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
  };

  // --- API Service ---
  const apiService = {
    /**
     * Fetches a patient by CIN.
     * @param {string} cin - The patient's CIN.
     * @returns {Promise<any>} - The API response.
     */
    fetchPatient: async (cin) =>
      await fetchWithAuth(
        `${CONFIG.API_BASE_URL}${
          CONFIG.GET_PATIENT_ENDPOINT
        }?cin=${encodeURIComponent(cin)}`
      ),

    /**
     * Creates a new patient and starts the visit.
     * @param {Object} payload - The patient data payload.
     * @returns {Promise<any>} - The API response.
     */
    createPatient: async (payload) =>
      await fetchWithAuth(
        `${CONFIG.API_BASE_URL}${CONFIG.CREATE_PATIENT_ENDPOINT}`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      ),

    /**
     * Extracts ID information via image blobs.
     * @param {FormData} formData - The form data with image blobs.
     * @returns {Promise<any>} - The API response.
     */
    extractIdInfo: async (formData) =>
      await fetchWithAuth(
        `${CONFIG.API_BASE_URL}${CONFIG.EXTRACT_ID_ENDPOINT}`,
        {
          method: "POST",
          body: formData,
        }
      ),

    /**
     * Fetches available mutuelles.
     * @returns {Promise<any>} - The API response.
     */
    fetchMutuelles: async () =>
      await fetchWithAuth(
        `${CONFIG.API_BASE_URL}${CONFIG.GET_MUTUELLES_ENDPOINT}`
      ),

    /**
     * Fetches available doctors.
     * @returns {Promise<any>} - The API response.
     */
    fetchDoctors: async () =>
      await fetchWithAuth(
        `${CONFIG.API_BASE_URL}${CONFIG.GET_DOCTORS_ENDPOINT}`
      ),

    /**
     * Starts a visit for the provided patient IPP.
     * @param {string} ipp - The patient IPP.
     * @returns {Promise<any>} - The API response.
     */
    startVisit: async (ipp) => {
      if (!ipp) {
        console.error("startVisit called without IPP.");
        throw new Error("IPP du patient manquant pour démarrer la visite.");
      }
      console.log(`Attempting to start visit for IPP: ${ipp}`);
      try {
        const payload = { ipp };
        const response = await fetchWithAuth(
          `${CONFIG.API_BASE_URL}${CONFIG.START_VISIT_ENDPOINT}`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );
        console.log("Start Visit API Response:", response);
        if (!response || response.success === false) {
          throw new Error(
            response.message || "Échec du démarrage de la visite via API."
          );
        }
        return response;
      } catch (e) {
        console.error("Start visit API error:", e);
        throw e;
      }
    },
  };

  // --- QR Code Functions ---
  /**
   * Generates QR data for the patient using their IPP.
   * @param {string} ipp - The patient IPP.
   * @returns {Object|null} - Contains the target URL and QR image URL.
   */
  const generateQrData = (ipp) => {
    if (!ipp) {
      console.error("IPP missing for QR generation.");
      return null;
    }
    const qrTargetUrl = `${CONFIG.QR_TARGET_BASE_URL}?ipp=${encodeURIComponent(
      ipp
    )}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
      qrTargetUrl
    )}&q=M`;
    console.log("Generated QR Target URL:", qrTargetUrl);
    console.log("Generated QR Image URL:", qrImageUrl);
    return { qrTargetUrl, qrImageUrl };
  };

  /**
   * Opens a new window to print the provided QR Code image.
   * @param {string} qrImageUrl - The URL of the QR Code image.
   */
  const printQRCode = (qrImageUrl) => {
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
            @media print { body { margin: 5mm; } button { display: none; } }
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
            }
          <\/script>
        </body>
        </html>
      `);
    printWindow.document.close();
  };

  // --- ID Capture Functions ---
  /**
   * Updates the ID capture message.
   * @param {string} message - The message to display.
   * @param {string} [type="info"] - The type of message.
   */
  const updateCaptureMessage = (message, type = "info") =>
    showMessage("captureMessage", message, type);

  /**
   * Starts the ID capture process by requesting camera access.
   */
  const startIdCapture = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      updateCaptureMessage("Demande caméra...", "loading");
      DOM.captureIdButton.disabled = true;
      DOM.idCaptureContainer.style.display = "block";
      DOM.frontPreview.style.display = "none";
      DOM.frontPreview.src = "";
      DOM.backPreview.style.display = "none";
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
        updateCaptureMessage(`Erreur caméra: ${err.message}`, "error");
        stopIdCapture(false);
      }
    } else {
      alert("Accès caméra non supporté.");
      updateCaptureMessage("Caméra non supportée.", "error");
      DOM.captureIdButton.disabled = false;
    }
  };

  /**
   * Stops the ID capture process and optionally clears the blobs.
   * @param {boolean} [clearBlobs=true] - Whether to clear the captured blobs.
   */
  const stopIdCapture = (clearBlobs = true) => {
    if (idCaptureStream) {
      idCaptureStream.getTracks().forEach((track) => track.stop());
    }
    DOM.idVideo.srcObject = null;
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
      DOM.frontPreview.style.display = "none";
      DOM.backPreview.style.display = "none";
      console.log("ID Capture cancelled and blobs cleared.");
    }
  };

  /**
   * Captures a photo from the video stream and performs extraction.
   */
  const takePhotoAndExtract = async () => {
    if (!idCaptureStream || !DOM.idVideo || DOM.idVideo.readyState < 2) {
      updateCaptureMessage("Caméra non prête.", "warning");
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
          DOM.frontPreview.style.display = "inline-block";
          isCapturingFront = false;
          DOM.captureInstruction.textContent =
            "Positionnez le VERSO et prenez la photo.";
          updateCaptureMessage("Recto OK. Préparez le verso.", "info");
          DOM.takePhotoButton.disabled = false;
          DOM.cancelCaptureButton.disabled = false;
        } else {
          backImageBlob = blob;
          console.log("Verso captured");
          DOM.backPreview.src = URL.createObjectURL(backImageBlob);
          DOM.backPreview.style.display = "inline-block";
          stopIdCapture(false); // Keep blobs for upload
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
              updateCaptureMessage(
                `Erreur extraction: ${error.message}`,
                "error"
              );
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
  };

  /**
   * Autofills the create patient form using the extracted data.
   * @param {Object} data - The API response containing extracted data.
   */
  const autofillCreateForm = (data) => {
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
        formattedDateOfBirth = `${year}-${month.padStart(
          2,
          "0"
        )}-${day.padStart(2, "0")}`;
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
    form.sexe.value =
      extracted.gender === "F" ? "F" : extracted.gender === "M" ? "M" : "";
    // Remove previous error indications
    form
      .querySelectorAll(".input-group.has-error")
      .forEach((el) => el.classList.remove("has-error"));
    form
      .querySelectorAll("input, select")
      .forEach((el) => el.classList.remove("input-error"));
    form.querySelectorAll(".error-text").forEach((el) => (el.textContent = ""));
    showMessage(
      "message",
      "Formulaire pré-rempli. Vérifiez les informations.",
      "info"
    );
    // For Select2 fields if needed
    $(form.sexe).trigger("change");
  };

  // --- Form Validation ---
  /**
   * Validates a single input field.
   * @param {HTMLElement} input - The input element.
   * @param {Function} validationFn - The validation function (should return true/false).
   * @param {string} errorMessage - The error message to display.
   * @returns {boolean} - Whether the field is valid.
   */
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

  /**
   * Validates the create patient form.
   * @returns {boolean} - Returns true if the form is valid.
   */
  const validateCreateForm = () => {
    let isValid = true;
    showMessage("message", "", "");
    // Clear previous errors
    DOM.createForm
      ?.querySelectorAll(".input-group.has-error")
      .forEach((el) => el.classList.remove("has-error"));
    DOM.createForm
      ?.querySelectorAll("input, select")
      .forEach((el) => el.classList.remove("input-error"));

    // Validate required fields
    isValid &= validateField(
      DOM.createForm.nom,
      (val) => val.length > 0,
      "Nom requis"
    );
    isValid &= validateField(
      DOM.createForm.prenom,
      (val) => val.length > 0,
      "Prénom requis"
    );
    isValid &= validateField(
      DOM.createForm.cin,
      (val) => /^[A-Za-z]{1,2}\d{5,6}$/.test(val) || val === "",
      "Format CIN invalide (ex: AB123456)"
    );
    isValid &= validateField(
      DOM.createForm.telephone,
      (val) => /^0[5-7]\d{8}$/.test(val),
      "Format téléphone 0Xxxxxxxxx requis"
    );
    isValid &= validateField(
      DOM.createForm.adresse,
      (val) => val.length > 0,
      "Adresse requise"
    );
    isValid &= validateField(
      DOM.createForm.ville,
      (val) => val.length > 0,
      "Ville requise"
    );
    isValid &= validateField(
      DOM.createForm.date_naissance,
      (val) => val !== "",
      "Date naissance requise"
    );
    isValid &= validateField(
      DOM.createForm.sexe,
      (val) => val !== "",
      "Sélection sexe requise"
    );

    if (!isValid) {
      showMessage("message", "Veuillez corriger les erreurs.", "error");
      const firstError = DOM.createForm.querySelector(".input-error");
      firstError?.focus();
    }
    return Boolean(isValid);
  };

  // --- Event Handlers ---
  /**
   * Handles the patient search process.
   */
  const handlePatientSearch = async () => {
    showMessage("getResult", "", "");
    const cin = DOM.cinInput?.value.trim() || "";
    if (!cin) {
      showMessage("getResult", "Veuillez entrer un CIN.", "warning");
      DOM.resultDiv.innerHTML = `<div class="patient-result-container">
          <p class="message message-warning">Veuillez entrer un CIN.</p>
        </div>`;
      return;
    }
    showMessage(
      "getResult",
      '<span class="loading-spinner"></span> Recherche patient...',
      "loading"
    );
    DOM.resultDiv.style.display = "block";

    try {
      const patientResponse = await apiService.fetchPatient(cin);
      console.log("Patient Search API Response:", patientResponse);

      if (
        patientResponse &&
        Array.isArray(patientResponse) &&
        patientResponse.length > 0
      ) {
        const currentPatientInfo = patientResponse[0];
        currentIPP = currentPatientInfo.ipp;
        console.log("Patient found:", currentPatientInfo);
        if (!currentIPP)
          console.warn("IPP missing in fetched data for CIN:", cin);

        // Start visit if IPP exists
        try {
          if (currentIPP) {
            console.log(
              `Calling startVisit for existing patient IPP: ${currentIPP}`
            );
            const visitResponse = await apiService.startVisit(currentIPP);
            console.log("Start Visit Response:", visitResponse);
            showToast(
              visitResponse.message || "Visite démarrée/active.",
              "success"
            );
          } else {
            showToast(
              "Patient trouvé, mais IPP manquant. Visite non démarrée.",
              "warning"
            );
          }
        } catch (visitError) {
          console.error("Failed to start visit after search:", visitError);
          showToast(
            `Patient trouvé, mais erreur démarrage visite: ${visitError.message}`,
            "warning"
          );
        }

        // Build patient info display including QR Code generation
        const qrCodeData = generateQrData(currentIPP);
        let displayDate = "N/A";
        if (currentPatientInfo.date_naissance) {
          const dateParts = currentPatientInfo.date_naissance.split("-");
          if (dateParts.length === 3) {
            displayDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
          } else {
            displayDate = sanitizeInput(currentPatientInfo.date_naissance);
          }
        }
        const qrCodeHTML = `
            <div class="patient-result-container">
              <div class="patient-result-info">
                <div class="info-group"><div class="info-label">Nom:</div><div class="info-value">${sanitizeInput(
                  currentPatientInfo.nom
                )}</div></div>
                <div class="info-group"><div class="info-label">Prénom:</div><div class="info-value">${sanitizeInput(
                  currentPatientInfo.prenom
                )}</div></div>
                <div class="info-group"><div class="info-label">IPP:</div><div class="info-value">${sanitizeInput(
                  currentIPP || "N/A"
                )}</div></div>
                <div class="info-group"><div class="info-label">CIN:</div><div class="info-value">${sanitizeInput(
                  currentPatientInfo.cin
                )}</div></div>
                <div class="info-group"><div class="info-label">Téléphone:</div><div class="info-value">${sanitizeInput(
                  currentPatientInfo.telephone
                )}</div></div>
                <div class="info-group"><div class="info-label">Adresse:</div><div class="info-value">${sanitizeInput(
                  currentPatientInfo.adresse
                )}</div></div>
                <div class="info-group"><div class="info-label">Ville:</div><div class="info-value">${sanitizeInput(
                  currentPatientInfo.ville
                )}</div></div>
                <div class="info-group"><div class="info-label">Naissance:</div><div class="info-value">${displayDate}</div></div>
                <div class="info-group"><div class="info-label">Sexe:</div><div class="info-value">${sanitizeInput(
                  currentPatientInfo.sexe === "M"
                    ? "Homme"
                    : currentPatientInfo.sexe === "F"
                    ? "Femme"
                    : "N/A"
                )}</div></div>
                <div class="info-group"><div class="info-label">Mutuelle:</div><div class="info-value">${sanitizeInput(
                  currentPatientInfo.mutuelle || "N/A"
                )}</div></div>
              </div>
              ${
                qrCodeData
                  ? `
                <div class="patient-result-qr">
                  <img src="${
                    qrCodeData.qrImageUrl
                  }" alt="QR Code Patient IPP ${sanitizeInput(
                      currentIPP
                    )}" loading="lazy" />
                  <p style="font-size: 0.8rem; color: var(--gray-600);">Utilisez ce QR Code pour les prochaines étapes.</p>
                  <button onclick="printQRCode('${
                    qrCodeData.qrImageUrl
                  }')" class="btn btn-secondary btn-sm">
                    <i class="fas fa-print"></i> Imprimer QR
                  </button>
                </div>`
                  : '<p class="text-center text-muted mt-3">QR Code non généré (IPP manquant)</p>'
              }
            </div>`;
        DOM.resultDiv.innerHTML = qrCodeHTML;
      } else {
        showMessage("getResult", "", "");
        DOM.resultDiv.innerHTML = `
            <div class="patient-result-container">
              <p class="message message-warning">Patient non trouvé pour ce CIN.</p>
            </div>`;
      }
    } catch (error) {
      console.error("Search Patient Process Error:", error);
      showMessage("getResult", "", "");
      DOM.resultDiv.innerHTML = `
          <div class="patient-result-container">
            <p class="message message-error">Erreur lors de la recherche: ${error.message}</p>
          </div>`;
    }
  };

  /**
   * Handles the create patient process.
   * @param {Event} event - The submit event.
   */
  const handleCreatePatient = async (event) => {
    event.preventDefault();
    if (!validateCreateForm()) return;

    showMessage(
      "message",
      '<span class="loading-spinner"></span> Création patient et démarrage visite...',
      "loading"
    );
    DOM.createPatientBtn.disabled = true;
    DOM.createResultDiv.style.display = "none";
    DOM.createPrintButton.disabled = true;

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
      if (
        createResponse &&
        createResponse.success &&
        createResponse.ipp &&
        createResponse.visit_id !== undefined
      ) {
        currentIPP = createResponse.ipp;
        console.log(
          `Patient created (IPP: ${currentIPP}), Visit Started (ID: ${createResponse.visit_id})`
        );
        showToast(
          createResponse.message || "Patient créé et visite démarrée.",
          "success"
        );

        const qrCodeData = generateQrData(currentIPP);
        if (qrCodeData) {
          showMessage(
            "createResult",
            `Patient créé (IPP: ${sanitizeInput(currentIPP)})`,
            "result"
          );
          DOM.createResultMessage.textContent = `Patient créé (IPP: ${sanitizeInput(
            currentIPP
          )}) - Visite ID: ${createResponse.visit_id}`;
          DOM.createQrCodeImage.src = qrCodeData.qrImageUrl;
          DOM.createQrCodeImage.alt = `QR Code pour IPP ${sanitizeInput(
            currentIPP
          )}`;
          DOM.createPrintButton.disabled = false;
          DOM.createPrintButton.onclick = () =>
            printQRCode(qrCodeData.qrImageUrl);
          DOM.createResultDiv.style.display = "block";
        } else {
          showMessage(
            "createResult",
            `Patient créé (IPP: ${sanitizeInput(currentIPP)}), Visite ID: ${
              createResponse.visit_id
            }. Erreur QR Code.`,
            "warning"
          );
          DOM.createResultDiv.style.display = "block";
          DOM.createResultMessage.textContent = `Patient créé (IPP: ${sanitizeInput(
            currentIPP
          )}), Visite ID: ${createResponse.visit_id}. Erreur QR Code.`;
        }
        DOM.createForm.reset();
        $(DOM.mutuelleInput).val(null).trigger("change");
        $(DOM.doctorInput).val(null).trigger("change");
      } else {
        const errorMessage =
          createResponse?.message ||
          "Réponse invalide ou échec création/visite.";
        throw new Error(errorMessage);
      }
    } catch (apiError) {
      console.error("Create Patient Process Error:", apiError);
      showMessage("message", `Erreur: ${apiError.message}`, "error");
      DOM.createResultDiv.style.display = "none";
    } finally {
      DOM.createPatientBtn.disabled = false;
    }
  };

  // --- Dropdown Initialization Functions ---
  /**
   * Populates the mutuelle dropdown.
   * @param {Array} mutuelles - Array of mutuelle names.
   */
  const populateMutuelleDropdown = (mutuelles) => {
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
  };

  /**
   * Populates the doctor dropdown.
   * @param {Array} doctors - Array of doctor objects.
   */
  const populateDoctorsDropdown = (doctors) => {
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
  };

  /**
   * Fetches mutuelles and initializes the dropdown.
   */
  const fetchMutuelles = async () => {
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
  };

  /**
   * Fetches doctors and initializes the dropdown.
   */
  const fetchDoctors = async () => {
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
  };

  // --- Initial Setup ---
  /**
   * Initializes the page and related event listeners.
   */
  const initializePage = () => {
    console.log("Initializing page...");
    if (!localStorage.getItem(CONFIG.TOKEN_KEY)) {
      console.log("Reception: No token found. Redirecting to login.");
      redirectToLogin();
      return;
    }
    DOM.body.classList.add("loaded");
    console.log("Reception: Authenticated. Setting up page.");
    resetSessionTimeout();
    ["mousemove", "keypress", "click", "scroll"].forEach((event) =>
      document.addEventListener(event, resetSessionTimeout, { passive: true })
    );
    fetchMutuelles();
    fetchDoctors();
    console.log("Initial setup complete.");
  };

  // --- Event Listeners ---
  DOM.searchButton?.addEventListener("click", handlePatientSearch);
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

  // --- Run Initialization on DOMContentLoaded ---
  document.addEventListener("DOMContentLoaded", initializePage);
})();
