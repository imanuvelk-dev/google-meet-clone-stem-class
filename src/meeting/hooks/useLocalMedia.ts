import { useCallback, useEffect, useRef, useState } from 'react'
import { useMediaClient } from '../MediaClientContext.ts'
import { MediaError } from '../MeetingClient.ts'

export type LocalMediaStatus = 'starting' | 'ready' | 'error'

/**
 * The tracks and whether each is live, without the controls around them.
 *
 * Split out because reacquire() has to hand these back directly: its caller
 * joins in the same tick, and the state below will not have re-rendered yet.
 */
export interface LocalTracks {
  /** The camera preview stream. Null until ready, or if the camera failed. */
  stream: MediaStream | null
  /**
   * The mic stream. Precall never renders it - the preview is muted, or you
   * hear yourself - but the call hands it to MeetingProvider as
   * customMicrophoneAudioTrack, which is the whole reason it is reachable.
   */
  microphoneStream: MediaStream | null
  cameraEnabled: boolean
  microphoneEnabled: boolean
}

export interface LocalMedia extends LocalTracks {
  status: LocalMediaStatus
  error: MediaError | null
  toggleCamera: () => void
  toggleMicrophone: () => void
  selectCamera: (deviceId: string) => Promise<void>
  selectMicrophone: (deviceId: string) => Promise<void>
  /**
   * Gives up the right to stop the CURRENT tracks. One-way for those tracks.
   *
   * Joining does not unmount this hook: precall and the call are one route,
   * precisely so the tracks survive the transition. But that leaves the cleanup
   * below still holding the gun while VideoSDK publishes the same tracks, and
   * any re-run of the effect would stop the camera mid-meeting. So ownership
   * moves explicitly.
   *
   * Call it only once the call client actually exists. Releasing before the
   * token comes back would strand the tracks ownerless if the join then failed.
   */
  release: () => void
  /**
   * Starts a fresh camera and mic after a released set is gone, and takes
   * ownership of the new ones.
   *
   * This is what post-call's Rejoin needs. Released tracks are stopped once the
   * call is over, and a stopped MediaStreamTrack cannot be restarted - the only
   * way back is to acquire new ones. Resolves with them, rather than only
   * setting state, because Rejoin joins immediately and cannot wait a render.
   *
   * Failures land in status/error exactly as the first acquisition does; the
   * returned tracks simply say what is and is not live.
   */
  reacquire: () => Promise<LocalTracks>
}

/**
 * Owns the precall camera and mic.
 *
 * Camera and mic are started independently on purpose: Meet lets you into the
 * green room with a working camera and no mic (and vice versa), so one failing
 * must not blank the other. Only a camera failure becomes a page-level error.
 */
export function useLocalMedia(): LocalMedia {
  const client = useMediaClient()

  const [status, setStatus] = useState<LocalMediaStatus>('starting')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<MediaError | null>(null)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false)

  // Tracks live in refs as well as state: cleanup must reach the CURRENT track
  // without re-running this effect every time the stream changes.
  const videoStream = useRef<MediaStream | null>(null)
  const audioStream = useRef<MediaStream | null>(null)
  const released = useRef(false)

  const stopStream = (ref: React.MutableRefObject<MediaStream | null>) => {
    ref.current?.getTracks().forEach((track) => track.stop())
    ref.current = null
  }

  const startCamera = useCallback(
    async (deviceId?: string) => {
      stopStream(videoStream)
      const next = await client.createCameraTrack(deviceId ? { deviceId } : undefined)
      videoStream.current = next
      setStream(next)
      setCameraEnabled(true)
      return next
    },
    [client],
  )

  const startMicrophone = useCallback(
    async (deviceId?: string) => {
      stopStream(audioStream)
      setMicrophoneStream(null)
      const next = await client.createMicrophoneTrack(deviceId ? { deviceId } : undefined)
      audioStream.current = next
      setMicrophoneStream(next)
      setMicrophoneEnabled(true)
      return next
    },
    [client],
  )

  const release = useCallback(() => {
    released.current = true
  }, [])

  const reacquire = useCallback(async (): Promise<LocalTracks> => {
    // Ownership comes back with the new tracks, not the released ones: those are
    // stopped and gone, and nothing else has a claim on what we start here.
    released.current = false
    setStatus('starting')

    let microphone: MediaStream | null = null
    try {
      microphone = await startMicrophone()
    } catch {
      setMicrophoneEnabled(false)
    }

    try {
      const camera = await startCamera()
      setStatus('ready')
      setError(null)
      return {
        stream: camera,
        microphoneStream: microphone,
        cameraEnabled: true,
        microphoneEnabled: microphone !== null,
      }
    } catch (caught) {
      setStatus('error')
      setError(
        caught instanceof MediaError ? caught : new MediaError('unknown', 'Could not start camera'),
      )
      setCameraEnabled(false)
      return {
        stream: null,
        microphoneStream: microphone,
        cameraEnabled: false,
        microphoneEnabled: microphone !== null,
      }
    }
  }, [startCamera, startMicrophone])

  useEffect(() => {
    let cancelled = false

    const start = async () => {
      // The mic is allowed to fail without failing the page.
      try {
        await startMicrophone()
      } catch {
        if (!cancelled) setMicrophoneEnabled(false)
      }

      try {
        await startCamera()
        if (!cancelled) {
          setStatus('ready')
          setError(null)
        }
      } catch (caught) {
        if (cancelled) return
        setStatus('error')
        setError(
          caught instanceof MediaError
            ? caught
            : new MediaError('unknown', 'Could not start camera'),
        )
        setCameraEnabled(false)
      }
    }

    void start()

    return () => {
      cancelled = true
      // The call owns these tracks now and is publishing them. Stopping them
      // here would black out the camera in the middle of a meeting.
      if (released.current) return
      stopStream(videoStream)
      stopStream(audioStream)
    }
  }, [startCamera, startMicrophone])

  /**
   * Toggling disables the track rather than stopping it. Stopping would drop the
   * device and re-acquiring it flashes the camera light and costs a visible
   * delay, which the real product does not have.
   */
  const toggleCamera = useCallback(() => {
    const tracks = videoStream.current?.getVideoTracks() ?? []
    if (tracks.length === 0) return
    const next = !tracks[0]?.enabled
    tracks.forEach((track) => (track.enabled = next))
    setCameraEnabled(next)
  }, [])

  const toggleMicrophone = useCallback(() => {
    const tracks = audioStream.current?.getAudioTracks() ?? []
    if (tracks.length === 0) return
    const next = !tracks[0]?.enabled
    tracks.forEach((track) => (track.enabled = next))
    setMicrophoneEnabled(next)
  }, [])

  const selectCamera = useCallback(
    async (deviceId: string) => {
      try {
        await startCamera(deviceId)
      } catch (caught) {
        setStatus('error')
        setError(caught instanceof MediaError ? caught : new MediaError('unknown', 'Camera failed'))
      }
    },
    [startCamera],
  )

  const selectMicrophone = useCallback(
    async (deviceId: string) => {
      try {
        await startMicrophone(deviceId)
      } catch {
        setMicrophoneEnabled(false)
      }
    },
    [startMicrophone],
  )

  return {
    status,
    stream,
    microphoneStream,
    error,
    cameraEnabled,
    microphoneEnabled,
    toggleCamera,
    toggleMicrophone,
    selectCamera,
    selectMicrophone,
    release,
    reacquire,
  }
}
