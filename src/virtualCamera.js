// Virtual Camera Manager
// This module handles the virtual camera functionality by overriding MediaDevices APIs
// and includes Three.js scene management (migrated from Experience component)

import { Holistic } from "@mediapipe/holistic";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import {
    optimizeVRM,
    applyFacialExpressions,
    applyHandAnimation,
    applyBodyPose,
    applyHeadRotation,
    updateEyeLookAt,
} from "./vrmHelpers";
import { createResultsCallback } from "./recognitionHelpers";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { create } from "zustand";

export const useVideoRecognition = create((set) => ({
    videoElement: null,
    setVideoElement: (videoElement) => set({ videoElement }),
    resultsCallback: null,
    setResultsCallback: (resultsCallback) => set({ resultsCallback }),
}));

const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

class VirtualCameraManager {
    constructor() {
        this.isInitialized = false;
        this.isActive = false;

        this.virtualDeviceId = "vtuber-virtual-camera";
        this.virtualDeviceLabel = "VTuber Virtual Camera";

        // Camera processing properties
        this.videoElement = null;
        this.drawCanvas = null;
        this.holisticRef = null;
        this.mediaStreamRef = null;
        this.canvasCtxRef = null;
        this.frameRequestRef = null;
        this.isStarted = false;
        this.actualCameraId = null;

        // Three.js scene properties (migrated from Experience)
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.composer = null;
        this.canvas = null;
        this.currentVrm = null;
        this.riggedFace = { current: null };
        this.riggedPose = { current: null };
        this.riggedLeftHand = { current: null };
        this.riggedRightHand = { current: null };
        this.lookAtDestination = new THREE.Vector3(0, 0, 0);
        this.lookAtTarget = null;
        this.animationId = null;
        this.clock = new THREE.Clock();

        this.init();
    }

    // Initialize virtual camera overrides
    init() {
        if (this.isInitialized) return;

        this.initializeCameraProcessing();
        this.initializeThreeJS();

        this.setupGetUserMediaOverride();

        this.isInitialized = true;
        // Ne pas démarrer automatiquement la caméra
    }

    // Initialize Three.js scene (migrated from Experience)
    initializeThreeJS() {
        // Create canvas element for Three.js rendering
        this.canvas = document.createElement('canvas');
        this.canvas.id = "canvas";
        this.canvas.style.cssText = `
            width: 640px;
            height: 360px;
        `;
        // document.body.appendChild(this.canvas);

        // Initialize Three.js components
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLighting();
        this.setupPostProcessing();
        this.loadVRMAvatar();
        this.startRenderLoop();
    }

    // Setup Three.js scene
    setupScene() {
        this.scene = new THREE.Scene();

        // Charger le background actif depuis l'extension
        const backgroundMeta = document.querySelector('meta[name="ExtensionVirtualCameraManagerBackgroundUrl"]');
        const backgroundDataUrl = backgroundMeta?.content;

        const setBackgroundTexture = (texture) => {
            // Adapter le background comme "object-fit: cover"
            // On utilise une texture avec repeat et offset pour couvrir toute la scène
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.center.set(0.5, 0.5);
            texture.offset.set(0, 0);
            texture.repeat.set(1, 1);
            this.scene.background = texture;
        };

        if (backgroundDataUrl) {
            const loader = new THREE.TextureLoader();
            loader.load(
                backgroundDataUrl,
                (texture) => { setBackgroundTexture(texture); },
                undefined,
                (err) => {
                    console.warn('[VirtualCamera] Error loading custom background:', err);
                    this.loadDefaultBackground();
                }
            );
        } else {
            this.loadDefaultBackground();
        }
    }

    // Charger le background par défaut
    loadDefaultBackground() {
        const meta = document.querySelector('meta[name="ExtensionVirtualCameraManagerUrl"]');
        const extensionURL = meta?.content;
        if (extensionURL) {
            const loader = new THREE.TextureLoader();
            loader.load(
                `${extensionURL}background.jpg`,
                (texture) => {
                    this.scene.background = texture;
                },
                undefined,
                (err) => {
                    console.warn('[VirtualCamera] Unable to load default background:', err);
                    this.scene.background = new THREE.Color(0x333333);
                }
            );
        } else {
            this.scene.background = new THREE.Color(0x333333);
        }
    }

