import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Spinner } from '@design/primitives/index.ts'
import { loadParticipantId, saveSession } from '@lib/session.ts'
import type { CallClient } from '@meeting/CallClient.ts'
import { CallProvider } from '@meeting/CallProvider.tsx'
import { useLocalMedia, type LocalTracks } from '@meeting/hooks/useLocalMedia.ts'
import { Precall } from '@routes/Precall/Precall.tsx'
import { Call, type CallEnding } from './Call.tsx'
import { createVideoSdkCall, type CreateCall } from './createCall.ts'
import { PostCall } from './PostCall.tsx'
import styles from './Room.module.css'

/**
 * The whole of /:meetingId - green room, call, and what is left afterwards.
 *
 * One route, one component, swapping the view in place. Two reasons, and the
 * second is the load-bearing one:
 *
 * 1. Real Meet does not change the URL when you join.
 * 2. useLocalMedia's cleanup stops its tracks on unmount. Navigating to a second
 *    route would therefore kill the very camera and mic we are handing to
 *    MeetingProvider. Not unmounting is what makes the no-flicker handoff work,
 *    so this component - not Precall - is where useLocalMedia has to live.
 *
 * Settled with the user. Do NOT split this into /:meetingId/call. See CLAUDE.md.
 */

type Phase =
  | { name: 'precall' }
  | { name: 'joining' }
  | { name: 'in-call'; client: CallClient }
  | { name: 'join-failed' }
  | { name: 'ended'; ending: CallEnding }

/**
 * `createCall` is the seam. Tests and `?fake=` hand in a factory that builds a
 * FakeCallClient and never fetches a token; the app gets the real one.
 */
