import { useEffect, useRef, useState } from 'react'
import styles from './VideoSurface.module.css'

/**
 * A MediaStream on screen. The one place in the stage that touches a <video>.
 *
 * The stream must be one CallStore already handed out. Building `new
 * MediaStream(track)` here would mint a fresh identity on every render and spin
 * useSyncExternalStore forever - CallStore.streamFor exists precisely so nothing
 * downstream has to think about that.
 */
export function VideoSurface({
  stream,
  mirrored = false,
  fit = 'cover',
  testId,
}: {
  stream: MediaStream
  /** Self-view only: Meet shows you your own camera the way a mirror would. */
  mirrored?: boolean
  /** A share is 'contain': cropping someone's screen loses the thing they are pointing at. */
  fit?: 'cover' | 'contain'
  testId: string
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [isPortrait, setIsPortrait] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // srcObject cannot go through JSX: it takes an object, not an attribute.
    element.srcObject = stream

    // autoPlay has already tried and swallowed its outcome. Video is muted, so
    // the autoplay policy has nothing to object to and a rejection here means the
    // track died - which the participant leaving already handles by unmounting.
    void element.play().catch(() => {})

    const checkOrientation = () => {
      if (element.videoWidth > 0 && element.videoHeight > 0) {
        setIsPortrait(element.videoHeight > element.videoWidth)
      }
    }

    checkOrientation()
    element.addEventListener('loadedmetadata', checkOrientation)
    element.addEventListener('resize', checkOrientation)

    return () => {
      element.removeEventListener('loadedmetadata', checkOrientation)
      element.removeEventListener('resize', checkOrientation)
      element.srcObject = null
    }
  }, [stream])

  // When a mobile camera sends portrait (vertical) video, 'cover' crops out the
  // top and bottom of the participant's face. Using 'contain' preserves the full face.
  const resolvedFit = fit === 'cover' && isPortrait ? 'contain' : fit

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      /*
       * Always. A webcam stream carries no audio track - CallStore builds it from
       * webcamTrack alone, and CallAudio owns every voice in the meeting - but an
       * unmuted <video> is one upstream change away from being the second source
       * of the feedback loop CallAudio is so careful about.
       */
      muted
      className={[styles.video, styles[resolvedFit], mirrored ? styles.mirrored : null]
        .filter(Boolean)
        .join(' ')}
      data-testid={testId}
    />
  )
}
