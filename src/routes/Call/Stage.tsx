import { useCallback, useMemo, useState } from 'react'
import type { VideoQuality } from '@meeting/CallClient.ts'
import { useCall } from '@meeting/hooks/useCall.ts'
import { useParticipants } from '@meeting/hooks/useParticipants.ts'
import { useParticipantView } from '@meeting/hooks/useParticipantView.ts'
import { useWhiteboard } from '@meeting/hooks/useWhiteboard.ts'
import { PageControls } from './PageControls.tsx'
import { ParticipantTile } from './ParticipantTile.tsx'
import { TileGrid } from './TileGrid.tsx'
import { VideoSurface } from './VideoSurface.tsx'
import {
  arrangementFor,
  MAX_STRIP_TILES,
  MAX_TILES_PER_PAGE,
  pageCount,
  pageOf,
  qualityForVisibleCount,
  type LayoutMode,
} from './stageLayout.ts'
import { useStagePolicy } from './useStagePolicy.ts'
import styles from './Stage.module.css'

/** The one thing being looked at: somebody's tile, somebody's screen, or the whiteboard. */
type Primary =
  | { kind: 'tile'; id: string }
  | { kind: 'share'; id: string }
  | { kind: 'whiteboard'; url: string }

/** Stable identity, so an empty strip does not re-run the memos below. */
const NOBODY: readonly string[] = []

/**
 * Everything above the control bar: who is on screen, how they are arranged, and
 * what we are asking of their publishers.
 *
 * This is the only component that reads call-level state, and that is the point.
 * activeSpeakerId and pinnedParticipantId are singular facts that live in
 * CallState; read here once and passed down as props, they re-render this and
 * the two tiles whose ring or pin actually moved. Read inside the tile instead
 * and every one of up to 49 would re-render each time somebody spoke - which is
 * why useParticipantView deliberately does not carry them.
 */
