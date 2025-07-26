const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const status = document.getElementById('status');
const avatarSelect = document.getElementById('avatarSelect');

// Nouveaux éléments pour la caméra
const cameraSelect = document.getElementById('cameraSelect');

// Nouveaux éléments pour les backgrounds
const backgroundInput = document.getElementById('backgroundInput');
const uploadBackgroundBtn = document.getElementById('uploadBackgroundBtn');
const backgroundSelect = document.getElementById('backgroundSelect');
const backgroundPreview = document.getElementById('backgroundPreview');
const backgroundActiveStatus = document.getElementById('backgroundActiveStatus');

// Fonction pour lister les fichiers stockés
async function listStoredFiles() {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'listVrmFiles'
        });

        if (response.success) {
            console.log("Fichiers VRM stockés:", response.files);
            return response.files;
        } else {
            console.error("Erreur lors de la récupération de la liste:", response.error);
            return [];
        }
    } catch (error) {
        console.error("Erreur lors de la communication avec l'extension:", error);
        return [];
    }
}

// Fonction pour récupérer un fichier spécifique
async function getStoredFile(fileName) {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getVrmFile',
            fileName: fileName
        });

        if (response.success && response.dataUrl) {
            // Convertir le DataURL en Blob pour utilisation
            const blob = await fetch(response.dataUrl).then(res => res.blob());
            return blob; // Retourne le Blob du fichier
        } else {
            console.error("Erreur lors de la récupération du fichier:", response.error);
            return null;
        }
    } catch (error) {
        console.error("Erreur lors de la communication avec l'extension:", error);
        return null;
    }
}

function setStatusMessage(element, message, type = "info") {
    // element.textContent = message;
    // element.className = `status-message ${type}`;
}

uploadBtn.addEventListener('click', async () => {
    fileInput.click();
});

fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) {
        setStatusMessage(status, "Please select a .vrm file.", "error");
        return;
    }
    if (!file.name.endsWith('.vrm')) {
        setStatusMessage(status, "Only .vrm files are allowed.", "error");
        return;
    }
    setStatusMessage(status, "Loading file...", "info");

    const reader = new FileReader();
    reader.onload = async function (e) {
        const arrayBuffer = e.target.result;
        console.log("Fichier .vrm chargé :", file.name, "Taille :", file.size, "octets");

        // Convertir l'arrayBuffer en Blob et créer un lien de téléchargement
        const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        try {
            // Envoyer le fichier à l'extension (background script)
            const response = await chrome.runtime.sendMessage({
                action: 'storeVrmFile',
                fileName: file.name,
                fileData: url // Convertir en base64 pour l'envoi
            });

            if (response.success) {
                setStatusMessage(status, "Fichier .vrm uploadé et stocké dans l'extension.", "success");

                // Mettre à jour la liste des avatars
                await updateAvatarSelect();

                // Afficher la liste des fichiers stockés
                const storedFiles = await listStoredFiles();
                if (storedFiles.length > 0) {
                    console.log("Fichiers disponibles:", storedFiles);
                }
            } else {
                setStatusMessage(status, "Erreur lors du stockage : " + response.error, "error");
            }
        } catch (err) {
            console.error("Erreur lors de l'envoi à l'extension:", err);
            setStatusMessage(status, "Erreur lors de la communication avec l'extension.", "error");
        }
    };
    reader.readAsArrayBuffer(file);
});

// Fonction pour définir l'avatar actif
async function setActiveAvatar(fileName) {
    try {
        await chrome.storage.local.set({ activeAvatar: fileName });

        return true;
    } catch (error) {
        return false;
    }
}

// Fonction pour récupérer l'avatar actif
async function getActiveAvatar() {
    try {
        const { activeAvatar } = await chrome.storage.local.get(['activeAvatar']);

        if (activeAvatar) {
            return activeAvatar;
        } else {
            console.error("Erreur lors de la récupération de l'avatar actif:", response.error);
            return null;
        }
    } catch (error) {
        console.error("Erreur lors de la communication avec l'extension:", error);
        return null;
    }
}

// Fonction pour mettre à jour la liste des avatars dans le select
async function updateAvatarSelect() {
    const storedFiles = await listStoredFiles();
    const activeAvatar = await getActiveAvatar();

    // Vider le select
    avatarSelect.innerHTML = '<option value="">No avatar selected</option>';

    // Ajouter les fichiers VRM
    storedFiles.forEach(fileName => {
        const option = document.createElement('option');
        option.value = fileName;
        option.textContent = fileName;
        if (fileName === activeAvatar) {
            option.selected = true;
        }
        avatarSelect.appendChild(option);
    });
}

