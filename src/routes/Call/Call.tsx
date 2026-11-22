import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePresence } from '@design/usePresence.ts'
import { useCall } from '@meeting/hooks/useCall.ts'
import { useStartCaptions } from '@meeting/hooks/useCaptions.ts'
import { CallAudio } from './CallAudio.tsx'
import { CallUiContext, type CallUi } from './CallUiContext.ts'
import { CaptionsOverlay } from './CaptionsOverlay.tsx'
import { ChatPanel } from './ChatPanel.tsx'
import { ControlBar } from './ControlBar.tsx'
import { LobbyKnocks } from './LobbyKnocks.tsx'
import { LobbyWaiting } from './LobbyWaiting.tsx'
import { NetworkIndicator } from './NetworkIndicator.tsx'
import { PeoplePanel } from './PeoplePanel.tsx'
import { RecordingBadge } from './RecordingBadge.tsx'
import { RecordingNotice } from './RecordingNotice.tsx'
import { Stage } from './Stage.tsx'
import type { LayoutMode } from './stageLayout.ts'
import { useCallShortcuts } from './useCallShortcuts.ts'
import styles from './Call.module.css'

/** Which side panel is open. Only one at a time, as in Meet. */
export type PanelKind = 'chat' | 'people' | null

/**
 * How the meeting ended, in the terms a person would use.
 *
 * 'left' and 'dropped' are the same SDK state ('disconnected') and different
 * sentences, so the difference has to be remembered rather than read.
 */
export type CallEndingKind = 'left' | 'dropped' | 'ended' | 'failed'

export interface CallEnding {
  kind: CallEndingKind
  message: string | null
}

/**
 * The in-call shell: the connection lifecycle, and the two things that hang off
 * the call itself rather than off anything on screen.
 *
 * Audio is the first. It is deliberately not part of a tile: a participant
 * paginated off the stage still has to be heard, so the elements live here and
 * the stage never touches them.
 *
 * The stage is the second, and everything above the control bar is inside it.
 *
 * The surface is always dark. That is not a dark theme - real Meet's call is
 * dark whatever your theme, the way a video player is - so it uses the
 * --color-call-* tokens and follows nothing. See CLAUDE.md.
 */
export function Call({ onEnded }: { onEnded: (ending: CallEnding) => void }) {
  const call = useCall()
  const leftOnPurpose = useRef(false)

  // Tiled, matching the one in-call arrangement the Figma frame draws. Local to
  // the call: it is a view preference, like pin, and it has no business being
  // told to anybody else in the meeting.
  const [layout, setLayout] = useState<LayoutMode>('tiled')

  // Same altitude as layout, and for the same reason: which panel you have open
  // is your view preference and nobody else's business.
  const [panel, setPanel] = useState<PanelKind>(null)

  const [captionsOn, setCaptionsOn] = useState(false)
  const startCaptions = useStartCaptions()

  const { rendered: panelKind, state: panelState, ref: panelRef } = usePresence(panel)

  const toggleCaptions = useCallback(() => {
    setCaptionsOn((current) => {
      const next = !current
      if (next) startCaptions()
      return next
    })
  }, [startCaptions])

  const ui = useMemo<CallUi>(
    () => ({ layout, setLayout, panel, setPanel, captionsOn, toggleCaptions }),
    [layout, panel, captionsOn, toggleCaptions],
  )

  useCallShortcuts({ toggleMic: call.toggleMic, toggleWebcam: call.toggleWebcam })

  const { connection, leaveReason } = call
  useEffect(() => {
    const message = leaveReason?.message ?? null
    if (connection === 'closed') onEnded({ kind: 'ended', message })
    else if (connection === 'disconnected') {
      onEnded({ kind: leftOnPurpose.current ? 'left' : 'dropped', message })
    } else if (connection === 'failed') onEnded({ kind: 'failed', message })
  }, [connection, leaveReason, onEnded])

  const handleLeave = () => {
    // The SDK reports leaving and being dropped identically. Only we know which
    // this was, and only at the moment it is asked for.
    leftOnPurpose.current = true
    call.leave()
  }

  const settling = connection === 'idle' || connection === 'connecting'

  // Derived, because nothing announces it: onEntryResponded ENDS this screen and
  // no event starts it. UNVERIFIED against a real ask_join token - see the Phase
  // 3 plan's open risks. It degrades to 'Getting ready...' rather than to a lie.
  //
  // isHost is known at construction, from the role /api/token already returned,
  // so this cannot fire for a host who simply has not connected yet.
  //
  // Not `=== null`: a denied guest is still in the lobby and still has something
  // to be told. Only being allowed in ends this.
  const inLobby = settling && !call.isHost && call.entryDecision !== 'allowed'

  const stage = inLobby ? (
    <LobbyWaiting />
  ) : settling ? (
    <div className={styles.stage} data-testid="call-stage">
      <p className={styles.stageText} data-testid="call-connecting">
        Getting ready...
      </p>
    </div>
  ) : (
    <Stage layout={layout} />
  )

  return (
    <CallUiContext.Provider value={ui}>
      <div className={styles.call} data-testid="call">
        {/*
          Outside the stage, because it is not a tile and must not become one: a
          participant paginated off the grid still has to be audible.
        */}
        <CallAudio />

        {/*
          role="status" because it appears long after the page has settled, and
          polite because a reconnection usually resolves itself before anyone can
          act on it.
        */}
        {connection === 'reconnecting' ? (
          <p className={styles.banner} role="status" data-testid="reconnecting-banner">
            Reconnecting...
          </p>
        ) : null}

        <NetworkIndicator limitation={call.qualityLimitation} />

        <RecordingBadge />

        {captionsOn ? <CaptionsOverlay /> : null}

        {/*
          The panel is a sibling of the stage, not a child: on desktop it pushes
          the grid (1696 -> 1320), and on mobile it covers it.
        */}
        <div className={styles.body}>
          {stage}
          {panelKind ? (
            <div
              ref={panelRef}
              className={styles.panelSlot}
              data-state={panelState}
              inert={panelState === 'exiting'}
            >
              {panelKind === 'chat' ? (
                <ChatPanel open={panelState === 'entering'} onClose={() => setPanel(null)} />
              ) : (
                <PeoplePanel onClose={() => setPanel(null)} />
              )}
            </div>
          ) : null}
        </div>

        {/* Host-side knock cards. Renders nothing at all for a guest. */}
        <LobbyKnocks />

        {/* Everyone is told, including whoever started it. */}
        <RecordingNotice />

        {/*
          onLeave is passed rather than left to the bar to call leave() itself.
          The SDK reports leaving and being dropped as the same state, so only
          this component can tell them apart, and only at the moment it is asked.
        */}
        <ControlBar onLeave={handleLeave} />
      </div>
    </CallUiContext.Provider>
  )
}
