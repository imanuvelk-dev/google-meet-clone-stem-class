import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@design/primitives/index.ts'
import { useCall } from '@meeting/hooks/useCall.ts'
import { useParticipants } from '@meeting/hooks/useParticipants.ts'
import { useParticipantView } from '@meeting/hooks/useParticipantView.ts'
import { useSpeaker } from '@meeting/hooks/useSpeaker.ts'
import styles from './CallAudio.module.css'

/**
 * Everyone's voice. Deliberately separate from the tiles.
 *
 * Audio is not part of a tile's visual layout, and coupling the two would mean a
 * paginated-away or minimised participant going silent - which is not what
 * Meet does and not what anyone wants. So the elements live here, at call level,
 * invisible, and the grid never touches them.
 *
 * This is also the only surface setSinkId can be applied to, which is why speaker
 * output is wired here rather than anywhere nicer. See speaker.ts.
 */
export function CallAudio() {
  const { localParticipantId } = useCall()
  const participantIds = useParticipants()
  const [blocked, setBlocked] = useState(false)

  /**
   * Every element, so a later user gesture can retry all of them at once. A ref
   * rather than state: this changes on every join and leave and must not
   * re-render the call when it does.
   */
  const elements = useRef(new Set<HTMLAudioElement>())

  const register = useCallback((element: HTMLAudioElement) => {
    elements.current.add(element)
    return () => {
      elements.current.delete(element)
    }
  }, [])

  const handleBlocked = useCallback(() => setBlocked(true), [])

  /**
   * This click IS the user gesture the autoplay policy was holding out for, so
   * the retry is the point of the button, not a hopeful reload.
   *
   * The prompt only goes away if every element actually started. Hiding it on the
   * attempt would put us back to a silent call with nothing saying why, which is
   * the failure this whole path exists to prevent.
   */
  const unblock = async () => {
    const results = await Promise.allSettled([...elements.current].map((el) => el.play()))
    if (results.every((result) => result.status === 'fulfilled')) setBlocked(false)
  }

  return (
    <>
      {participantIds
        // Never render your own mic back at yourself. This is the first of two
        // locks on the feedback loop; ParticipantAudio holds the second.
        .filter((id) => id !== localParticipantId)
        .map((id) => (
          <ParticipantAudio
            key={id}
            participantId={id}
            register={register}
            onBlocked={handleBlocked}
          />
        ))}

      {blocked ? (
        // role="alert", not "status": the meeting is audible to everyone except
        // this person, and they cannot discover that by looking.
        <div className={styles.prompt} role="alert" data-testid="audio-blocked">
          <p className={styles.promptText}>
            Your browser blocked the meeting audio. You will not hear anyone until you allow it.
          </p>
          <Button
            variant="filled"
            className={styles.promptButton}
            onClick={() => void unblock()}
            data-testid="audio-blocked-allow"
          >
            Allow sound
          </Button>
        </div>
      ) : null}
    </>
  )
}

/**
 * One remote participant's audio. Invisible, and mounted only while they are
 * actually sending: a muted participant has no micStream, and an <audio> element
 * with nothing in it is DOM to keep routed and played for no reason.
 */
function ParticipantAudio({
  participantId,
  register,
  onBlocked,
}: {
  participantId: string
  register: (element: HTMLAudioElement) => () => void
  onBlocked: () => void
}) {
  const participant = useParticipantView(participantId)
  const { register: registerSpeaker } = useSpeaker()
  const ref = useRef<HTMLAudioElement>(null)

  const stream = participant?.micStream ?? null

  useEffect(() => {
    const element = ref.current
    if (!element || !stream) return

    // srcObject cannot be set through JSX: it takes an object, not an attribute.
    element.srcObject = stream

    // Registering the element, not the id: routing is per element, and this is
    // what makes someone who joins after the speaker was chosen come out of the
    // right one.
    const unregisterSpeaker = registerSpeaker(element)
    const unregisterPlayback = register(element)

    // autoPlay has already tried by now and swallowed its own outcome. Calling
    // play() is how the rejection becomes observable at all: without this, a
    // blocked call is simply silent, and silence is indistinguishable from a
    // room where nobody is talking.
    void element.play().catch((error: unknown) => {
      if (error instanceof Error && error.name === 'NotAllowedError') onBlocked()
      // Anything else is the stream dying under us, which the participant
      // leaving already handles by unmounting this.
    })

    return () => {
      unregisterSpeaker()
      unregisterPlayback()
      element.srcObject = null
    }
  }, [stream, registerSpeaker, register, onBlocked])

  if (!participant || !stream) return null

  return (
    <audio
      ref={ref}
      autoPlay
      /*
       * The second lock on the feedback loop, and not dead code even though
       * CallAudio already filters the local participant out.
       *
       * The two guards fail independently: the filter is a list-level decision
       * that a future grid refactor could quietly drop, while this one travels
       * with the element itself. The cost is one attribute. The cost of getting
       * it wrong is a howl of feedback in front of everyone in the meeting, which
       * CLAUDE.md names the most common bug in this area.
       */
      muted={participant.isLocal}
      className={styles.audio}
      data-testid={`participant-audio-${participantId}`}
    />
  )
}