export function Stage({ layout }: { layout: LayoutMode }) {
  const { activeSpeakerId, presenterId, pinnedParticipantId, localParticipantId, pin } = useCall()
  const { whiteboardUrl } = useWhiteboard()
  const participantIds = useParticipants()
  const [requestedPage, setRequestedPage] = useState(0)
  const speakerId = useStickySpeaker(activeSpeakerId, participantIds, localParticipantId)

  const arrangement = arrangementFor(
    layout,
    pinnedParticipantId !== null || presenterId !== null || whiteboardUrl !== null,
  )

  // The whiteboard is a meeting-wide surface everyone opened together, so it
  // takes the primary over a pin or a share. Pin then beats a share: pinning a
  // person while a screen was up is an explicit statement about what to look at,
  // and the share is still one click away.
  const primary: Primary | null = useMemo(() => {
    if (whiteboardUrl) return { kind: 'whiteboard', url: whiteboardUrl }
    if (pinnedParticipantId) return { kind: 'tile', id: pinnedParticipantId }
    if (presenterId) return { kind: 'share', id: presenterId }
    if (arrangement === 'tiled') return null
    return speakerId ? { kind: 'tile', id: speakerId } : null
  }, [whiteboardUrl, pinnedParticipantId, presenterId, arrangement, speakerId])

  const primaryTileId = primary?.kind === 'tile' ? primary.id : null

  /** Who is eligible for the strip, or for the grid. */
  const listed = useMemo(
    () => participantIds.filter((id) => id !== primaryTileId),
    [participantIds, primaryTileId],
  )

  // Spotlight is the primary and nothing else, so it pages through nobody.
  const paged =
    arrangement === 'tiled' ? participantIds : arrangement === 'sidebar' ? listed : NOBODY
  const pageSize = arrangement === 'tiled' ? MAX_TILES_PER_PAGE : MAX_STRIP_TILES
  const pages = pageCount(paged.length, pageSize)

  // Clamped rather than corrected in an effect: people leaving can shrink the
  // meeting past the page you are on, and a render that shows an empty page
  // first and the right one afterwards is a flash of nothing.
  const page = Math.min(requestedPage, pages - 1)
  const onPage = useMemo(() => pageOf(paged, page, pageSize), [paged, page, pageSize])

  /**
   * Everyone whose video we are actually consuming, and at what.
   *
   * Absence from this map is what pauses a stream, which is what makes Spotlight
   * a bandwidth decision and not just a visual one: nobody but the primary is in
   * it. It is also why the primary is always in it - a presenter's share is the
   * whole point of the layout even when their own tile has paginated off the
   * strip.
   */
  const qualityById = useMemo(() => {
    const map = new Map<string, VideoQuality>()

    if (arrangement === 'tiled') {
      const quality = qualityForVisibleCount(onPage.length)
      for (const id of onPage) map.set(id, quality)
      return map
    }

    // A strip tile is a thumbnail whatever the count. The one thing being looked
    // at gets the bandwidth.
    for (const id of onPage) map.set(id, 'low')
    if (primary && primary.kind !== 'whiteboard') map.set(primary.id, 'high')
    return map
  }, [arrangement, onPage, primary])

  useStagePolicy(participantIds, qualityById, localParticipantId)

  /**
   * Our own React state, never the SDK's pin(): theirs broadcasts, and Meet's pin
   * changes your view and nobody else's. See DECISIONS.md.
   *
   * The tile reports whether it was pinned rather than this reading it, which is
   * what keeps this callback stable across a pin. Closing over
   * pinnedParticipantId would give every tile a new prop each time anyone was
   * pinned, and re-render all 49 to move one ring.
   */
  const handleTogglePin = useCallback(
    (participantId: string, wasPinned: boolean) => {
      pin(wasPinned ? null : participantId)
    },
    [pin],
  )

  const controls =
    pages > 1 ? (
      <PageControls page={page} pages={pages} onChange={setRequestedPage} layout={arrangement} />
    ) : null

  if (arrangement === 'tiled') {
    return (
      <div className={styles.stage} data-testid="stage" data-layout="tiled">
        <TileGrid
          participantIds={onPage}
          activeSpeakerId={activeSpeakerId}
          pinnedParticipantId={pinnedParticipantId}
          localParticipantId={localParticipantId}
          onTogglePin={handleTogglePin}
        />
        {controls}
      </div>
    )
  }

  return (
    <div className={styles.stage} data-testid="stage" data-layout={arrangement}>
      <div className={styles.focus}>
        <div className={styles.primary}>
          {primary?.kind === 'whiteboard' ? (
            <WhiteboardPane url={primary.url} />
          ) : primary?.kind === 'tile' ? (
            <ParticipantTile
              participantId={primary.id}
              isActiveSpeaker={primary.id === activeSpeakerId}
              isPinned={primary.id === pinnedParticipantId}
              isLocal={primary.id === localParticipantId}
              onTogglePin={handleTogglePin}
            />
          ) : primary ? (
            <SharePane presenterId={primary.id} isLocal={primary.id === localParticipantId} />
          ) : null}
        </div>

        {arrangement === 'sidebar' ? (
          <div className={styles.strip} data-testid="stage-strip">
            {onPage.map((id) => (
              <div key={id} className={styles.stripCell}>
                <ParticipantTile
                  participantId={id}
                  isActiveSpeaker={id === activeSpeakerId}
                  isPinned={id === pinnedParticipantId}
                  isLocal={id === localParticipantId}
                  onTogglePin={handleTogglePin}
                />
              </div>
            ))}
            {controls}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Somebody to look at when nobody is talking.
 *
 * activeSpeakerId goes null between utterances, and a Spotlight that empties
 * itself every time the room goes quiet is unusable. Never yourself while there
 * is anyone else: your own face is the one thing you did not open Spotlight for.
 */
function useStickySpeaker(
  activeSpeakerId: string | null,
  participantIds: readonly string[],
  localParticipantId: string | null,
): string | null {
  const [sticky, setSticky] = useState<string | null>(null)

  // Adjusted during render, not in an effect. React re-runs this component
  // before painting, so the spotlight never shows a frame of the old speaker.
  if (activeSpeakerId !== null && activeSpeakerId !== sticky) setSticky(activeSpeakerId)

  if (sticky !== null && participantIds.includes(sticky)) return sticky
  return participantIds.find((id) => id !== localParticipantId) ?? participantIds[0] ?? null
}

/**
 * Somebody's screen.
 *
 * Never your own, even though the stream is right there. A tab capturing itself
 * renders the tunnel of mirrors, and Meet does not do it either: the person
 * sharing already knows what is on their screen, and what they need to be told is
 * that everyone else can see it.
 */
function SharePane({ presenterId, isLocal }: { presenterId: string; isLocal: boolean }) {
  const presenter = useParticipantView(presenterId)
  const stream = presenter?.screenShareStream ?? null

  if (isLocal) {
    return (
      <div className={styles.presentingCard} data-testid="presenting-card">
        <p className={styles.presentingTitle}>You are presenting to everyone</p>
      </div>
    )
  }

  if (!presenter || !stream) return null

  return (
    <div className={styles.share} data-testid="share-pane">
      <VideoSurface
        stream={stream}
        // Cropping a shared screen would cut off whatever they are pointing at.
        fit="contain"
        testId={`share-video-${presenterId}`}
      />
      <p className={styles.shareName}>{`${presenter.displayName} is presenting`}</p>
    </div>
  )
}

function WhiteboardPane({ url }: { url: string }) {
  return (
    <iframe
      className={styles.whiteboard}
      src={url}
      title="Whiteboard"
      allow="clipboard-read; clipboard-write"
      data-testid="whiteboard-pane"
    />
  )
}
