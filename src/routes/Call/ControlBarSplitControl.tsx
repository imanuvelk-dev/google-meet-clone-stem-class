import { Icon, type IconName, type MenuItem } from '@design/primitives/index.ts'
import { ControlBarDeviceMenu } from './ControlBarDeviceMenu.tsx'
import styles from './ControlBar.module.css'

export interface ControlBarSplitControlProps {
  /** Which half of the pair. Decides the glyphs and the wording. */
  kind: 'audio' | 'video'
  on: boolean
  onToggle: () => void
  devices: MenuItem[]
  selectedDeviceId: string | null
  onSelectDevice: (deviceId: string) => void
}

interface Copy {
  device: string
  turnOn: string
  turnOff: string
  onIcon: IconName
  offIcon: IconName
}

const COPY: Record<'audio' | 'video', Copy> = {
  audio: {
    device: 'Microphone',
    turnOn: 'Turn on microphone',
    turnOff: 'Turn off microphone',
    onIcon: 'mic',
    offIcon: 'mic_off',
  },
  video: {
    device: 'Camera',
    turnOn: 'Turn on camera',
    turnOff: 'Turn off camera',
    onIcon: 'videocam',
    offIcon: 'videocam_off',
  },
}

/**
 * Figma `In Call Controls` (88x48): a device chevron and a toggle in one pill.
 *
 * Two buttons, never one. They do unrelated things - one mutes you, the other
 * opens a list - and a single control that behaves differently by which half
 * you hit is unusable by keyboard and unspeakable to a screen reader.
 *
 * The name says the action rather than the state ("Turn off microphone", not
 * "Microphone, on"), so the glyph swap and the label always agree.
 */
export function ControlBarSplitControl({
  kind,
  on,
  onToggle,
  devices,
  selectedDeviceId,
  onSelectDevice,
}: ControlBarSplitControlProps) {
  const copy = COPY[kind]

  return (
    <div className={[styles.split, on ? styles.splitOn : styles.splitOff].join(' ')}>
      <ControlBarDeviceMenu
        label={copy.device}
        items={devices}
        selectedId={selectedDeviceId}
        onSelect={onSelectDevice}
        triggerTestId={`${kind}-device-menu`}
      />
      <button
        type="button"
        className={styles.splitFace}
        aria-label={on ? copy.turnOff : copy.turnOn}
        onClick={onToggle}
        data-testid={`toggle-${kind}`}
      >
        <Icon name={on ? copy.onIcon : copy.offIcon} size={24} />
      </button>
    </div>
  )
}
