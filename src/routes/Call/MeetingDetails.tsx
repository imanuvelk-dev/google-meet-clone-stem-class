import { useEffect, useState } from 'react'
import { Icon } from '@design/primitives/index.ts'
import { ControlBarMenu } from './ControlBarMenu.tsx'
import styles from './ControlBar.module.css'

/**
 * How long the button says it copied. Long enough to read, short enough that it
 * is not still claiming it after you have moved on.
 */
const COPIED_MS = 2000

/**
 * The joining-info body: title, link, and the copy button with its "Link copied"
 * state. Shared so the mobile options sheet renders the same content inline that
 * the bar's `info` popover renders on desktop.
 */
export function JoiningInfo({
  meetingId,
  className,
}: {
  meetingId: string | null
  className?: string | undefined
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  // The code is VideoSDK's xxx-yyy-zzz, shown as-is. Google's abc-defg-hij is
  // knowingly not replicated and there is no mapping layer. See DECISIONS.md.
  const link = meetingId ? `${window.location.origin}/${meetingId}` : null

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // Denied permission, or an insecure origin. Saying nothing is right: the
      // link is on screen and selectable, so the way out is already visible.
    }
  }

  return (
    <div className={className} data-testid="meeting-details">
      <p className={styles.detailsTitle}>Joining info</p>
      <p className={styles.detailsLink} data-testid="meeting-details-link">
        {link ?? 'Not connected'}
      </p>
      <button
        type="button"
        className={styles.detailsCopy}
        onClick={() => void copy()}
        disabled={link === null}
        data-testid="copy-link"
      >
        <Icon name={copied ? 'content_copy' : 'link'} size={20} />
        {copied ? 'Link copied' : 'Copy joining info'}
      </button>
    </div>
  )
}

/**
 * The joining info, behind the bar's `info` button.
 *
 * Meet renders this as a side panel. This is a popover over the bar instead, and
 * that is deliberate: the panel's chrome is shared with Chat and People, both of
 * which DO have Figma frames that Phase 3 owns. Inventing that chrome a milestone
 * early would mean guessing at a design the file already answers. The content is
 * Meet's; the container is the vocabulary this bar already has.
 *
 * Live-sourced either way, so it is screenshot-review material, not diff material.
 */
export function MeetingDetails({ meetingId }: { meetingId: string | null }) {
  return (
    <ControlBarMenu
      label="Meeting details"
      triggerClassName={styles.plain}
      triggerContent={<Icon name="info" size={24} />}
      triggerTestId="control-meeting-details"
      align="end"
    >
      {() => <JoiningInfo meetingId={meetingId} className={styles.details} />}
    </ControlBarMenu>
  )
}
