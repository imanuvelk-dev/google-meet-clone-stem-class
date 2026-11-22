/**
 * Deterministic stand-in media, shared by FakeMediaClient (precall) and
 * FakeCallClient (in-call).
 *
 * Extracted rather than duplicated because of the bug it already caused once:
 * real browsers reject a hand-rolled track (`new MediaStream([plainObject])`
 * throws TypeError) while jsdom's shim tolerates it, so unit tests cannot catch
 * a divergence here. One implementation means one thing to get right.
 */

/**
 * A real, silent track in a real browser; a stub only under jsdom, which has no
 * capture at all. Playwright therefore exercises the same path as production.
 */
export function createSilentStream(kind: 'video' | 'audio'): MediaStream {
  if (kind === 'video') {
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720
    const context = canvas.getContext('2d')

    if (context && typeof canvas.captureStream === 'function') {
      // A painted frame, not a black one. captureStream(0) emits nothing until
      // asked, which keeps the preview byte-identical across runs and so keeps
      // the visual diff meaningful.
      context.fillStyle = '#3c4043'
      context.fillRect(0, 0, canvas.width, canvas.height)

      const stream = canvas.captureStream(0)
      const [track] = stream.getVideoTracks()
      ;(track as CanvasCaptureMediaStreamTrack | undefined)?.requestFrame()
      return stream
    }
  }

  if (kind === 'audio' && typeof AudioContext !== 'undefined') {
    const context = new AudioContext()
    const destination = context.createMediaStreamDestination()
    // Not connected to anything: a real, silent track. Enough for the mic to be
    // genuinely live without making noise.
    context.createOscillator().connect(destination)
    return destination.stream
  }

  return new MediaStream([createFakeTrack(kind)])
}

/**
 * Minimal MediaStreamTrack stand-in for jsdom. Structurally typed onto
 * MediaStreamTrack: implementing the full interface would be a lot of dead
 * surface for a stub whose only job is to be enabled, disabled, and stopped.
 */
function createFakeTrack(kind: 'video' | 'audio'): MediaStreamTrack {
  const track = {
    kind,
    id: `fake-${kind}`,
    label: 'fake',
    enabled: true,
    muted: false,
    readyState: 'live' as MediaStreamTrackState,
    stop() {
      track.readyState = 'ended'
    },
    addEventListener() {},
    removeEventListener() {},
  }
  return track as unknown as MediaStreamTrack
}
