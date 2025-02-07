import sdk, { EventListenerRegister, HumiditySensor, ObjectsDetected, ScryptedDeviceBase, ScryptedInterface, Setting, Thermometer } from "@scrypted/sdk";
import { StorageSettings } from "@scrypted/sdk/storage-settings";

export const deviceFilter = `['${ScryptedInterface.Thermometer}','${ScryptedInterface.HumiditySensor}'].some(elem => interfaces.includes(elem))`;
export const pluginEnabledFilter = `interfaces.includes('${ScryptedInterface.VideoTextOverlays}')`;
export const osdManagerPrefix = 'osdManager';

export type SupportedDevice = ScryptedDeviceBase & (Thermometer | HumiditySensor);
export enum OverlayType {
    Text = 'Text',
    Device = 'Device',
    FaceDetection = 'FaceDetection',
}

interface Overlay {
    text: string;
    type: OverlayType;
    device: string;
    regex: string;
    maxDecimals: number;
}

export enum ListenerType {
    Face = 'Face',
    Humidity = 'Humidity',
    Temperature = 'Temperature',
}

export type ListenersMap = Record<string, { listenerType: ListenerType, listener: EventListenerRegister, device?: string }>;

export type OnUpdateOverlayFn = (props: {
    overlayId: string,
    listenerType: ListenerType,
    listenInterface?: ScryptedInterface,
    data: any,
    device?: ScryptedDeviceBase,
    noLog?: boolean,
}) => Promise<void>

export const getOverlayKeys = (overlayId: string) => {
    const textKey = `overlay:${overlayId}:text`;
    const typeKey = `overlay:${overlayId}:type`;
    const regexKey = `overlay:${overlayId}:regex`;
    const deviceKey = `overlay:${overlayId}:device`;
    const maxDecimalsKey = `overlay:${overlayId}:maxDecimals`;

    return {
        textKey,
        typeKey,
        regexKey,
        deviceKey,
        maxDecimalsKey,
    }
}

export const getOverlaySettings = (props: {
    storage: StorageSettings<any>,
    overlayIds: string[]
}) => {
    const { storage, overlayIds } = props;
    const settings: Setting[] = [];

    for (const overlayId of overlayIds) {
        const overlayName = `Overlay ${overlayId}`;

        const { deviceKey, typeKey, regexKey, textKey, maxDecimalsKey } = getOverlayKeys(overlayId);

        const type = storage.getItem(typeKey) ?? OverlayType.Text;

        settings.push(
            {
                key: typeKey,
                title: 'Overlay type',
                type: 'string',
                choices: [OverlayType.Text, OverlayType.Device, OverlayType.FaceDetection],
                subgroup: overlayName,
                value: type,
                immediate: true,
            }
        );

        if (type === OverlayType.Text) {
            settings.push({
                key: textKey,
                title: 'Text',
                type: 'string',
                subgroup: overlayName,
                value: storage.getItem(textKey),
            })
        };

        const regexSetting: Setting = {
            key: regexKey,
            title: 'Value regex',
            description: 'Expression to generate the text. ${value} contains the value and ${unit} the unit',
            type: 'string',
            subgroup: overlayName,
            placeholder: '${value} ${unit}',
            value: storage.getItem(regexKey) || '${value} ${unit}',
        };

        if (type === OverlayType.Device) {
            settings.push(
                {
                    key: deviceKey,
                    title: 'Device',
                    type: 'device',
                    subgroup: overlayName,
                    deviceFilter,
                    immediate: true,
                    value: storage.getItem(deviceKey)
                },
                regexSetting,
                {
                    key: maxDecimalsKey,
                    title: 'Max decimals',
                    type: 'number',
                    subgroup: overlayName,
                    value: storage.getItem(maxDecimalsKey) ?? 1
                },
            );
        } else if (type === OverlayType.FaceDetection) {
            settings.push(regexSetting);
        }
    }

    return settings;
}

export const getOverlay = (props: {
    settings: Setting[],
    overlayId: string
}): Overlay => {
    const { settings, overlayId } = props;
    const settingsByKey = settings.reduce((tot, curr) => ({
        ...tot,
        [curr.key]: curr
    }), {});

    const { deviceKey, typeKey, regexKey, textKey, maxDecimalsKey } = getOverlayKeys(overlayId);

    const type = settingsByKey[`${osdManagerPrefix}:${typeKey}`]?.value ?? OverlayType.Text;
    const device = settingsByKey[`${osdManagerPrefix}:${deviceKey}`]?.value;
    const text = settingsByKey[`${osdManagerPrefix}:${textKey}`]?.value;
    const regex = settingsByKey[`${osdManagerPrefix}:${regexKey}`]?.value;
    const maxDecimals = settingsByKey[`${osdManagerPrefix}:${maxDecimalsKey}`]?.value;

    return {
        device,
        type,
        regex,
        text,
        maxDecimals
    };
}