    // Setup camera
    setupCamera() {
        const aspect = 640 / 360;
        this.camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 1000);
        this.camera.position.set(0.25, 0.25, 2);

        // Initialize look-at target
        this.lookAtTarget = new THREE.Object3D();
        this.camera.add(this.lookAtTarget);
    }

    // Setup renderer
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });

        // Forcer la résolution à 640×360
        this.canvas.width = 640;
        this.canvas.height = 360;
        this.renderer.setSize(640, 360, false); // false pour ne pas modifier le style CSS

        this.renderer.setPixelRatio(1); // Forcer pixelRatio à 1 pour éviter les variations
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1;
    }

    // Setup lighting
    setupLighting() {
        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 2);
        directionalLight1.position.set(10, 10, 5);
        this.scene.add(directionalLight1);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight2.position.set(-10, 10, 5);
        this.scene.add(directionalLight2);
    }

    // Setup post-processing effects
    setupPostProcessing() {
        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // const bloomPass = new UnrealBloomPass(
        //     new THREE.Vector2(640, 360),
        //     0.2, // intensity
        //     0.4, // radius
        //     0.85 // threshold
        // );
        // this.composer.addPass(bloomPass);
    }

    // Load VRM avatar
    async loadVRMAvatar() {
        const loader = new GLTFLoader();
        loader.register((parser) => {
            return new VRMLoaderPlugin(parser);
        });

        try {
            const blobAvatarUrl = document.querySelector('meta[name="ExtensionVirtualCameraManagerAvatarUrl"]')?.content || `models/9194654833395403063.vrm`;
            const avatarUrl = blobAvatarUrl;
            const gltf = await loader.loadAsync(avatarUrl);
            const vrm = gltf.userData.vrm;

            if (vrm) {
                this.currentVrm = vrm;

                // Apply VRM optimization
                optimizeVRM(gltf.scene, vrm);

                // Position and rotate the avatar
                const avatarGroup = new THREE.Group();
                window.avatarGroup = avatarGroup; // Expose for debugging
                avatarGroup.position.set(0.38, -1.3, 1.35)
                avatarGroup.rotation.set(-0.3, 0.10, 0.10);

                gltf.scene.rotation.y = Math.PI;
                avatarGroup.add(gltf.scene);
                this.scene.add(avatarGroup);
            }
        } catch (error) {
            console.error('Error loading VRM avatar:', error);
        }
    }

    // Start render loop
    startRenderLoop() {
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);

            const delta = this.clock.getDelta();
            this.updateVRMAnimation(delta);

            if (this.composer) {
                this.composer.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        };
        animate();
    }

    // Update VRM animation (migrated from Experience useFrame)
    updateVRMAnimation(delta) {
        if (!this.currentVrm) return;

        if (this.videoElement) {
            // Apply facial expressions
            applyFacialExpressions(this.currentVrm, this.riggedFace.current, delta);

            // Apply head rotation
            applyHeadRotation(this.currentVrm, this.riggedFace.current, delta);

            // Update eye look-at
            updateEyeLookAt(
                this.currentVrm,
                this.riggedFace.current,
                this.lookAtTarget,
                this.lookAtDestination,
                delta
            );
        }

        // Apply body pose
        applyBodyPose(this.currentVrm, this.riggedPose.current, delta);

        // Apply hand animations
        if (this.riggedLeftHand.current) {
            applyHandAnimation(
                this.currentVrm,
                "left",
                this.riggedPose.current,
                this.riggedLeftHand.current,
                delta
            );
        }

        if (this.riggedRightHand.current) {
            applyHandAnimation(
                this.currentVrm,
                "right",
                this.riggedPose.current,
                this.riggedRightHand.current,
                delta
            );
        }

        // Update VRM
        this.currentVrm.update(delta);
    }

    // Initialize camera processing (from CameraWidget)
    initializeCameraProcessing() {
        this.createVideoElements();
        this.setupHolistic();
        // La caméra sera démarrée seulement quand getUserMedia est appelé avec notre caméra virtuelle
    }

    // Create video and canvas elements
    createVideoElements() {
        // Create video element only if it doesn't exist
        if (!this.videoElement) {
            this.videoElement = document.createElement('video');
            this.videoElement.style.cssText = `
        position: absolute;
        bottom: 96px;
        right: 16px;
        width: 320px;
        height: 240px;
        border-radius: 20px;
        transform: scaleX(-1);
        z-index: 999998;
        image-rendering: optimizeSpeed;
      `;
            this.videoElement.playsInline = true;
            this.videoElement.muted = true;
            document.body.appendChild(this.videoElement);
        }

        // Create canvas element for drawing only if it doesn't exist
        if (!this.drawCanvas) {
            this.drawCanvas = document.createElement('canvas');
            this.drawCanvas.style.cssText = `
        position: absolute;
        bottom: 96px;
        right: 16px;
        width: 320px;
        height: 240px;
        border-radius: 20px;
        background: rgba(0, 0, 0, 0.5);
        transform: scaleX(-1);
        z-index: 999999;
        image-rendering: optimizeSpeed;
      `;
            document.body.appendChild(this.drawCanvas);
        }

        // Rendre les éléments visibles lors de la création/réutilisation
        this.videoElement.style.visibility = 'hidden';
        this.drawCanvas.style.visibility = 'hidden';
    }

    // Setup Holistic MediaPipe
    setupHolistic() {
        this.holisticRef = new Holistic({
            locateFile: (file) => {
                const meta = document.querySelector('meta[name="ExtensionVirtualCameraManagerUrl"]');
                const extensionURL = meta?.content;
                return `${extensionURL || ""}holistic/${file}`;
            },
        });

        this.holisticRef.setOptions({
            modelComplexity: 0,
            smoothLandmarks: false,
            enableSegmentation: false,
            smoothSegmentation: false,
            minDetectionConfidence: 0.8,
            minTrackingConfidence: 0.8,
            refineFaceLandmarks: true,
            enableFaceGeometry: false,
        });

        this.holisticRef.onResults((results) => {
            const resultsCallback = useVideoRecognition.getState().resultsCallback;
            if (resultsCallback) {
                resultsCallback(results);
            }
        });
    }

    // Start camera processing
    startCameraProcessing() {
        if (this.isStarted) return;
        this.isStarted = true;

        // Recréer les éléments vidéo et canvas s'ils n'existent pas
        if (!this.videoElement || !this.drawCanvas) {
            this.createVideoElements();
        }

        // Set video element in the store
        useVideoRecognition.getState().setVideoElement(this.videoElement);

        // Setup recognition results callback
        const resultsCallback = createResultsCallback(
            this.videoElement,
            this.riggedFace,
            this.riggedPose,
            this.riggedLeftHand,
            this.riggedRightHand
        );
        useVideoRecognition.getState().setResultsCallback(resultsCallback);

        // Récupérer la caméra active sélectionnée dans l'extension
        const activeCameraMeta = document.querySelector('meta[name="ExtensionVirtualCameraManagerActiveCamera"]');
        const activeCamera = activeCameraMeta?.content;

        // active camera is the name of the camera device
        // we have to find the deviceId from the available devices
        navigator.mediaDevices.enumerateDevices().then((devices) => {
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            const targetDevice = videoDevices.find(d => d.label === activeCamera || d.deviceId === activeCamera);

            // Démarrer avec la caméra active ou la première disponible
            this.startCamera(targetDevice?.deviceId || null);
        }).catch((error) => {
            console.error('[VirtualCamera] Error enumerating devices:', error);
            // Démarrer avec la première caméra disponible si aucune caméra active n'est définie
            this.startCamera();
        });
    }

    // Start camera stream
    async startCamera(deviceId = null) {
        try {
            // Stop existing stream if any
            if (this.mediaStreamRef) {
                this.mediaStreamRef.getTracks().forEach(track => track.stop());
                this.mediaStreamRef = null;
            }

            // Cancel existing frame processing
            if (this.frameRequestRef && this.videoElement) {
                try {
                    this.videoElement.cancelVideoFrameCallback?.(this.frameRequestRef);
                } catch (e) {
                    console.warn('[VirtualCamera] cancelVideoFrameCallback not supported');
                }
                this.frameRequestRef = null;
            }

            const devices = await originalEnumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');

            let targetDevice = deviceId;
            if (!targetDevice && videoDevices.length > 0) {
                targetDevice = videoDevices[0].deviceId;
            }

            const stream = await originalGetUserMedia({
                video: {
                    deviceId: targetDevice ? { exact: targetDevice } : undefined,
                    width: 640,
                    height: 360
                },
                audio: false
            });


            this.mediaStreamRef = stream;

            if (this.videoElement) {
                this.videoElement.srcObject = stream;

                this.videoElement.onloadedmetadata = () => {
                    if (this.videoElement) {
                        this.videoElement.play();
                        // Only start frame processing if Holistic is ready and we haven't started yet
                        if (this.holisticRef && !this.frameRequestRef) {
                            this.startFrameProcessing();
                        }
                    }
                };
            }
        } catch (error) {
            console.error('[VirtualCamera] Error accessing camera:', error);
        }
    }

    // Start frame processing
    startFrameProcessing() {
        if (!this.videoElement || !this.holisticRef) return;

        let SKIPPED_FPS = 3;
        let frameCount = 0;
        let isProcessing = false;
        let lastProcessTime = 0;
        const fps = 1000 * 0.06; // 16ms par frame (~60 FPS)

        const frameProcessing = async (now, metadata) => {
            if (isProcessing) {
                this.frameRequestRef = this.videoElement?.requestVideoFrameCallback(frameProcessing);
                return;
            }

            if (frameCount % SKIPPED_FPS === 0) {
                const currentTime = performance.now();
                if (currentTime - lastProcessTime >= fps) {
                    try {
                        if (this.isActive) {
                            await this.holisticRef.send({ image: this.videoElement });
                        }
                    } catch (error) {
                        console.error('[VirtualCamera] Error processing frame:', error);
                    }
                    lastProcessTime = currentTime;
                }
            }
            frameCount++;

            // Re-register for next frame
            this.frameRequestRef = this.videoElement?.requestVideoFrameCallback(frameProcessing);
        };

        // Start the frame processing loop
        this.frameRequestRef = this.videoElement.requestVideoFrameCallback(frameProcessing);
    }

    // Change camera device
    changeCameraDevice(deviceId) {
        if (this.actualCameraId === deviceId) return;

        this.actualCameraId = deviceId;

        // Start new camera stream (this will handle stopping the existing one)
        this.startCamera(deviceId);
    }

    // Stop camera processing
    stopCameraProcessing() {
        if (!this.isStarted) return;

        this.isStarted = false;
        this.isActive = false; // Marquer la caméra virtuelle comme inactive

        // Set video element to null in store
        useVideoRecognition.getState().setVideoElement(null);

        // Stop media stream (caméra de référence)
        if (this.mediaStreamRef) {
            this.mediaStreamRef.getTracks().forEach(track => track.stop());
            this.mediaStreamRef = null;
        }

        // Cancel frame processing
        if (this.frameRequestRef && this.videoElement) {
            try {
                this.videoElement.cancelVideoFrameCallback?.(this.frameRequestRef);
            } catch (e) {
                console.warn('[VirtualCamera] cancelVideoFrameCallback not supported');
            }
            this.frameRequestRef = null;
        }

        // Reset canvas context cache but don't destroy Holistic
        this.canvasCtxRef = null;

        // Au lieu de supprimer les éléments, les vider et les cacher pour pouvoir les réutiliser
        if (this.videoElement) {
            this.videoElement.srcObject = null;
            this.videoElement.style.visibility = 'hidden';
        }
        if (this.drawCanvas) {
            this.drawCanvas.style.visibility = 'hidden';
        }
    }

    // Override getUserMedia to handle virtual camera
    setupGetUserMediaOverride() {
        navigator.mediaDevices.getUserMedia = async (constraints) => {
            if (!this.isInitialized) {
                console.warn('[VirtualCamera] Virtual Camera Manager not initialized');
                return originalGetUserMedia(constraints);
            }

            let deviceId = null;
            if (constraints?.video && typeof constraints.video === 'object' && constraints.video.deviceId) {
                if (typeof constraints.video.deviceId === 'string') {
                    deviceId = constraints.video.deviceId;
                } else if (constraints.video.deviceId?.exact) {
                    deviceId = constraints.video.deviceId.exact;
                } else if (Array.isArray(constraints.video.deviceId)) {
                    deviceId = constraints.video.deviceId.find(id => id === this.virtualDeviceId);
                }
            }

            if (deviceId === this.virtualDeviceId) {
                return this.getVirtualCameraStream();
            }

            // Si une autre caméra est demandée et que la caméra virtuelle était active, l'arrêter
            if (this.isActive) {
                this.stopProcessing();
            }

            // Sinon, utiliser la caméra normale
            return originalGetUserMedia(constraints);
        };
    }

    // Get virtual camera stream from canvas
    getVirtualCameraStream() {
        // Notify that virtual camera is being used
        this.isActive = true;

        // Démarrer le traitement de la caméra seulement maintenant
        if (!this.isStarted) {
            this.startCameraProcessing();
        }

        if (!this.canvas) {
            throw new Error("Canvas element not found for virtual camera");
        }

        // S'assurer que le canvas a la bonne taille avant de capturer le stream
        this.canvas.width = 640;
        this.canvas.height = 360;
        this.renderer.setSize(640, 360, false); // false pour ne pas modifier le style CSS

        // Capturer le stream avec la résolution explicite
        const stream = this.canvas.captureStream(30);

        // Écouter la fermeture du stream pour arrêter automatiquement la caméra de référence
        this.setupStreamCloseListener(stream);

        return stream;
    }

    // Setup listener for when virtual camera stream is closed
    setupStreamCloseListener(stream) {
        const tracks = stream.getTracks();

        tracks.forEach(track => {
            track.addEventListener('ended', () => {
                this.stopProcessing();
            });
        });

        // Vérifier périodiquement si le stream est encore actif
        const checkStreamActive = () => {
            const activeTracks = stream.getTracks().filter(track => track.readyState === 'live');

            if (activeTracks.length === 0 && this.isActive) {
                this.stopProcessing();
                return;
            }

            if (this.isActive) {
                requestAnimationFrame(checkStreamActive);
            }
        };

        // Démarrer la vérification après un délai
        setTimeout(checkStreamActive, 1000);
    }

    // Restore original MediaDevices methods
    destroy() {
        if (!this.isInitialized) return;

        // Stop camera processing first
        this.stopCameraProcessing();

        // Stop Three.js rendering
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Cleanup Three.js resources
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }

        if (this.composer) {
            this.composer.dispose();
            this.composer = null;
        }

        if (this.canvas) {
            this.canvas.remove();
            this.canvas = null;
        }

        // Cleanup VRM
        if (this.currentVrm) {
            this.currentVrm.dispose();
            this.currentVrm = null;
        }

        // Supprimer définitivement les éléments vidéo lors de la destruction
        if (this.videoElement) {
            this.videoElement.remove();
            this.videoElement = null;
        }
        if (this.drawCanvas) {
            this.drawCanvas.remove();
            this.drawCanvas = null;
        }

        navigator.mediaDevices.getUserMedia = originalGetUserMedia;
        navigator.mediaDevices.enumerateDevices = originalEnumerateDevices;
        this.isInitialized = false;
    }

    // Check if a device ID is the virtual camera
    isVirtualCamera(deviceId) {
        return deviceId === this.virtualDeviceId;
    }

    // Get virtual camera device info
    getVirtualCameraInfo() {
        return {
            deviceId: this.virtualDeviceId,
            kind: 'videoinput',
            label: this.virtualDeviceLabel,
            groupId: '',
            toJSON() { return this; }
        };
    }

    // Public method to start camera processing
    startProcessing() {
        if (!this.isInitialized) {
            console.warn('[VirtualCamera] Virtual Camera Manager not initialized');
            return;
        }
        // Démarrer manuellement le traitement de la caméra si nécessaire
        if (!this.isStarted) {
            this.startCameraProcessing();
        }
    }

    // Public method to stop camera processing
    stopProcessing() {
        this.stopCameraProcessing();
    }
}

// Create singleton instance
// const virtualCameraManager = new VirtualCameraManager();

export default VirtualCameraManager;