// Gestionnaire pour le changement de sélection d'avatar
avatarSelect.onchange = async () => {
    const selectedAvatar = avatarSelect.value;
    await setActiveAvatar(selectedAvatar);
};

// Charger la liste des fichiers au démarrage de la popup
document.addEventListener('DOMContentLoaded', async () => {
    // Initialiser le select d'avatar
    await updateAvatarSelect();

    // Initialiser le select de caméra
    await updateCameraSelect();

    // Initialiser le select de background
    await updateBackgroundSelect();
});

// ===== FONCTIONS POUR LES CAMÉRAS =====

// Fonction pour lister les caméras disponibles
async function listCameras() {
    try {
        // D'abord, demander l'autorisation d'accès aux médias pour obtenir les labels
        let stream = null;

        // Énumérer les dispositifs
        const { devices } = await chrome.storage.local.get('devices')
        console.log("Dispositifs disponibles:", devices);
        const cameras = JSON.parse(devices).filter(device => device.kind === 'videoinput');

        // Nettoyer le stream si on l'a créé
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        console.log("Caméras trouvées:", cameras);
        return cameras;
    } catch (error) {
        console.error("Erreur lors de la récupération des caméras:", error);
        return [];
    }
}

// Fonction pour définir la caméra active
async function setActiveCamera(deviceId) {
    try {
        chrome.storage.local.set({ activeCamera: deviceId });

        return true;
    } catch (error) {
        return false;
    }
}

// Fonction pour récupérer la caméra active
async function getActiveCamera() {
    try {
        const { activeCamera } = await chrome.storage.local.get(['activeCamera']);
        if (activeCamera) {
            return activeCamera;
        } else {
            console.error("Erreur lors de la récupération de la caméra active:", response.error);
            return null;
        }
    } catch (error) {
        console.error("Erreur lors de la communication avec l'extension:", error);
        return null;
    }
}

// Fonction pour mettre à jour la liste des caméras dans le select
async function updateCameraSelect() {
    // Afficher un message de chargement
    cameraSelect.innerHTML = '<option value="">Loading cameras...</option>';

    const cameras = await listCameras();
    const activeCamera = await getActiveCamera();

    // Vider le select
    cameraSelect.innerHTML = '<option value="">No camera selected</option>';

    if (cameras.length === 0) {
        cameraSelect.innerHTML = '<option value="">No cameras found</option>';
        return;
    }

    // Ajouter les caméras avec de meilleurs labels
    cameras.forEach((camera, index) => {
        const option = document.createElement('option');
        option.value = camera.label;

        // Créer un label plus informatif
        let label = camera.label;
        if (!label || label === '') {
            label = `Camera ${index + 1}`;
        }

        // Ajouter l'ID tronqué si disponible
        if (camera.deviceId && camera.deviceId !== 'default') {
            const shortId = camera.deviceId.substring(0, 8);
            label += ` (${shortId}...)`;
        }

        option.textContent = label;

        if (camera.label === activeCamera) {
            option.selected = true;
        }
        cameraSelect.appendChild(option);
    });
}

// ===== FONCTIONS POUR LES BACKGROUNDS =====

// Fonction pour lister les backgrounds stockés
async function listStoredBackgrounds() {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'listBackgrounds'
        });

        if (response.success) {
            console.log("Backgrounds stockés:", response.backgrounds);
            return response.backgrounds;
        } else {
            console.error("Erreur lors de la récupération de la liste des backgrounds:", response.error);
            return [];
        }
    } catch (error) {
        console.error("Erreur lors de la communication avec l'extension:", error);
        return [];
    }
}

// Fonction pour récupérer un background spécifique
async function getStoredBackground(fileName) {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getBackground',
            fileName: fileName
        });

        if (response.success && response.dataUrl) {
            return response.dataUrl;
        } else {
            console.error("Erreur lors de la récupération du background:", response.error);
            return null;
        }
    } catch (error) {
        console.error("Erreur lors de la communication avec l'extension:", error);
        return null;
    }
}