export const listenersIntevalFn = (props: {
    overlayIds: string[],
    settings: Setting[],
    console: Console,
    id: string,
    currentListeners: ListenersMap,
    onUpdateFn: OnUpdateOverlayFn,
}) => {
    const { overlayIds, settings, console, id, currentListeners, onUpdateFn } = props;

    for (const overlayId of overlayIds) {
        const overlay = getOverlay({
            overlayId,
            settings
        });

        const overlayType = overlay.type;
        let listenerType: ListenerType;
        let listenInterface: ScryptedInterface;
        let deviceId: string;
        if (overlayType === OverlayType.Device) {
            const realDevice = sdk.systemManager.getDeviceById(overlay.device);
            if (realDevice) {
                if (realDevice.interfaces.includes(ScryptedInterface.Thermometer)) {
                    listenerType = ListenerType.Temperature;
                    listenInterface = ScryptedInterface.Thermometer;
                    deviceId = overlay.device;
                } else if (realDevice.interfaces.includes(ScryptedInterface.HumiditySensor)) {
                    listenerType = ListenerType.Humidity;
                    listenInterface = ScryptedInterface.HumiditySensor;
                    deviceId = overlay.device;
                }
            } else {
                console.log(`Device ${overlay.device} not found`);
            }
        } else if (overlayType === OverlayType.FaceDetection) {
            listenerType = ListenerType.Face;
            listenInterface = ScryptedInterface.ObjectDetection;
            deviceId = id;
        }

        const currentListener = currentListeners[overlayId];
        const currentDevice = currentListener?.device;
        const differentType = (!currentListener || currentListener.listenerType !== listenerType);
        const differentDevice = overlay.type === OverlayType.Device ? currentDevice !== overlay.device : false;
        if (listenerType) {
            if (listenInterface && deviceId && (differentType || differentDevice)) {
                const realDevice = sdk.systemManager.getDeviceById<ScryptedDeviceBase>(deviceId);
                console.log(`Overlay ${overlayId}: starting device ${realDevice.name} listener for type ${listenerType} on interface ${listenInterface}`);
                currentListener?.listener && currentListener.listener.removeListener();
                const update = async (data: any) => await onUpdateFn({
                    listenInterface,
                    overlayId,
                    data,
                    listenerType,
                    device: realDevice
                });
                const newListener = realDevice.listen(listenInterface, async (_, __, data) => {
                    await update(data);
                });

                if (listenInterface === ScryptedInterface.Thermometer) {
                    update(realDevice.temperature);
                } else if (listenInterface === ScryptedInterface.HumiditySensor) {
                    update(realDevice.humidity);
                }

                currentListeners[overlayId] = {
                    listenerType,
                    device: overlay.device,
                    listener: newListener
                };
            }
        } else if (overlayType === OverlayType.Text) {
            currentListener?.listener && currentListener.listener.removeListener();
            onUpdateFn({
                overlayId,
                listenerType,
                data: overlay.text,
                noLog: true
            });
        }
    }
}

export const parseOverlayData = (props: {
    listenerType: ListenerType,
    data: any,
    overlay: Overlay,
}) => {
    const { listenerType, data, overlay } = props;
    const { regex, text, device, maxDecimals } = overlay;
    const realDevice = device ? sdk.systemManager.getDeviceById<SupportedDevice>(device) : undefined;

    let value;
    let unit;
    let textToUpdate = text;
    if (listenerType === ListenerType.Face) {
        value = (data as ObjectsDetected)?.detections?.find(det => det.className === 'face')?.label;
    } else if (listenerType === ListenerType.Temperature) {
        value = Number(data ?? 0)?.toFixed(maxDecimals);
        unit = realDevice.temperatureUnit;
    } else if (listenerType === ListenerType.Humidity) {
        value = Number(data ?? 0)?.toFixed(maxDecimals);
        unit = '%';
    }

    if (value) {
        textToUpdate = regex
            .replace('${value}', value || '')
            .replace('${unit}', unit || '');
    }

    return textToUpdate;
}