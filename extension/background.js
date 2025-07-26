// Background script pour gérer le stockage des fichiers VRM

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('vrmDB', 1);
        request.onupgradeneeded = function (event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('files')) {
                db.createObjectStore('files');
            }
        };
        request.onsuccess = function (event) {
            resolve(event.target.result);
        };
        request.onerror = function (event) {
            reject(event.target.error);
        };
    });
}

function storeFile(db, key, arrayBuffer) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['files'], 'readwrite');
        const store = transaction.objectStore('files');
        const request = store.put(arrayBuffer, key);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

function getFile(db, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['files'], 'readonly');
        const store = transaction.objectStore('files');
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

function listFiles(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['files'], 'readonly');
        const store = transaction.objectStore('files');
        const request = store.getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

// Gestionnaire des messages provenant de la popup ou des content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'storeVrmFile') {
        // fileData est un bloblink, donc on le convertit en ArrayBuffer
        fetch(message.fileData)
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => {
                handleStoreVrmFile(message.fileName, arrayBuffer)
                    .then(result => sendResponse(result))
                    .catch(error => sendResponse({ success: false, error: error.message }));
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Indique que la réponse sera asynchrone
    }

    if (message.action === 'getVrmFile') {
        handleGetVrmFile(message.fileName)
            .then(result => {
                if (result.success && result.fileData) {
                    const fileReader = new FileReader();
                    fileReader.onload = () => {
                        // fileReader.result is a data URL
                        sendResponse({ success: true, fileName: message.fileName, dataUrl: fileReader.result });
                    };
                    fileReader.onerror = () => {
                        sendResponse({ success: false, error: "Erreur lors de la conversion en DataURL" });
                    };
                    // Convert ArrayBuffer or Blob to DataURL
                    if (result.fileData instanceof Blob) {
                        fileReader.readAsDataURL(result.fileData);
                    } else {
                        // If it's ArrayBuffer, convert to Blob first
                        const blob = new Blob([result.fileData], { type: 'application/octet-stream' });
                        fileReader.readAsDataURL(blob);
                    }
                } else {
                    sendResponse(result);
                }
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.action === 'listVrmFiles') {
        handleListVrmFiles()
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.action === 'setActiveAvatar') {
        handleSetActiveAvatar(message.fileName)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.action === 'listCameras') {
        handleListCameras()
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    // GESTION DES BACKGROUNDS
    if (message.action === 'storeBackground') {
        handleStoreBackground(message.fileName, message.fileData)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.action === 'getBackground') {
        handleGetBackground(message.fileName)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.action === 'listBackgrounds') {
        handleListBackgrounds()
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

async function handleStoreVrmFile(fileName, fileData) {
    try {
        const db = await openDB();
        await storeFile(db, fileName, fileData);
        return { success: true, message: "Fichier stocké avec succès" };
    } catch (error) {
        console.error("Erreur lors du stockage du fichier VRM:", error);
        throw error;
    }
}

async function handleGetVrmFile(fileName) {
    try {
        const db = await openDB();
        const fileData = await getFile(db, fileName);
        if (fileData) {
            return { success: true, fileData: fileData };
        } else {
            return { success: false, error: "Fichier non trouvé" };
        }
    } catch (error) {
        console.error("Erreur lors de la récupération du fichier VRM:", error);
        throw error;
    }
}

async function handleListVrmFiles() {
    try {
        const db = await openDB();
        const fileNames = await listFiles(db);
        return { success: true, files: fileNames };
    } catch (error) {
        console.error("Erreur lors de la liste des fichiers VRM:", error);
        throw error;
    }
}

// ===== GESTION DES BACKGROUNDS =====

async function handleStoreBackground(fileName, fileData) {
    try {
        const db = await openDB();
        
        // Créer une clé unique pour les backgrounds
        const backgroundKey = `background_${fileName}`;
        
        // Convertir le DataURL en ArrayBuffer pour le stockage
        const response = await fetch(fileData);
        const arrayBuffer = await response.arrayBuffer();
        
        await storeFile(db, backgroundKey, arrayBuffer);
        return { success: true, message: "Background stocké avec succès" };
    } catch (error) {
        console.error("Erreur lors du stockage du background:", error);
        throw error;
    }
}

async function handleGetBackground(fileName) {
    try {
        const db = await openDB();
        const backgroundKey = `background_${fileName}`;
        const fileData = await getFile(db, backgroundKey);
        
        if (fileData) {
            // Convertir l'ArrayBuffer en DataURL
            const blob = new Blob([fileData], { type: 'image/*' });
            const reader = new FileReader();
            
            return new Promise((resolve, reject) => {
                reader.onload = () => {
                    resolve({ success: true, dataUrl: reader.result });
                };
                reader.onerror = () => {
                    reject(new Error("Erreur lors de la conversion en DataURL"));
                };
                reader.readAsDataURL(blob);
            });
        } else {
            return { success: false, error: "Background non trouvé" };
        }
    } catch (error) {
        console.error("Erreur lors de la récupération du background:", error);
        throw error;
    }
}

async function handleListBackgrounds() {
    try {
        const db = await openDB();
        const allKeys = await listFiles(db);
        
        // Filtrer les clés qui commencent par "background_"
        const backgroundKeys = allKeys.filter(key => key.startsWith('background_'));
        
        // Retirer le préfixe "background_" pour obtenir les noms de fichiers
        const backgroundFiles = backgroundKeys.map(key => key.replace('background_', ''));
        
        return { success: true, backgrounds: backgroundFiles };
    } catch (error) {
        console.error("Erreur lors de la liste des backgrounds:", error);
        throw error;
    }
}

async function handleSetActiveBackground(fileName) {
    try {
        await chrome.storage.local.set({ activeBackground: fileName });
        console.log("Background actif défini:", fileName);
        return { success: true, message: "Background actif défini avec succès" };
    } catch (error) {
        console.error("Erreur lors de la définition du background actif:", error);
        throw error;
    }
}