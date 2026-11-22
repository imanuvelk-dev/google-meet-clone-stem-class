import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Avatar, Button, Icon, IconButton, MeetLogo, Menu } from '@design/primitives/index.ts'
import { useDevices } from '@meeting/hooks/useDevices.ts'
import type { LocalMedia } from '@meeting/hooks/useLocalMedia.ts'
import { useSpeaker } from '@meeting/hooks/useSpeaker.ts'
import { loadSession, saveSession } from '@lib/session.ts'
import { MediaErrorState } from './MediaErrorState.tsx'
import { useNetworkQuality } from '@meeting/hooks/useNetworkQuality.ts'
import styles from './Precall.module.css'

/**
 * The green room. Figma: Desktop / Home / Light (1728x1117).
 *
 * Note this is the Figma's "Home" frame. The file has no landing page; see
 * CLAUDE.md.
 *
 * `media` arrives as a prop rather than from useLocalMedia here, because this
 * component unmounts on join and the tracks must not. Room owns the hook for
 * exactly as long as the route lives. See Room.tsx.
 */
export function Precall({ media, onJoin }: { media: LocalMedia; onJoin: (name: string) => void }) {
  const { meetingId = '' } = useParams()
  const devices = useDevices()
  const network = useNetworkQuality()
  /**
   * Not local state, unlike the camera and microphone below.
   *
   * Those two are choices about a track, and the track is handed to the call, so
   * the choice travels with it. Output routing has no track: it is setSinkId on
   * audio elements that do not exist yet, in a component that has not mounted.
   * The selection therefore has to outlive this component, so it lives in the
   * seam. See speaker.ts.
   */
  const speaker = useSpeaker()

  const videoRef = useRef<HTMLVideoElement>(null)
  const [session, setSession] = useState(() => loadSession())
  const [name, setName] = useState(() => loadSession()?.displayName ?? '')
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null)
  const [selectedMicrophone, setSelectedMicrophone] = useState<string | null>(null)

  // srcObject cannot be set through JSX: it takes an object, not an attribute.
  useEffect(() => {
    if (videoRef.current && media.stream) videoRef.current.srcObject = media.stream
  }, [media.stream])

  /**
   * Derived, not stored. Until you pick something, the picker shows the device
   * actually in use, which is the first one. Storing that default in an effect
   * would mean a render where the row shows nothing, and it would go stale the
   * moment a device is unplugged.
   */
  const activeCamera = selectedCamera ?? devices.cameras[0]?.deviceId ?? null
  const activeMicrophone = selectedMicrophone ?? devices.microphones[0]?.deviceId ?? null
  const activeSpeaker = speaker.deviceId ?? devices.speakers[0]?.deviceId ?? null

  const displayName = session?.displayName || 'You'

  const handleNameCommit = () => {
    if (name.trim()) setSession(saveSession(name))
  }

  const handleJoin = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    // Committed here as well as on blur: clicking Join with the caret still in
    // the field is the ordinary path, and the name is what the call is joined
    // under.
    setSession(saveSession(trimmed))
    onJoin(trimmed)
  }

  return (
    <div className={styles.page} data-testid="precall">
      <header className={styles.header}>
        <div className={styles.brand}>
          <MeetLogo />
          <span className={styles.brandName}>Google Meet</span>
        </div>
        {/*
          The Figma shows "raymonddvan@gmail.com / Switch account" here. We have
          no OAuth and no accounts to switch to, so that control could only lie
          about what the app can do. The name below is the real identity, and the
          "Your name" field is where it is changed. Deliberate deviation; see
          CLAUDE.md.
        */}
        <div className={styles.account}>
          <span className={styles.accountName}>{displayName}</span>
          <Avatar name={displayName} color={session?.avatarColour ?? '#0b57d0'} size={32} />
        </div>
      </header>

      <div className={styles.body}>
        {/*
          A grid, not nested columns, so the title can sit in the right column on
          desktop and jump above the preview on mobile without being rendered
          twice. Two <h1>s hidden by media query would be a real a11y bug.
        */}
        <div className={styles.titleBlock}>
          <h1 className={styles.meetingName}>{meetingId || 'Design Chat'}</h1>
        </div>

        <div className={styles.previewColumn}>
          <div className={styles.preview} data-testid="camera-preview">
            {media.status === 'error' && media.error ? (
              <MediaErrorState
                reason={media.error.reason}
                onRetry={() => window.location.reload()}
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  className={styles.video}
                  autoPlay
                  playsInline
                  // Never play your own mic back at yourself.
                  muted
                  data-testid="preview-video"
                />
                <span className={styles.previewName}>{displayName}</span>

                <div className={styles.previewControls}>
                  <IconButton
                    icon={media.microphoneEnabled ? 'mic' : 'mic_off'}
                    label={media.microphoneEnabled ? 'Turn off microphone' : 'Turn on microphone'}
                    aria-pressed={!media.microphoneEnabled}
                    variant={media.microphoneEnabled ? 'overlay' : 'danger'}
                    size="large"
                    onClick={media.toggleMicrophone}
                    data-testid="toggle-microphone"
                  />
                  <IconButton
                    icon={media.cameraEnabled ? 'videocam' : 'videocam_off'}
                    label={media.cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
                    aria-pressed={!media.cameraEnabled}
                    variant={media.cameraEnabled ? 'overlay' : 'danger'}
                    size="large"
                    onClick={media.toggleCamera}
                    data-testid="toggle-camera"
                  />
                </div>

              </>
            )}
          </div>

          <div className={styles.deviceRow} data-testid="device-row">
            <Menu
              label="Microphone"
              icon="mic"
              items={devices.microphones.map(toMenuItem)}
              selectedId={activeMicrophone}
              onSelect={(id) => {
                setSelectedMicrophone(id)
                void media.selectMicrophone(id)
              }}
            />
            {/*
              Hidden, not disabled, where the browser cannot route output.
              setSinkId is typed in lib.dom so it compiles everywhere and then
              simply does not exist in Safari, and a picker that silently changes
              nothing is the bug this milestone exists to end - moving it to
              Safari is not fixing it. Detection is at runtime, so the day Safari
              ships setSinkId the control comes back on its own. See speaker.ts.
            */}
            {speaker.supported ? (
              <Menu
                label="Speakers"
                icon="volume_up"
                items={devices.speakers.map(toMenuItem)}
                selectedId={activeSpeaker}
                onSelect={speaker.select}
              />
            ) : null}
            <Menu
              label="Camera"
              icon="videocam"
              items={devices.cameras.map(toMenuItem)}
              selectedId={activeCamera}
              onSelect={(id) => {
                setSelectedCamera(id)
                void media.selectCamera(id)
              }}
            />
          </div>

          {/*
            Only once the test has actually come back poor. Rendering it while
            the test is still running would flash a warning at everyone, and the
            frame has no banner: nothing shifts on a healthy connection.

            role="status" because it appears seconds after load, long after a
            screen reader has finished with the page.
          */}
          {network.status === 'poor' ? (
            <p className={styles.networkWarning} role="status" data-testid="network-warning">
              <Icon name="signal_cellular_alt" size={18} />
              Your network connection is unstable. Others may not see or hear you clearly.
            </p>
          ) : null}
        </div>

        <div className={styles.joinColumn}>
          {/*
            Figma groups the title block and Join in one 240x152 container. The
            title lives in its own grid area so mobile can lift it above the
            preview, so this group is the rest of it: identify yourself, then
            join.
          */}
          <div className={styles.joinGroup}>
            <label className={styles.nameField}>
              <span className={styles.nameLabel}>Your name</span>
              <input
                className={styles.nameInput}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={handleNameCommit}
                placeholder="Your name"
                data-testid="display-name-input"
              />
            </label>

            <Button
              variant="filled"
              size="large"
              className={styles.joinButton}
              disabled={!name.trim()}
              onClick={handleJoin}
              data-testid="join-button"
            >
              Join now
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

const toMenuItem = (device: { deviceId: string; label: string }) => ({
  id: device.deviceId,
  label: device.label,
})