// Fonction pour définir le background actif
async function setActiveBackground(fileName) {
    try {
        chrome.storage.local.set({ activeBackground: fileName });

        if (fileName) {
            setStatusMessage(backgroundActiveStatus, `Background actif: ${fileName}`, "success");
        } else {
            setStatusMessage(backgroundActiveStatus, "Aucun background sélectionné", "info");
        }

        // Mettre à jour la prévisualisation
        let backgroundDataUrl = null;
        if (fileName) {
            backgroundDataUrl = await getStoredBackground(fileName);
            if (backgroundDataUrl) {
                // backgroundPreview.innerHTML = `<img src="${backgroundDataUrl}" alt="Preview du background actif">`;
            }
        } else {
            backgroundPreview.innerHTML = "";
        }

        return true;
    } catch (error) {
        console.error("Erreur lors de la communication avec l'extension:", error);
        setStatusMessage(backgroundActiveStatus, "Erreur de communication", "error");
        return false;
    }
}

// Fonction pour récupérer le background actif
async function getActiveBackground() {
    try {
        const { activeBackground } = await chrome.storage.local.get(['activeBackground']);

        if (activeBackground) {
            return activeBackground;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Erreur lors de la communication avec l'extension:", error);
        return null;
    }
}

// Fonction pour mettre à jour la liste des backgrounds dans le select
async function updateBackgroundSelect() {
    const storedBackgrounds = await listStoredBackgrounds();
    const activeBackground = await getActiveBackground();

    // Vider le select
    backgroundSelect.innerHTML = '<option value="">No background selected</option>';

    // Ajouter les backgrounds
    storedBackgrounds.forEach(fileName => {
        const option = document.createElement('option');
        option.value = fileName;
        option.textContent = fileName;
        backgroundSelect.appendChild(option);
    });

    // Mettre à jour le statut et la prévisualisation
    if (activeBackground) {
        backgroundSelect.value = activeBackground;
        setStatusMessage(backgroundActiveStatus, `Active background: ${activeBackground}`, "success");

        // Charger la prévisualisation
        const dataUrl = await getStoredBackground(activeBackground);
        if (dataUrl) {
            // backgroundPreview.innerHTML = `<img src="${dataUrl}" alt="Preview du background actif">`;
        }
    } else {
        setStatusMessage(backgroundActiveStatus, "No background selected", "info");
        backgroundPreview.innerHTML = "";
    }
}

// ===== GESTIONNAIRES D'ÉVÉNEMENTS =====
uploadBackgroundBtn.onclick = async () => {
    backgroundInput.click();
};
// Gestionnaire pour l'upload de backgrounds
backgroundInput.onchange = async () => {
    const files = backgroundInput.files;
    if (!files || files.length === 0) {
        setStatusMessage(backgroundStatus, "Please select at least one image file.", "error");
        return;
    }
    setStatusMessage(backgroundStatus, "Uploading backgrounds...", "info");

    let successCount = 0;
    let errorCount = 0;

    for (const file of files) {
        // Vérifier que c'est bien une image
        if (!file.type.startsWith('image/')) {
            console.warn(`Fichier ignoré (pas une image): ${file.name}`);
            errorCount++;
            continue;
        }

        try {
            const reader = new FileReader();
            const fileData = await new Promise((resolve, reject) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const response = await chrome.runtime.sendMessage({
                action: 'storeBackground',
                fileName: file.name,
                fileData: fileData
            });

            if (response.success) {
                successCount++;
            } else {
                console.error(`Erreur pour ${file.name}:`, response.error);
                errorCount++;
            }
        } catch (error) {
            console.error(`Erreur lors du traitement de ${file.name}:`, error);
            errorCount++;
        }
    }

    // Afficher le résultat
    if (errorCount === 0) {
        setStatusMessage(backgroundStatus, `${successCount} background(s) uploadé(s) avec succès.`, "success");
    } else {
        setStatusMessage(backgroundStatus, `${successCount} succès, ${errorCount} erreur(s).`, "error");
    }

    // Mettre à jour la liste des backgrounds
    await updateBackgroundSelect();

    // Vider l'input
    backgroundInput.value = '';
};

// Gestionnaire pour le changement de sélection de caméra
cameraSelect.onchange = async () => {
    const selectedCamera = cameraSelect.value;
    await setActiveCamera(selectedCamera);
};

// Gestionnaire pour le changement de sélection de background
backgroundSelect.onchange = async () => {
    const selectedBackground = backgroundSelect.value;
    await setActiveBackground(selectedBackground);
};

// Charger la liste des caméras au démarrage de la popup
document.addEventListener('DOMContentLoaded', async () => {
    // Initialiser le select d'avatar
    await updateAvatarSelect();

    // Initialiser le select de caméra
    await updateCameraSelect();
});