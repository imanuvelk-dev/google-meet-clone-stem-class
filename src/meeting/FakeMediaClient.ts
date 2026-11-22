import { createSilentStream } from './fakeMedia.ts'
import {
  MediaError,
  type Device,
  type DeviceKind,
  type MediaClient,
  type NetworkQuality,
  type Permissions,
  type PermissionStatus,
  type TrackOptions,
} from './MeetingClient.ts'

/**
 * Deterministic MediaClient for tests and for driving the UI with no network,
 * no camera, and no VideoSDK minutes.
 *
 * Precall is mostly error states, and every one of them is hostile to reproduce
 * against a real browser: you cannot unplug a webcam from a test, and you
 * certainly cannot un-block a permission. So they are constructor scenarios.
 */

const DEFAULT_DEVICES: Device[] = [
  { deviceId: 'cam-1', label: 'FaceTime HD Camera', kind: 'camera' },
  { deviceId: 'cam-2', label: 'HD Pro Webcam C920', kind: 'camera' },
  { deviceId: 'mic-1', label: 'MacBook Pro Microphone', kind: 'microphone' },
  { deviceId: 'mic-2', label: 'Yeti Stereo Microphone', kind: 'microphone' },
  { deviceId: 'speaker-1', label: 'MacBook Pro Speakers', kind: 'speaker' },
]

export interface FakeMediaScenario {
  permissions?: Permissions
  devices?: Device[]
  cameraInUse?: boolean
  microphoneInUse?: boolean
  network?: NetworkQuality
}

export class FakeMediaClient implements MediaClient {
  private permissions: Permissions
  private devices: Device[]
  private readonly cameraInUse: boolean
  private readonly microphoneInUse: boolean
  private readonly network: NetworkQuality
  private readonly listeners = new Set<() => void>()

  /** Exposed so tests can assert the device picker actually selected something. */
  lastCameraDeviceId: string | undefined
  lastMicrophoneDeviceId: string | undefined

  constructor(scenario: FakeMediaScenario = {}) {
    this.permissions = scenario.permissions ?? { camera: 'granted', microphone: 'granted' }
    this.devices = scenario.devices ?? [...DEFAULT_DEVICES]
    this.cameraInUse = scenario.cameraInUse ?? false
    this.microphoneInUse = scenario.microphoneInUse ?? false
    this.network = scenario.network ?? { uplink: 5, downlink: 5 }
  }

  checkPermissions(): Promise<Permissions> {
    return Promise.resolve({ ...this.permissions })
  }

  requestPermission(kind: 'camera' | 'microphone'): Promise<PermissionStatus> {
    // Blocked is a one-way door: the browser will not show the dialog again, so
    // the fake must not pretend otherwise.
    if (this.permissions[kind] === 'blocked') return Promise.resolve('blocked')

    this.permissions = { ...this.permissions, [kind]: 'granted' }
    return Promise.resolve('granted')
  }

  getDevices(kind: DeviceKind): Promise<Device[]> {
    return Promise.resolve(this.devices.filter((device) => device.kind === kind))
  }

  async createCameraTrack(options?: TrackOptions): Promise<MediaStream> {
    this.assertUsable('camera', this.cameraInUse)
    this.lastCameraDeviceId = options?.deviceId ?? (await this.firstDeviceId('camera'))
    return createSilentStream('video')
  }

  async createMicrophoneTrack(options?: TrackOptions): Promise<MediaStream> {
    this.assertUsable('microphone', this.microphoneInUse)
    this.lastMicrophoneDeviceId = options?.deviceId ?? (await this.firstDeviceId('microphone'))
    return createSilentStream('audio')
  }

  runPreCallTest(): Promise<NetworkQuality> {
    return Promise.resolve({ ...this.network })
  }

  onDeviceChanged(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Test hook: hotplug. Pass the new full device list. */
  simulateDeviceChange(devices: Device[]): void {
    this.devices = devices
    for (const listener of this.listeners) listener()
  }

  private assertUsable(kind: 'camera' | 'microphone', inUse: boolean): void {
    const status = this.permissions[kind]
    if (status === 'blocked') {
      throw new MediaError('permission-blocked', `${kind} is blocked in browser settings`)
    }
    if (status === 'denied' || status === 'prompt') {
      throw new MediaError('permission-denied', `${kind} permission has not been granted`)
    }
    if (!this.devices.some((device) => device.kind === kind)) {
      throw new MediaError('no-devices', `no ${kind} found`)
    }
    if (inUse) {
      throw new MediaError('device-in-use', `${kind} is in use by another application`)
    }
  }

  private async firstDeviceId(kind: DeviceKind): Promise<string | undefined> {
    const devices = await this.getDevices(kind)
    return devices[0]?.deviceId
  }
}