export function Room({ createCall = createVideoSdkCall }: { createCall?: CreateCall }) {
  const { meetingId = '' } = useParams()
  const navigate = useNavigate()
  const media = useLocalMedia()
  const [phase, setPhase] = useState<Phase>({ name: 'precall' })

  const clientRef = useRef<CallClient | null>(null)
  const joinedClient = useRef<CallClient | null>(null)
  /** The tracks the call took over. We are the only thing left that can stop them. */
  const releasedTracks = useRef<MediaStream[]>([])
  const joinAttempt = useRef<AbortController | null>(null)
  /** Who you joined as, so Rejoin does not have to ask again. */
  const joinedName = useRef<string | null>(null)

  /**
   * Joins from here rather than from inside CallProvider, and it has to be here.
   *
   * VideoSDK's MeetingProvider configures the token in its own mount effect, and
   * React runs child effects before their parent's. Anything joining from within
   * that provider therefore runs before the token exists, and the SDK sends
   * `authorization: undefined` and 400s - which is what "Could not connect to
   * the meeting" was. Room sits above the provider, so its effect runs last, by
   * which point the token is set.
   *
   * The ref guard is what makes StrictMode's double mount join once. The SDK's
   * own join() has no such guard, so letting it auto-join instead drops one of
   * two racing joins.
   */
  useEffect(() => {
    if (phase.name !== 'in-call') return
    if (joinedClient.current === phase.client) return
    joinedClient.current = phase.client
    phase.client.join()
  }, [phase])

  /**
   * leave() on unmount of the meeting component, which is this one: Room mounts
   * CallProvider, and only Room's unmount means the meeting is over rather than
   * the view having changed.
   *
   * StrictMode double-invokes this on mount, running the cleanup once. The
   * client is still null then, so it is correctly a no-op.
   */
  useEffect(
    () => () => {
      joinAttempt.current?.abort()
      clientRef.current?.leave()
      clientRef.current = null
      stopTracks(releasedTracks.current)
      releasedTracks.current = []
    },
    [],
  )

  /**
   * The tracks are passed in rather than read off `media`, because Rejoin starts
   * new ones and joins in the same tick: `media` is last render's, and its
   * streams are the stopped ones the ended call was holding.
   */
  const startCall = async (name: string, tracks: LocalTracks) => {
    const attempt = new AbortController()
    joinAttempt.current = attempt
    setPhase({ name: 'joining' })
    saveSession(name)
    joinedName.current = name

    try {
      const client = await createCall({
        meetingId,
        name,
        participantId: loadParticipantId(),
        micEnabled: tracks.microphoneEnabled,
        webcamEnabled: tracks.cameraEnabled,
        cameraStream: tracks.stream,
        microphoneStream: tracks.microphoneStream,
        signal: attempt.signal,
      })

      // Left while the token was in flight. The unmount cleanup has already run
      // and stopped the tracks, so this client would be handed a dead camera and
      // then never left, having never joined. Harmless today, since only <Call>
      // joins and it will not mount; guarded because "harmless" here rests on
      // that staying true.
      if (attempt.signal.aborted) return

      // Only now. Releasing before the client exists would strand the tracks
      // ownerless the moment the fetch failed, and precall's retry would find a
      // dead camera.
      media.release()
      releasedTracks.current = [tracks.stream, tracks.microphoneStream].filter(isStream)
      clientRef.current = client
      setPhase({ name: 'in-call', client })
    } catch {
      if (attempt.signal.aborted) return
      // The reason is not shown. Every failure here is either "we could not
      // reach the service" or "the service would not have us", and neither is a
      // distinction anyone who just wants to be in the meeting can act on.
      setPhase({ name: 'join-failed' })
    }
  }

  const join = (name: string) => startCall(name, media)

  /**
   * Straight back in, as Meet's Rejoin does - not back to the green room.
   *
   * The tracks below are new ones. The call was holding precall's, and they were
   * stopped when it ended; a stopped track cannot be restarted, so acquiring is
   * the only way back. Nothing here depends on whether VideoSDK stops custom
   * tracks on leave() - see stopTracks' note - which is what lets this be a
   * rejoin rather than the page reload it used to be.
   */
  const rejoin = async () => {
    const name = joinedName.current
    if (name === null) return
    setPhase({ name: 'joining' })
    await startCall(name, await media.reacquire())
  }

  const handleEnded = useCallback((ending: CallEnding) => {
    clientRef.current = null
    stopTracks(releasedTracks.current)
    releasedTracks.current = []
    setPhase({ name: 'ended', ending })
  }, [])

  switch (phase.name) {
    case 'precall':
      return <Precall media={media} onJoin={(name) => void join(name)} />

    case 'joining':
      return (
        <RoomMessage testId="call-joining" title="Joining...">
          <Spinner size={24} label="Joining the meeting" />
        </RoomMessage>
      )

    case 'in-call':
      return (
        <CallProvider client={phase.client}>
          <Call onEnded={handleEnded} />
        </CallProvider>
      )

    case 'join-failed':
      return (
        <RoomMessage
          testId="join-failed"
          title="Could not join the meeting"
          description="Check your connection and try again."
        >
          {/*
            The tracks were never released, because the call was never built, so
            the green room is still live behind this and Join will work again.
          */}
          <Button
            variant="filled"
            onClick={() => setPhase({ name: 'precall' })}
            data-testid="join-failed-back"
          >
            Back to the green room
          </Button>
        </RoomMessage>
      )

    case 'ended':
      return (
        <PostCall
          ending={phase.ending}
          onRejoin={() => void rejoin()}
          onReturnHome={() => void navigate('/')}
        />
      )
  }
}

/** The dark full-page states around the call. */
function RoomMessage({
  testId,
  title,
  description,
  children,
}: {
  testId: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className={styles.screen} data-testid={testId}>
      <h1 className={styles.title}>{title}</h1>
      {description === undefined ? null : <p className={styles.description}>{description}</p>}
      <div className={styles.actions}>{children}</div>
    </div>
  )
}

/**
 * Stops what the call was holding, once it is over.
 *
 * Whether VideoSDK also stops custom tracks on leave() could not be established
 * from its docs, and this does not depend on the answer: stopping an already
 * stopped track is a no-op, and NOT stopping them would leave the camera light
 * on after the meeting if the SDK turns out not to. Wrong in one direction is
 * harmless and wrong in the other is a camera nobody asked to keep running.
 */
function stopTracks(streams: MediaStream[]): void {
  for (const stream of streams) {
    for (const track of stream.getTracks()) track.stop()
  }
}

const isStream = (stream: MediaStream | null): stream is MediaStream => stream !== null
