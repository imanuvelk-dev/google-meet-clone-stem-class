/**
 * Our seam over VideoSDK.
 *
 * VideoSDK is hook-based, so the seam lives at OUR hook layer, not below it.
 * Feature components call useLocalMedia/useDevices/useParticipants and never
 * import @videosdk.live/react-sdk. ESLint enforces that. See CLAUDE.md.
 *
 * Precall and in-call are deliberately separate clients: precall runs outside
 * MeetingProvider via useMediaDevice, in-call runs inside it via useMeeting.
 * Merging them into one interface would imply a lifecycle that does not exist.
 */

/**
 * Browser permission is not a boolean.
 *
 * 'blocked' is a one-way door: once the user blocks, the browser dialog cannot
 * be re-triggered programmatically, so a Retry button is a dead end. It is a
 * distinct state from 'denied' precisely so the UI cannot conflate them.
 */
export type PermissionStatus = 'granted' | 'denied' | 'blocked' | 'prompt'

export type DeviceKind = 'camera' | 'microphone' | 'speaker'

export interface Device {
  deviceId: string
  label: string
  kind: DeviceKind
}

export interface Permissions {
  camera: PermissionStatus
  microphone: PermissionStatus
}

/** 1-5, from VideoSDK's runPreCallTest. Meet warns the user below ~3. */
export interface NetworkQuality {
  uplink: number
  downlink: number
}

/** Why a track could not be produced. Each maps to a distinct precall screen. */
export type MediaErrorReason =
  'permission-denied' | 'permission-blocked' | 'no-devices' | 'device-in-use' | 'unknown'

export class MediaError extends Error {
  // Explicit field, not a constructor parameter property: `erasableSyntaxOnly`
  // rejects the shorthand, since it emits real code rather than erasing.
  readonly reason: MediaErrorReason

  constructor(reason: MediaErrorReason, message: string) {
    super(message)
    this.name = 'MediaError'
    this.reason = reason
  }
}

export interface TrackOptions {
  deviceId?: string
}

/**
 * Precall media. Everything the green room needs, and nothing about meetings.
 */
export interface MediaClient {
  checkPermissions(): Promise<Permissions>
  /** Prompts. Resolves to the resulting status; never throws on refusal. */
  requestPermission(kind: 'camera' | 'microphone'): Promise<PermissionStatus>

  getDevices(kind: DeviceKind): Promise<Device[]>

  createCameraTrack(options?: TrackOptions): Promise<MediaStream>
  createMicrophoneTrack(options?: TrackOptions): Promise<MediaStream>

  runPreCallTest(): Promise<NetworkQuality>

  /** Hotplug. Returns an unsubscribe. */
  onDeviceChanged(listener: () => void): () => void
}
