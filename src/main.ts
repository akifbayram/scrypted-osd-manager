import sdk, { Settings, DeviceBase, MixinProvider, ScryptedDeviceBase, ScryptedDeviceType, ScryptedInterface, WritableDeviceState, Setting, SettingValue } from "@scrypted/sdk";
import OsdManagerMixin from "./cameraMixin";
import { osdManagerPrefix } from "./utils";
import { StorageSettings } from "@scrypted/sdk/storage-settings";

export default class OsdManagerProvider extends ScryptedDeviceBase implements MixinProvider, Settings {
    storageSettings = new StorageSettings(this, {
        lockText: {
            title: 'Text to show for Locked state',
            type: 'string',
            defaultValue: 'Locked',
        },
        unlockText: {
            title: 'Text to show for Unlocked state',
            type: 'string',
            defaultValue: 'Unlocked',
        },
        openText: {
            title: 'Text to show for Open state',
            type: 'string',
            defaultValue: 'Open',
        },
        closedText: {
            title: 'Text to show for Closed state',
            type: 'string',
            defaultValue: 'Closed',
        },
    });

    public mixinsMap: Record<string, OsdManagerMixin> = {};

    constructor(nativeId: string) {
        super(nativeId);
    }

    getSettings(): Promise<Setting[]> {
        return this.storageSettings.getSettings();
    }

    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.storageSettings.putSetting(key, value);
    }

    async canMixin(type: ScryptedDeviceType, interfaces: string[]): Promise<string[]> {
        return interfaces.includes(ScryptedInterface.VideoTextOverlays) ?
            [
                ScryptedInterface.Settings,
            ] :
            undefined;
    }

    async getMixin(mixinDevice: DeviceBase, mixinDeviceInterfaces: ScryptedInterface[], mixinDeviceState: WritableDeviceState): Promise<any> {
        return new OsdManagerMixin(
            {
                mixinDevice,
                mixinDeviceInterfaces,
                mixinDeviceState,
                mixinProviderNativeId: this.nativeId,
                group: 'OSD manager',
                groupKey: osdManagerPrefix,
            },
            this);
    }

    async releaseMixin(id: string, mixinDevice: any): Promise<void> {
        await mixinDevice.release();
    }
}