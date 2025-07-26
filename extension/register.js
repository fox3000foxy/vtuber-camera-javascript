const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);

navigator.mediaDevices.enumerateDevices = async () => {
    const devices = await originalEnumerateDevices();

    // Ajouter la caméra virtuelle si elle n'existe pas déjà
    const hasVirtualCamera = devices.some(device => device.deviceId === "vtuber-virtual-camera");
    if (!hasVirtualCamera) {
        devices.push({
            deviceId: "vtuber-virtual-camera",
            kind: 'videoinput',
            label: "VTuber Virtual Camera",
            groupId: devices.length > 0 ? devices[0].groupId : '',
            toJSON() { return this; }
        });
    }

    return devices;
};