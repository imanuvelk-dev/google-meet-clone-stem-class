import { useEffect, useState } from 'react'
import { Icon, Tooltip, type MenuItem } from '@design/primitives/index.ts'
import { useCallClient } from '@meeting/CallContext.ts'
import { useCall } from '@meeting/hooks/useCall.ts'
import type { Device } from '@meeting/MeetingClient.ts'
import { useCallActions, type CallAction, type ToggleAction } from './callActions.ts'
import { ControlBarClock } from './ControlBarClock.tsx'
import { HostControlsMenu } from './HostControlsMenu.tsx'
import { ReactionsPicker } from './ReactionsPicker.tsx'
import { ControlBarOptionsMenu } from './ControlBarOptionsMenu.tsx'
import { ControlBarSplitControl } from './ControlBarSplitControl.tsx'
import { MeetingDetails } from './MeetingDetails.tsx'
import styles from './ControlBar.module.css'

export interface ControlBarProps {
  /**
   * Required, not defaulted to leave().
   *
   * Only Call can tell leaving from being dropped - the SDK reports both as
   * 'disconnected' - and it learns which by being told at the moment the button
   * is pressed. A default here would silently report every deliberate exit as a
   * dropped connection, and nothing would look broken until the post-call
   * screen said the wrong thing.
   */
  onLeave: () => void
}

const isToggle = (action: CallAction | null): action is ToggleAction =>
  action !== null && action.kind === 'toggle'

function BarAction({
  action,
  name,
  variant,
  testId,
  optional = false,
}: {
  action: ToggleAction
  name: string
  variant: 'wide' | 'plain'
  testId: string
  optional?: boolean
}) {
  const base = variant === 'wide' ? styles.controlWide : styles.plain
  const on = variant === 'wide' ? styles.controlOn : styles.plainOn
  const className = [base, action.on ? on : '', optional ? styles.barOptional : '']
    .filter(Boolean)
    .join(' ')

  return (
    <Tooltip content={action.label}>
      <button
        type="button"
        className={className}
        aria-label={name}
        aria-pressed={action.on}
        aria-disabled={action.disabled ? 'true' : undefined}
        onClick={() => {
          if (action.disabled) return
          action.activate()
        }}
        data-testid={testId}
      >
        <Icon name={action.icon} size={24} />
        {action.badge ? (
          <span className={styles.badge} data-testid={action.badge.testId}>
            {action.badge.count}
          </span>
        ) : null}
      </button>
    </Tooltip>
  )
}

const toItems = (devices: Device[]): MenuItem[] =>
  devices.map((device) => ({ id: device.deviceId, label: device.label }))

/**
 * Figma `Desktop / Meeting / Light` > Container 1728x80, the bar along the
 * bottom. Three groups of 566 / 564 / 566 at 48 tall.
 *
 * The frame's gap of 10 is inert and deliberately not reproduced: its three
 * children sum to exactly the 1696px of content box, so SPACE_BETWEEN has no
 * slack to distribute and the groups abut. Measured in the render, the groups
 * start at x=16, 582 and 1146, which is 566+564 with nothing between them.
 * Honouring the 10 would push all three inward and break the arithmetic.
 *
 * Always dark, and not because of a theme: Meet's call is dark whatever your
 * theme, the way a video player is. Hence --color-call-*. See docs/FIGMA.md.
 */
