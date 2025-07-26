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

async function getActiveBackground() {
    try {
        const { activeBackground } = await chrome.storage.local.get(['activeBackground']);

        if (activeBackground) {
            return activeBackground;
        } else {;
            return null;
        }
    } catch (error) {
        console.error("Erreur lors de la communication avec l'extension:", error);
        return null;
    }
}

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

async function getStoredDevices() {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getStoredDevices'
        });

        if (response.success) {
            return response;
        } else {
            console.error("Erreur lors de la récupération des dispositifs:", response.error);
            return null;
        }
    } catch (error) {
        console.error("Erreur lors de la communication avec l'extension:", error);
        return null;
    }
}

navigator.mediaDevices.enumerateDevices().then(devices => {
    if (devices.some(device => device.deviceId)) {
        chrome.storage.local.set({ devices: JSON.stringify(devices) });
    } else {
        console.warn("Aucun dispositif vidéo trouvé.");
    }
}).catch(error => {
    console.error("Erreur lors de l'énumération des dispositifs:", error);
});

if (chrome && chrome.runtime) {
    const urlScript = document.createElement('meta');
    urlScript.name = "ExtensionVirtualCameraManagerUrl";
    urlScript.content = chrome.runtime.getURL('app.js').split('app.js')[0];
    (document.head || document.documentElement).appendChild(urlScript);

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('app.js');

    const register = document.createElement('script');
    register.src = chrome.runtime.getURL('register.js');

    (document.head || document.documentElement).appendChild(register);
    (document.head || document.documentElement).appendChild(script);

    const worker = document.createElement('script');
    worker.src = chrome.runtime.getURL('worker.js');
    script.onload = async () => {
        console.log('[VirtualCamera] Script principal chargé');

        // Récupérer toutes les données de configuration
        const activeAvatar = await getActiveAvatar();
        const activeCamera = await getActiveCamera();
        const activeBackground = await getActiveBackground();

        // Passer la caméra active à l'application
        if (activeCamera) {
            const cameraLink = document.createElement('meta');
            cameraLink.name = "ExtensionVirtualCameraManagerActiveCamera";
            cameraLink.content = activeCamera;
            (document.head || document.documentElement).appendChild(cameraLink);
        }

        // Passer le background actif à l'application
        if (activeBackground) {
            const backgroundDataUrl = await getStoredBackground(activeBackground);
            if (backgroundDataUrl) {
                const backgroundLink = document.createElement('meta');
                backgroundLink.name = "ExtensionVirtualCameraManagerBackgroundUrl";
                backgroundLink.content = backgroundDataUrl;
                (document.head || document.documentElement).appendChild(backgroundLink);
            }
        }

        // Ensure the worker script is loaded after the main script
        if (activeAvatar) {
            getStoredFile(activeAvatar) // Récupérer le premier fichier pour démonstration
                .then(fileData => {
                    if (fileData) {
                        const blob = new Blob([fileData], { type: 'application/octet-stream' });
                        const url = URL.createObjectURL(blob);
                        const avatarLink = document.createElement('meta');
                        avatarLink.name = "ExtensionVirtualCameraManagerAvatarUrl";
                        avatarLink.content = url;
                        (document.head || document.documentElement).appendChild(avatarLink);
                        (document.head || document.documentElement).appendChild(worker);
                    } else {
                        console.error("Le fichier n'a pas pu être récupéré.");
                    }
                })
        } else {
            // Même si pas d'avatar, on charge le worker pour permettre la caméra virtuelle
            (document.head || document.documentElement).appendChild(worker);
        }
    };
}