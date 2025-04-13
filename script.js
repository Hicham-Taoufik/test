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

  // --- THIS IS THE CORRECTED showMessage FUNCTION ---
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
      loading: "fas fa-spinner fa-spin", // Use spinner icon for loading
    };
    const iconClass = statusIcons[type] || statusIcons.info;

    // Special handling for createResult: We only update the message paragraph, not the whole div's innerHTML
    if (elementId === "createResult") {
        const isResult = type === "result" || type === 'warning';
        const baseBg = isResult ? (type === 'warning' ? "var(--warning-light)" : "var(--success-light)") : (type === "error" ? "var(--danger-light)" : "transparent");
        const baseBorder = isResult ? (type === 'warning' ? "var(--warning)" : "var(--success)") : (type === "error" ? "var(--danger)" : "transparent");
        const textColor = isResult ? (type === 'warning' ? "var(--warning-dark, #b45309)" : "var(--success-dark, #065f46)") : (type === "error" ? "var(--danger-dark, #b91c1c)" : "inherit"); // Adjusted warning/success/error text color with fallbacks

        // Style the main container (#createResult)
        el.style.backgroundColor = baseBg;
        el.style.borderLeft = `4px solid ${baseBorder}`;
        el.style.textAlign = "center";
        el.style.marginTop = "20px";
        el.style.padding = "1rem";
        el.style.borderRadius = "var(--border-radius)";
        el.className = ""; // Clear any conflicting message classes like message-error if type is result/warning

        // Find child elements within #createResult
        const msgP = el.querySelector("#createResultMessage");
        const img = el.querySelector("#createQrCodeImage");
        const btnContainer = el.querySelector(".print-buttons-container");

        // Update ONLY the message paragraph's content
        if (msgP) {
            msgP.style.color = textColor;
            msgP.textContent = message ? message : ""; // Set text content directly
        } else {
            console.warn("#createResultMessage paragraph not found within #createResult");
        }

        // Control visibility of image and buttons based on whether it's a result type
        if (img) {
             // Show image only if it's a result/warning AND the src is set and valid
             img.style.display = isResult && img.src && !img.src.endsWith('#') && !img.src.endsWith('/') ? "block" : "none";
        }
         if (btnContainer) {
             // Show button container only if it's a result/warning type
             btnContainer.style.display = isResult ? "flex" : "none";
         }

         // Ensure the #createResult div itself is visible if we are showing a result/warning/error
         // Hide it otherwise (e.g., on initial load or if message is cleared)
         el.style.display = (type === 'result' || type === 'warning' || type === 'error') ? 'block' : 'none';

    } else {
        // --- Standard handling for other elements (like #message, #getResult, #captureMessage) ---
        const iconHtml = type === 'loading'
          ? `<div class="loading-spinner" role="status" aria-label="Chargement" style="margin-right: 6px; display: inline-block;"></div>`
          : (message && type !== "result" ? `<i class="${iconClass}" style="margin-right: 6px;" aria-hidden="true"></i>` : "");

        // Set innerHTML for general message elements
        el.innerHTML = message ? `${iconHtml}${message}` : "";
        el.style.display = message ? "block" : "none"; // Control visibility
        el.className = "message"; // Base class
        if (type) {
          el.classList.add(`message-${type}`); // Add type-specific class
        }

        // Auto-hide logic (only for the main #message div, not #getResult or #captureMessage)
        if (
          elementId === "message" &&
          type !== "error" &&
          type !== "loading" &&
          message
        ) {
          setTimeout(() => {
            const currentElement = document.getElementById(elementId);
            // Check if the message is still the same one we set and it's visible
            if (currentElement && currentElement.style.display !== 'none' && currentElement.innerHTML.includes(message)) {
               currentElement.style.display = 'none'; // Just hide
            }
          }, CONFIG.MESSAGE_DISPLAY_TIME);
        }
    }
  };
  // --- END OF showMessage FUNCTION ---


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
    }
    // Note: Let the browser handle Content-Type for FormData

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
        // Try to parse error response as JSON first, then text
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = await response.text();
        }
        const errorMessage = errorData?.message || (typeof errorData === 'string' ? errorData : response.statusText);
        console.error(`API Error ${response.status}:`, errorData);
        throw new Error(`Erreur ${response.status}: ${errorMessage}`);
      }
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return response.json();
      } else {
        // If not JSON, return text (might be plain success message or other)
        return response.text();
      }
    } catch (error) {
      // Avoid logging auth errors twice if already handled
      if (!error.message?.startsWith("Authentication Failed")) {
        console.error("Fetch error caught:", error);
      }
      // Re-throw the error to be caught by the calling function
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
        body: formData, // FormData is passed directly
      }),
    fetchMutuelles: async () =>
      await fetchWithAuth(`${CONFIG.API_BASE_URL}${CONFIG.GET_MUTUELLES_ENDPOINT}`),
    fetchDoctors: async () =>
      await fetchWithAuth(`${CONFIG.API_BASE_URL}${CONFIG.GET_DOCTORS_ENDPOINT}`),
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
    )}&q=M`; // Medium error correction
    console.log("Generated QR Target URL:", qrTargetUrl);
    console.log("Generated QR Image URL:", qrImageUrl);
    return { qrTargetUrl, qrImageUrl };
  };

  // --- Printing Functions ---
  const printQRCode = (qrImageUrl) => {
    if (!qrImageUrl) {
      console.error("No QR Image URL to print.");
      showToast("Impossible d'imprimer: URL du QR Code manquante.", "error");
      return;
    }
    const printWindow = window.open("", "_blank", "width=400,height=450,noopener,noreferrer");
    if (!printWindow) {
      // Alert is handled here if window.open fails (pop-up blocked)
      alert("Veuillez autoriser les pop-ups pour imprimer le QR code.");
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Imprimer QR Code</title>
        <style>
          body { text-align: center; margin: 20px; font-family: sans-serif; }
          img { max-width: 250px; max-height: 250px; border: 1px solid #ccc; padding: 5px; display: block; margin: 0 auto; }
          @media print {
              body { margin: 5mm; }
              button { display: none; }
              .no-print { display: none; }
              @page { size: auto; margin: 5mm; } /* Adjust print margins */
          }
        </style>
      </head>
      <body>
        <img src="${qrImageUrl}" alt="QR Code Patient" />
        <script>
          window.onload = function() {
            setTimeout(function() {
              try {
                window.print();
                setTimeout(function() { window.close(); }, 500); // Close after a delay
              } catch (e) {
                console.error("Print failed:", e);
                alert("Erreur lors de l'impression.");
                window.close(); // Close even if print fails
              }
            }, 500); // Delay print slightly to allow image loading
          };
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const printPatientInfo = (patientData, ipp) => {
    if (!patientData || !ipp) {
      console.error("Missing patient data or IPP for printing info.");
      showToast("Données manquantes pour l'impression.", "error");
      return;
    }

    let displayDate = "N/A";
    if (patientData.date_naissance) {
        try {
            const date = new Date(patientData.date_naissance + 'T00:00:00Z');
            if (!isNaN(date)) {
              const day = String(date.getUTCDate()).padStart(2, '0');
              const month = String(date.getUTCMonth() + 1).padStart(2, '0');
              const year = date.getUTCFullYear();
              displayDate = `${day}/${month}/${year}`;
            }
        } catch(e) { console.warn("Could not format date:", patientData.date_naissance); }
    }

    const displaySexe = patientData.sexe === 'M' ? 'Homme' : patientData.sexe === 'F' ? 'Femme' : 'N/A';
    const doctorText = patientData.doctorDisplay || (patientData.doctor ? `ID: ${patientData.doctor}` : 'Non spécifié');

    const printWindow = window.open("", "_blank", "width=700,height=500,noopener,noreferrer");
    if (!printWindow) {
      // Alert is handled here if window.open fails (pop-up blocked)
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
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 20px; line-height: 1.6; color: #333; }
          h1 { text-align: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; font-size: 1.5em; font-weight: 600; }
          .info-grid { display: grid; grid-template-columns: 150px 1fr; gap: 8px 15px; margin-bottom: 20px; }
          .info-grid strong { font-weight: 600; color: #555; }
          .info-grid span { word-break: break-word; }
          hr { border: 0; border-top: 1px solid #eee; margin: 20px 0; }
          .footer-print { text-align: center; font-size: 0.8em; color: #777; margin-top: 30px; }
          @media print {
            body { margin: 10mm; font-size: 10pt; }
            h1 { font-size: 14pt; }
            button { display: none; }
            .no-print { display: none; }
            @page { size: A4; margin: 10mm; } /* Standard A4 size and margins */
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
          <strong>Date Naissance:</strong> <span>${displayDate}</span>
          <strong>Sexe:</strong> <span>${displaySexe}</span>
          <strong>Téléphone:</strong> <span>${sanitizeInput(patientData.telephone)}</span>
          <strong>Adresse:</strong> <span>${sanitizeInput(patientData.adresse)}</span>
          <strong>Ville:</strong> <span>${sanitizeInput(patientData.ville)}</span>
          <strong>Mutuelle:</strong> <span>${sanitizeInput(patientData.mutuelle || 'Aucune')}</span>
          <strong>Médecin:</strong> <span>${sanitizeInput(doctorText)}</span>
        </div>
        <hr>
        <p class="footer-print no-print">
          MediClinic © ${new Date().getFullYear()}
        </p>
        <script>
          window.onload = function() {
            setTimeout(function() {
              try {
                window.print();
                setTimeout(function() { window.close(); }, 500); // Close after a delay
              } catch (e) {
                console.error("Print failed:", e);
                alert("Erreur lors de l'impression.");
                window.close(); // Close even if print fails
              }
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
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        alert("Accès caméra non supporté par ce navigateur ou non sécurisé (HTTPS requis).");
        updateCaptureMessage("Caméra non supportée.", "error");
        return;
    }
    if (idCaptureStream) { // Prevent starting if already active
        console.warn("Capture already in progress.");
        return;
    }

    updateCaptureMessage("Demande accès caméra...", "loading");
    DOM.captureIdButton.disabled = true;
    DOM.idCaptureContainer.classList.remove("hidden");
    DOM.idCaptureContainer.style.display = "block";
    DOM.frontPreview.classList.add("hidden");
    DOM.frontPreview.src = "";
    DOM.backPreview.classList.add("hidden");
    DOM.backPreview.src = "";
    isCapturingFront = true;
    frontImageBlob = null; // Reset blobs
    backImageBlob = null;
    DOM.captureInstruction.textContent = "Positionnez le RECTO de la CIN et prenez la photo.";

    try {
      const constraints = {
        video: {
          facingMode: "environment", // Prefer back camera
          width: { ideal: 1920 }, // Request higher resolution
          height: { ideal: 1080 }
        }
      };
      idCaptureStream = await navigator.mediaDevices.getUserMedia(constraints);
      DOM.idVideo.srcObject = idCaptureStream;
      // Use a promise to wait for video to be ready
      await new Promise((resolve) => { DOM.idVideo.onloadedmetadata = resolve; });
      await DOM.idVideo.play();
      updateCaptureMessage("Caméra prête. Prenez la photo du RECTO.", "info");
      DOM.takePhotoButton.disabled = false;
      DOM.cancelCaptureButton.disabled = false;
    } catch (err) {
      console.error("Camera access error:", err);
      let errorMessage = `Erreur caméra: ${err.name} - ${err.message}`;
      if (err.name === "NotAllowedError") {
          errorMessage = "Permission caméra refusée. Veuillez l'autoriser dans les paramètres du navigateur.";
      } else if (err.name === "NotFoundError") {
          errorMessage = "Aucune caméra compatible trouvée.";
      } else if (err.name === "NotReadableError") {
          errorMessage = "Erreur caméra: Impossible de lire le flux vidéo (peut-être utilisée par une autre application?).";
      } else if (err.name === "OverconstrainedError") {
          errorMessage = `Erreur caméra: Contraintes non supportées (${err.constraint}). Essayez une résolution inférieure.`;
      }
      updateCaptureMessage(errorMessage, "error");
      stopIdCapture(true); // Stop and clean up fully on error
    }
  };

  const stopIdCapture = (clearBlobs = true) => {
    if (idCaptureStream) {
      idCaptureStream.getTracks().forEach((track) => track.stop());
      idCaptureStream = null; // Clear the stream variable
    }
    DOM.idVideo.srcObject = null;
    DOM.idCaptureContainer.classList.add("hidden");
    DOM.idCaptureContainer.style.display = "none";
    DOM.takePhotoButton.disabled = true;
    DOM.cancelCaptureButton.disabled = true;
    DOM.captureIdButton.disabled = false;
    updateCaptureMessage("", ""); // Clear message
    if (clearBlobs) {
      if (DOM.frontPreview.src) URL.revokeObjectURL(DOM.frontPreview.src);
      if (DOM.backPreview.src) URL.revokeObjectURL(DOM.backPreview.src);
      frontImageBlob = null;
      backImageBlob = null;
      DOM.frontPreview.src = "";
      DOM.backPreview.src = "";
      DOM.frontPreview.classList.add("hidden");
      DOM.backPreview.classList.add("hidden");
      console.log("ID Capture stopped/cancelled and blobs cleared.");
    }
  };

  const takePhotoAndExtract = async () => {
    if (!idCaptureStream || !DOM.idVideo.srcObject || DOM.idVideo.readyState < 3) { // readyState < 3 means not enough data
      updateCaptureMessage("Caméra non prête ou flux interrompu.", "warning");
      console.warn("ID capture: Video element not ready", DOM.idVideo);
      return;
    }

    updateCaptureMessage("Capture en cours...", "loading");
    DOM.takePhotoButton.disabled = true; // Disable buttons during capture/processing
    DOM.cancelCaptureButton.disabled = true;

    const canvas = DOM.idCanvas;
    // Ensure video dimensions are available and valid
    if (!DOM.idVideo.videoWidth || !DOM.idVideo.videoHeight) {
         updateCaptureMessage("Erreur: Dimensions vidéo invalides.", "error");
         stopIdCapture(true);
         return;
    }
    canvas.width = DOM.idVideo.videoWidth;
    canvas.height = DOM.idVideo.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
         updateCaptureMessage("Erreur création contexte canvas.", "error");
         stopIdCapture(true);
         return;
    }
    context.drawImage(DOM.idVideo, 0, 0, canvas.width, canvas.height);

    try {
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((b) => {
                if (b) resolve(b);
                else reject(new Error("Canvas toBlob returned null"));
            }, 'image/jpeg', 0.9);
        });

        if (isCapturingFront) {
          if (DOM.frontPreview.src) URL.revokeObjectURL(DOM.frontPreview.src); // Revoke old object URL if any
          frontImageBlob = blob;
          console.log("Recto captured", `Size: ${Math.round(blob.size / 1024)} KB`);
          DOM.frontPreview.src = URL.createObjectURL(frontImageBlob);
          DOM.frontPreview.classList.remove("hidden");
          isCapturingFront = false;
          DOM.captureInstruction.textContent = "Positionnez le VERSO et prenez la photo.";
          updateCaptureMessage("Recto OK. Préparez le verso.", "info");
          DOM.takePhotoButton.disabled = false; // Re-enable for next photo
          DOM.cancelCaptureButton.disabled = false;
        } else {
          if (DOM.backPreview.src) URL.revokeObjectURL(DOM.backPreview.src); // Revoke old object URL if any
          backImageBlob = blob;
          console.log("Verso captured", `Size: ${Math.round(blob.size / 1024)} KB`);
          DOM.backPreview.src = URL.createObjectURL(backImageBlob);
          DOM.backPreview.classList.remove("hidden");
          stopIdCapture(false); // Stop camera but keep blobs for upload
          updateCaptureMessage("Verso OK. Analyse des images...", "loading");

          if (frontImageBlob && backImageBlob) {
            const formData = new FormData();
            formData.append("data", frontImageBlob, "id_card_front.jpg");
            formData.append("data", backImageBlob, "id_card_back.jpg");

            try {
              const extractedData = await apiService.extractIdInfo(formData);
              console.log("Extracted ID Data:", extractedData);
              // Assuming API returns { success: true, data: { ... } } or { success: false, message: "..." }
              if (extractedData && (extractedData.success === true || String(extractedData.success).toLowerCase() === 'true') && extractedData.data) {
                autofillCreateForm(extractedData);
                showToast("Formulaire pré-rempli!", "success");
                updateCaptureMessage("Données extraites avec succès!", "success");
                // Optionally hide previews after success
                 setTimeout(() => {
                   if (DOM.frontPreview.src) URL.revokeObjectURL(DOM.frontPreview.src);
                   if (DOM.backPreview.src) URL.revokeObjectURL(DOM.backPreview.src);
                   DOM.frontPreview.classList.add("hidden"); DOM.backPreview.classList.add("hidden");
                   DOM.frontPreview.src = ""; DOM.backPreview.src = "";
                 }, 4000);
              } else {
                const errorMessage = extractedData?.message || "Aucune donnée extraite ou format de réponse invalide.";
                throw new Error(errorMessage);
              }
            } catch (error) {
              console.error("Error during extraction API call:", error);
              updateCaptureMessage(`Erreur extraction: ${error.message}`, "error");
              // Keep previews visible on error for inspection? Consider clearing blobs here too.
              // stopIdCapture(true);
            }
            // Consider clearing blobs after API call regardless of success/fail if they are large
            // frontImageBlob = null; backImageBlob = null;

          } else {
            console.error("Missing blobs for extraction.");
            updateCaptureMessage("Erreur: Images manquantes pour l'analyse.", "error");
            stopIdCapture(true); // Clear everything if blobs are missing
          }
        }
    } catch (error) {
        console.error("Error during image capture/processing:", error);
        updateCaptureMessage(`Erreur interne lors de la capture: ${error.message}`, "error");
        stopIdCapture(true);
    }
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
      if (dateParts.length === 3 && dateParts[0].length === 2 && dateParts[1].length === 2 && dateParts[2].length === 4) {
        const day = dateParts[0];
        const month = dateParts[1];
        const year = dateParts[2];
        // Format to YYYY-MM-DD for the date input field
        formattedDateOfBirth = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        console.log("Formatted date_of_birth for input:", formattedDateOfBirth);
      } else {
        console.warn("DOB format unexpected from API (expected DD/MM/YYYY):", originalDateString);
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
    // Autofill telephone if provided by API (adjust field name if necessary)
    form.telephone.value = extracted.phone_number ?? form.telephone.value;

    // Reset validation states visually
    form.querySelectorAll(".input-group.has-error").forEach((el) => el.classList.remove("has-error"));
    form.querySelectorAll("input.input-error, select.input-error").forEach((el) => el.classList.remove("input-error"));
    form.querySelectorAll(".error-text").forEach((el) => (el.textContent = ""));
    showMessage("message", "Formulaire pré-rempli. Vérifiez et complétez les informations.", "info");
    // Trigger change for Select2 if used for sexe (standard select used here)
    $(form.sexe).trigger("change");
    // Optionally trigger validation after autofill if needed
    // validateCreateForm();
  };

  // --- Form Validation ---
  const validateField = (input, validationFn, errorMessage) => {
    if (!input) return true; // Skip if element doesn't exist
    const value = input.value.trim();
    const group = input.closest(".input-group");
    if (!group) return true; // Skip if structure is wrong

    let isValid = true;
    // Check if field is required
    if (input.required) {
        // If required, must not be empty and must pass validation function
        isValid = value !== '' && validationFn(value);
    } else if (value !== '') {
        // If not required, but has a value, it must pass validation
        isValid = validationFn(value);
    }
    // If not required and empty, it's considered valid (isValid remains true)

    group.classList.toggle("has-error", !isValid);
    input.classList.toggle("input-error", !isValid);
    const errorDiv = group.querySelector(".error-text");
    if (errorDiv) errorDiv.textContent = isValid ? "" : errorMessage;
    return isValid;
  };

  const validateCreateForm = () => {
    let isFormValid = true; // Use a different variable name
    showMessage("message", "", ""); // Clear previous messages
    DOM.createForm?.querySelectorAll(".input-group.has-error").forEach((el) => el.classList.remove("has-error"));
    DOM.createForm?.querySelectorAll("input.input-error, select.input-error").forEach((el) => el.classList.remove("input-error"));
    DOM.createForm?.querySelectorAll(".error-text").forEach((el) => (el.textContent = "")); // Clear errors

    isFormValid &= validateField(DOM.createForm.nom, (val) => val.length > 0, "Nom requis");
    isFormValid &= validateField(DOM.createForm.prenom, (val) => val.length > 0, "Prénom requis");
    // CIN validation: required, specific pattern
    isFormValid &= validateField(
      DOM.createForm.cin,
      (val) => /^[A-Za-z]{1,2}\d{5,6}$/.test(val), // Must match pattern if present
      "Format CIN invalide (ex: AB123456)" // This message shown if required AND invalid, or not required AND invalid
    );
    isFormValid &= validateField(DOM.createForm.telephone, (val) => /^0[5-7]\d{8}$/.test(val), "Format téléphone 0Xxxxxxxxx requis");
    isFormValid &= validateField(DOM.createForm.adresse, (val) => val.length > 0, "Adresse requise");
    isFormValid &= validateField(DOM.createForm.ville, (val) => val.length > 0, "Ville requise");
    isFormValid &= validateField(DOM.createForm.date_naissance, (val) => val !== "", "Date naissance requise");
    isFormValid &= validateField(DOM.createForm.sexe, (val) => val !== "", "Sélection sexe requise");
    // Mutuelle and Doctor are optional (not required), no specific validation needed here

    if (!isFormValid) {
      showMessage("message", "Veuillez corriger les erreurs indiquées dans le formulaire.", "error");
      const firstError = DOM.createForm.querySelector(".input-error");
      firstError?.focus(); // Focus the first invalid field
    }
    return Boolean(isFormValid); // Ensure return type is boolean
  };

  // --- Event Handlers ---
  const handlePatientSearch = async () => {
    showMessage("getResult", "", ""); // Clear previous results
    const cin = DOM.cinInput?.value.trim().toUpperCase() || ""; // Standardize CIN input
    if (!cin || !/^[A-Za-z]{1,2}\d{5,6}$/.test(cin)) { // Validate CIN format for search
      showMessage("getResult", "Veuillez entrer un CIN valide (ex: AB123456).", "warning");
      // Keep the message simple in the result area
      DOM.resultDiv.innerHTML = `<div class="message message-warning">Veuillez entrer un CIN valide (ex: AB123456).</div>`;
      DOM.resultDiv.style.display = "block";
      return;
    }

    showMessage("getResult", '<div class="loading-spinner" role="status" aria-label="Chargement"></div> Recherche patient...', "loading");
    DOM.resultDiv.style.display = "block"; // Show loading message container

    try {
      const response = await apiService.fetchPatient(cin);
      console.log("Patient Search API Response:", response);

      let patientData = null;
      // Adjust based on expected API response format
       if (typeof response === 'object' && response !== null && (response.success === true || String(response.success).toLowerCase() === 'true') && response.patient) {
         patientData = response.patient;
       } else if (Array.isArray(response) && response.length > 0) {
         patientData = response[0];
       } else if (typeof response === 'object' && response !== null && response.ipp) {
         patientData = response;
       } else if (typeof response === 'object' && response !== null && (response.success === false || String(response.success).toLowerCase() === 'false') && response.message && response.message.toLowerCase().includes('not found')) {
          patientData = null;
       }


      if (!patientData || !patientData.ipp) { // Check for patient data AND IPP specifically
        showMessage("getResult", "", ""); // Clear loading message
        DOM.resultDiv.innerHTML = `<div class="message message-warning">Patient non trouvé pour le CIN: ${sanitizeInput(cin)}.</div>`;
        DOM.resultDiv.style.display = "block";
        return;
      }

      // --- Patient Found ---
      currentIPP = patientData.ipp; // Store IPP from response
      console.log("Patient found:", patientData);
      const qrCodeData = generateQrData(currentIPP); // Generate QR code

      // Format date
      let displayDate = "N/A";
      if (patientData.date_naissance) {
         try {
            let date;
            if (/^\d{4}-\d{2}-\d{2}/.test(patientData.date_naissance)) { // YYYY-MM-DD
                date = new Date(patientData.date_naissance + 'T00:00:00Z');
            } else if (/^\d{2}\/\d{2}\/\d{4}/.test(patientData.date_naissance)) { // DD/MM/YYYY
                const parts = patientData.date_naissance.split('/');
                date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00Z`);
            } else {
                 date = new Date(patientData.date_naissance); // Try parsing directly (ISO 8601?)
            }
            if (!isNaN(date)) {
              displayDate = `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
            } else {
                 displayDate = sanitizeInput(patientData.date_naissance); // Fallback
            }
        } catch(e) {
            console.warn("Could not format date from search result:", patientData.date_naissance, e);
            displayDate = sanitizeInput(patientData.date_naissance); // Fallback
        }
      }

      // Build result HTML
      DOM.resultDiv.innerHTML = ''; // Clear previous content
      const resultCard = document.createElement('div');
      resultCard.className = 'patient-result-card'; // Use your styling class
      resultCard.innerHTML = `
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
            <li><strong>Sexe:</strong> ${ patientData.sexe === 'M' ? 'Homme' : patientData.sexe === 'F' ? 'Femme' : 'N/A' }</li>
            <li><strong>Mutuelle:</strong> ${sanitizeInput(patientData.mutuelle || 'N/A')}</li>
            ${patientData.doctor_details ? `<li><strong>Médecin:</strong> ${sanitizeInput(patientData.doctor_details)}</li>` : (patientData.doctor ? `<li><strong>Médecin ID:</strong> ${sanitizeInput(patientData.doctor)}</li>` : '')}
          </ul>
          ${
            qrCodeData
              ? `
            <div class="qr-section mt-3 text-center">
              <img src="${qrCodeData.qrImageUrl}" alt="QR Code Patient IPP ${sanitizeInput(currentIPP)}" loading="lazy" style="max-width: 150px; margin-bottom: 10px;" />
              <button id="searchPrintQrBtn" class="btn btn-secondary btn-sm">
                <i class="fas fa-print"></i> Imprimer QR
              </button>
            </div>`
              : '<p class="text-center text-muted mt-3">QR Code non généré (IPP manquant)</p>'
          }
      `;
      DOM.resultDiv.appendChild(resultCard);

      // Add event listener for the dynamically created button
      const searchPrintQrBtn = document.getElementById('searchPrintQrBtn');
      if (searchPrintQrBtn && qrCodeData) {
          searchPrintQrBtn.onclick = () => printQRCode(qrCodeData.qrImageUrl);
      }
      DOM.resultDiv.style.display = "block"; // Ensure container is visible

    } catch (error) {
      console.error("Search Patient Process Error:", error);
      showMessage("getResult", "", ""); // Clear loading message
      DOM.resultDiv.innerHTML = `<div class="message message-error">Erreur lors de la recherche: ${error.message}</div>`;
      DOM.resultDiv.style.display = "block";
    }
  };

  const handleCreatePatient = async (event) => {
    event.preventDefault();
    if (!validateCreateForm()) return;

    showMessage("message", '<div class="loading-spinner" role="status" aria-label="Chargement"></div> Création patient...', "loading");
    DOM.createPatientBtn.disabled = true;
    DOM.createResultDiv.style.display = "none"; // Hide previous result
    DOM.createPrintQrButton.disabled = true;   // Ensure buttons start disabled
    DOM.createPrintInfoButton.disabled = true;

    const payload = {
      nom: DOM.createForm.nom.value.trim(),
      prenom: DOM.createForm.prenom.value.trim(),
      cin: DOM.createForm.cin.value.trim().toUpperCase(), // CIN is required by validation now
      telephone: DOM.createForm.telephone.value.trim(),
      adresse: DOM.createForm.adresse.value.trim(),
      ville: DOM.createForm.ville.value.trim(),
      date_naissance: DOM.createForm.date_naissance.value, // Should be YYYY-MM-DD
      sexe: DOM.createForm.sexe.value,
      has_insurance: !!DOM.mutuelleInput.value,
      mutuelle: DOM.mutuelleInput.value?.trim() || null,
      doctor: DOM.doctorInput.value || null,
      doctorDisplay: DOM.doctorInput.selectedOptions.length > 0 && DOM.doctorInput.value ? DOM.doctorInput.selectedOptions[0].text : null
    };
    console.log("Payload for Create Patient:", payload);

    try {
      const createResponse = await apiService.createPatient(payload);
      console.log("Create Patient API Response:", createResponse);

      // Check for explicit success and IPP
      if (createResponse && (createResponse.success === true || String(createResponse.success).toLowerCase() === 'true') && createResponse.ipp) {
        currentIPP = createResponse.ipp;
        console.log(`Patient created (IPP: ${currentIPP})`);
        showToast(createResponse.message || "Patient créé avec succès.", "success");
        showMessage("message", "", ""); // Clear loading message from main area

        const qrCodeData = generateQrData(currentIPP);

        if (qrCodeData && qrCodeData.qrImageUrl) {
          // Set message for result area using showMessage (which handles styling)
          showMessage("createResult", `Patient créé (IPP: ${sanitizeInput(currentIPP)})`, "result");

          // Set QR image source
          DOM.createQrCodeImage.src = qrCodeData.qrImageUrl;
          DOM.createQrCodeImage.alt = `QR Code pour IPP ${sanitizeInput(currentIPP)}`;

          // Enable buttons and assign handlers
          DOM.createPrintQrButton.disabled = false;
          DOM.createPrintQrButton.onclick = () => printQRCode(qrCodeData.qrImageUrl);

          DOM.createPrintInfoButton.disabled = false;
          DOM.createPrintInfoButton.onclick = () => printPatientInfo(payload, currentIPP);

          // showMessage with type 'result' already makes the div visible

        } else {
           // Handle QR generation error
          showMessage("createResult", `Patient créé (IPP: ${sanitizeInput(currentIPP)}). Erreur génération QR Code.`, "warning");

          DOM.createQrCodeImage.src = ""; // Clear image source
          DOM.createQrCodeImage.alt = "Erreur génération QR Code";

          DOM.createPrintQrButton.disabled = true; // Disable QR print

          // Still enable info print
          DOM.createPrintInfoButton.disabled = false;
          DOM.createPrintInfoButton.onclick = () => printPatientInfo(payload, currentIPP);

           // showMessage with type 'warning' already makes the div visible
        }

        // Reset form for next entry
        DOM.createForm.reset();
        $(DOM.mutuelleInput).val(null).trigger('change.select2');
        $(DOM.doctorInput).val(null).trigger('change.select2');
        // Clear validation styles
        DOM.createForm.querySelectorAll(".input-group.has-error").forEach(el => el.classList.remove("has-error"));
        DOM.createForm.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
        DOM.createForm.querySelectorAll(".error-text").forEach(el => el.textContent = "");

      } else {
        // Handle API failure
        const errorMessage = createResponse?.message || "Réponse invalide ou échec création (IPP manquant?).";
        throw new Error(errorMessage);
      }
    } catch (apiError) {
      console.error("Create Patient Process Error:", apiError);
      showMessage("message", `Erreur lors de la création: ${apiError.message}`, "error");
      DOM.createResultDiv.style.display = "none"; // Ensure result area is hidden on error
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
    dropdown.innerHTML = `<option value="" selected>Aucune / Non spécifié</option>`;
    mutuelles.forEach((mutuelleName) => {
      const option = document.createElement("option");
      option.value = sanitizeInput(mutuelleName);
      option.textContent = sanitizeInput(mutuelleName);
      dropdown.appendChild(option);
    });
    $(dropdown).select2({
      placeholder: "Choisir une mutuelle...",
      allowClear: true,
      width: "100%",
      theme: "default",
      dropdownAutoWidth: true,
    }).val(null).trigger('change'); // Ensure placeholder shows initially
  };

  const populateDoctorsDropdown = (doctors) => {
    const dropdown = DOM.doctorInput;
    if (!dropdown) return;
    dropdown.innerHTML = `<option value="" selected>Choisir un médecin...</option>`;
    doctors.forEach((doctor) => {
      const option = document.createElement("option");
      option.value = sanitizeInput(doctor.matricule);
      const nom = sanitizeInput(doctor.nom || '');
      const prenom = sanitizeInput(doctor.prenom || '');
      const specialite = sanitizeInput(doctor.specialite || 'N/A');
      option.textContent = `${nom} ${prenom} - ${specialite}`;
      dropdown.appendChild(option);
    });
    $(dropdown).select2({
      placeholder: "Choisir un médecin...",
      allowClear: true,
      width: "100%",
      theme: "default",
      dropdownAutoWidth: true,
    }).val(null).trigger('change'); // Ensure placeholder shows initially
  };

  const fetchMutuelles = async () => {
    try {
      const data = await apiService.fetchMutuelles();
       if (data && (data.success === true || String(data.success).toLowerCase() === 'true') && Array.isArray(data.mutuelles)) {
        populateMutuelleDropdown(data.mutuelles);
      } else {
        console.error("Failed to fetch or parse mutuelles:", data?.message || 'Format invalide');
        showToast("Erreur chargement liste mutuelles.", "error");
      }
    } catch (error) {
      console.error("Error fetching mutuelles:", error);
      showToast(`Erreur réseau (mutuelles): ${error.message}`, "error");
    }
  };

  const fetchDoctors = async () => {
    try {
      const data = await apiService.fetchDoctors();
       if (data && (data.success === true || String(data.success).toLowerCase() === 'true') && Array.isArray(data.doctors)) {
        populateDoctorsDropdown(data.doctors);
      } else {
        console.error("Failed to fetch or parse doctors:", data?.message || 'Format invalide');
        showToast("Erreur chargement liste médecins.", "error");
      }
    } catch (error) {
      console.error("Error fetching doctors:", error);
      showToast(`Erreur réseau (médecins): ${error.message}`, "error");
    }
  };

  // --- Initial Setup ---
  const initializePage = () => {
    console.log("Initializing page...");
    // Check for token BEFORE doing anything else
    if (!localStorage.getItem(CONFIG.TOKEN_KEY)) {
      console.log("Reception: No token found. Redirecting to login.");
      redirectToLogin();
      return; // Stop further execution if not authenticated
    }

    DOM.body.classList.add("loaded");
    console.log("Reception: Authenticated. Setting up page.");
    resetSessionTimeout(); // Start session timeout

    // Add activity listeners to reset timeout
    ["mousemove", "keypress", "click", "scroll", "touchstart"].forEach((event) =>
      document.addEventListener(event, resetSessionTimeout, { passive: true })
    );

    // Fetch dynamic data for dropdowns
    fetchMutuelles();
    fetchDoctors();

    // Add listener for logout button
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", logout);
    } else {
        console.warn("Logout button not found.");
    }

    // Add listeners for forms and buttons if they exist
    DOM.searchForm?.addEventListener("submit", (e) => {
        e.preventDefault();
        handlePatientSearch();
    });

    DOM.createForm?.addEventListener("submit", handleCreatePatient);
    DOM.captureIdButton?.addEventListener("click", startIdCapture);
    DOM.takePhotoButton?.addEventListener("click", takePhotoAndExtract);
    DOM.cancelCaptureButton?.addEventListener("click", () => stopIdCapture(true)); // true to clear blobs on cancel

    console.log("Initial setup complete. Event listeners attached.");
  };

  // --- Initialization ---
  // Run initialization once the DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initializePage);
  } else {
    // DOMContentLoaded has already fired
    initializePage();
  }

})(); // IIFE ends here