export function ControlBar({ onLeave }: ControlBarProps) {
  const client = useCallClient()
  const call = useCall()
  const actions = useCallActions()
  const [cameras, setCameras] = useState<Device[]>([])
  const [microphones, setMicrophones] = useState<Device[]>([])

  // In-call device lists come off the call client, never useDevices: that hook
  // is precall's and reads useMediaDevice, which is a different API on a
  // different lifecycle. See docs/VIDEOSDK.md.
  //
  // Keyed on connection because the SDK has no devices to report until it has a
  // meeting. Asking once at mount is asking before it can answer, and the empty
  // list it returns then would be the list forever.
  const { connection } = call
  useEffect(() => {
    if (connection !== 'connected') return
    let cancelled = false

    const load = async () => {
      const [nextCameras, nextMicrophones] = await Promise.all([
        client.getCameras(),
        client.getMicrophones(),
      ])
      if (cancelled) return
      setCameras(nextCameras)
      setMicrophones(nextMicrophones)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [client, connection])

  const presenting = call.localScreenShareOn
  const captions = actions.captions
  const raiseHand = actions['raise-hand']
  const people = actions.people
  const chat = actions.chat

  return (
    <footer className={styles.bar} data-testid="control-bar">
      <div className={styles.groupLeft}>
        <div className={styles.clock}>
          <div className={styles.clockRow}>
            <ControlBarClock />
            <span className={styles.clockDivider} />
            {/*
              The meeting CODE where the Figma reads a meeting NAME ("Design
              Chat"). Codes ship as VideoSDK's xxx-yyy-zzz with no mapping
              layer, so we have no names to show. Same accepted deviation as
              precall's <h1>. See docs/DECISIONS.md.
            */}
            <span className={styles.clockName} data-testid="call-meeting-name">
              {call.meetingId ?? ''}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.groupCentre}>
        <ControlBarSplitControl
          kind="audio"
          on={call.localMicOn}
          onToggle={call.toggleMic}
          devices={toItems(microphones)}
          selectedDeviceId={call.selectedMicrophoneId}
          onSelectDevice={call.changeMicrophone}
        />
        <ControlBarSplitControl
          kind="video"
          on={call.localWebcamOn}
          onToggle={call.toggleWebcam}
          devices={toItems(cameras)}
          selectedDeviceId={call.selectedCameraId}
          onSelectDevice={call.changeCamera}
        />

        {/*
          State is read back from the client, never held here. That is what
          makes the two ways a share dies outside our UI - cancelling the
          browser's picker, and its own "Stop sharing" bar - correct for free:
          neither tells us anything, both leave localScreenShareOn false, and a
          button that only ever renders that flag cannot disagree with reality.
          An optimistic "starting..." state is exactly the bug here.
        */}
        <button
          type="button"
          className={[styles.control, styles.controlWide, presenting ? styles.controlOn : '']
            .filter(Boolean)
            .join(' ')}
          aria-label={presenting ? 'Stop presenting' : 'Present now'}
          onClick={call.toggleScreenShare}
          data-testid="toggle-screen-share"
        >
          {/* Same glyph in both states. The colour carries the change, because
              the Figma gives this control exactly one icon and inventing a
              second would be drawing design rather than reading it. */}
          <Icon name="computer_arrow_up" size={24} />
        </button>

        <ReactionsPicker />

        {isToggle(captions) ? (
          <BarAction
            action={captions}
            name="Captions"
            variant="wide"
            testId="control-captions"
            optional
          />
        ) : null}

        {isToggle(raiseHand) ? (
          <BarAction
            action={raiseHand}
            name="Raise hand"
            variant="wide"
            testId="control-raise-hand"
            optional
          />
        ) : null}

        <ControlBarOptionsMenu actions={actions} />

        <button
          type="button"
          className={styles.leave}
          aria-label="Leave call"
          onClick={onLeave}
          data-testid="leave-button"
        >
          <Icon name="call_end" size={24} />
        </button>
      </div>

      <div className={styles.groupRight}>
        <MeetingDetails meetingId={call.meetingId} />
        {isToggle(people) ? (
          <BarAction action={people} name="People" variant="plain" testId="control-people" />
        ) : null}
        {isToggle(chat) ? (
          <BarAction action={chat} name="Chat" variant="plain" testId="control-chat" />
        ) : null}
        <HostControlsMenu actions={actions} />
      </div>
    </footer>
  )
}
