import {
  createCameraVideoTrack,
  createMicrophoneAudioTrack,
  runPreCallTest,
} from '@videosdk.live/react-sdk'
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
 * The real MediaClient.
 *
 * Deliberately built on standard browser APIs plus VideoSDK's non-hook exports
 * (createCameraVideoTrack / createMicrophoneAudioTrack), rather than on
 * useMediaDevice. Two reasons:
 *
 * 1. useMediaDevice is a hook, and a hook cannot implement an interface. Our
 *    seam would have to become a component, which spreads VideoSDK further, not
 *    less.
 * 2. useMediaDevice's checkPermissions returns Map<string, boolean>. A boolean
 *    cannot express 'blocked' vs 'denied', and that distinction is the entire
 *    basis of precall's recovery UI. The browser Permissions API can.
 *
 * The genuinely VideoSDK-specific parts are track creation (whose tracks get
 * handed to MeetingProvider as customCameraVideoTrack, so the camera does not
 * flicker off entering the call) and runPreCallTest.
 */

const KIND_TO_INPUT: Record<DeviceKind, MediaDeviceKind> = {
  camera: 'videoinput',
  microphone: 'audioinput',
  speaker: 'audiooutput',
}

const KIND_TO_PERMISSION: Record<'camera' | 'microphone', PermissionName> = {
  camera: 'camera',
  microphone: 'microphone',
}

export class VideoSdkMediaClient implements MediaClient {
  async checkPermissions(): Promise<Permissions> {
    const [camera, microphone] = await Promise.all([
      this.queryPermission('camera'),
      this.queryPermission('microphone'),
    ])
    return { camera, microphone }
  }

  /**
   * The Permissions API reports a persistent block as 'denied'. A user who has
   * merely never been asked is 'prompt'. We surface the persistent case as
   * 'blocked', because that is the one the browser will not let us re-prompt.
   */
  private async queryPermission(kind: 'camera' | 'microphone'): Promise<PermissionStatus> {
    if (!navigator.permissions?.query) return 'prompt'
    try {
      const result = await navigator.permissions.query({ name: KIND_TO_PERMISSION[kind] })
      if (result.state === 'granted') return 'granted'
      if (result.state === 'denied') return 'blocked'
      return 'prompt'
    } catch {
      // Firefox has historically not supported querying camera/microphone.
      // Unknown is closer to 'prompt' than to a hard failure.
      return 'prompt'
    }
  }

  async requestPermission(kind: 'camera' | 'microphone'): Promise<PermissionStatus> {
    // Once blocked, getUserMedia rejects instantly without showing a dialog.
    // Calling it anyway would be harmless but dishonest: the UI must know that
    // nothing will be prompted.
    if ((await this.queryPermission(kind)) === 'blocked') return 'blocked'

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'camera' ? { video: true } : { audio: true },
      )
      // We only wanted the grant, not the stream. Leaving it live would hold the
      // camera light on through the whole precall.
      for (const track of stream.getTracks()) track.stop()
      return 'granted'
    } catch {
      // getUserMedia's NotAllowedError covers both "clicked block" and
      // "dismissed the dialog", and cannot tell them apart. Re-querying the
      // Permissions API can: a persistent block now reads as 'denied' there.
      return this.queryPermission(kind)
    }
  }

  async getDevices(kind: DeviceKind): Promise<Device[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((device) => device.kind === KIND_TO_INPUT[kind])
      .map((device, index) => ({
        deviceId: device.deviceId,
        // Labels are empty until permission is granted. A bare index is more
        // honest than an empty row in the picker.
        label: device.label || `${labelFor(kind)} ${index + 1}`,
        kind,
      }))
  }

  async createCameraTrack(options?: TrackOptions): Promise<MediaStream> {
    const baseConfig = {
      ...(options?.deviceId ? { cameraId: options.deviceId } : {}),
      optimizationMode: 'motion' as const,
      multiStream: false,
    }

    try {
      return await createCameraVideoTrack({
        ...baseConfig,
        encoderConfig: 'h720p_w1280p',
      })
    } catch {
      try {
        return await createCameraVideoTrack({
          ...baseConfig,
          encoderConfig: 'h540p_w960p',
        })
      } catch {
        try {
          return await createCameraVideoTrack(baseConfig)
        } catch (error) {
          throw toMediaError(error, 'camera')
        }
      }
    }
  }

  async createMicrophoneTrack(options?: TrackOptions): Promise<MediaStream> {
    try {
      return await createMicrophoneAudioTrack({
        ...(options?.deviceId ? { microphoneId: options.deviceId } : {}),
      })
    } catch (error) {
      throw toMediaError(error, 'microphone')
    }
  }

  /**
   * VideoSDK types `network` as bare `object`, so the documented 1-5 uplink and
   * downlink scores are not verifiable at compile time. We read defensively and
   * fall back to a neutral score rather than showing a false network warning.
   *
   * Needs a VideoSDK token, which is why precall fetches one before testing.
   */
  async runPreCallTest(): Promise<NetworkQuality> {
    const token = await this.fetchToken()

    const result = (await runPreCallTest({ token, samplingDuration: 5 })) as {
      network?: { score?: { uplink?: number; downlink?: number } }
    }

    const score = result.network?.score
    return {
      uplink: typeof score?.uplink === 'number' ? score.uplink : 5,
      downlink: typeof score?.downlink === 'number' ? score.downlink : 5,
    }
  }

  private async fetchToken(): Promise<string> {
    const response = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'precall-network-test' }),
    })
    if (!response.ok) throw new Error('Could not fetch a token for the network test')
    const { token } = (await response.json()) as { token: string }
    return token
  }

  onDeviceChanged(listener: () => void): () => void {
    navigator.mediaDevices.addEventListener('devicechange', listener)
    return () => navigator.mediaDevices.removeEventListener('devicechange', listener)
  }
}

const labelFor = (kind: DeviceKind) =>
  kind === 'camera' ? 'Camera' : kind === 'microphone' ? 'Microphone' : 'Speaker'

/** Maps the browser's getUserMedia errors onto our precall screens. */
function toMediaError(error: unknown, kind: 'camera' | 'microphone'): MediaError {
  if (!(error instanceof Error)) return new MediaError('unknown', `Could not start ${kind}`)

  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new MediaError('permission-denied', `${kind} permission was refused`)
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new MediaError('no-devices', `No ${kind} found`)
    case 'NotReadableError':
    case 'AbortError':
      return new MediaError('device-in-use', `Your ${kind} is in use by another application`)
    default:
      return new MediaError('unknown', error.message || `Could not start ${kind}`)
  }
}
