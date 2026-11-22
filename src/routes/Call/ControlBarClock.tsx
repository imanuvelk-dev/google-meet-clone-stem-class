import { useEffect, useState } from 'react'
import styles from './ControlBar.module.css'

const format = (date: Date) =>
  date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/**
 * The wall clock, per the Figma's "11:48 AM".
 *
 * Its own component so the tick re-renders four words rather than the whole
 * bar, which owns the mic and the device menus.
 *
 * The locale decides 12h vs 24h. The Figma is drawn in en-US, but pinning
 * everyone to AM/PM would show a clock that disagrees with the one in the
 * user's own menu bar, which is a worse kind of wrong than differing from a
 * mock.
 */
export function ControlBarClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    // Aligned to the next minute rather than polled every second: the display
    // only has minutes in it, and a 1s interval drifts into showing a minute
    // late for most of its life.
    const schedule = () => {
      const date = new Date()
      setNow(date)
      const msToNextMinute = 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds())
      timer = setTimeout(schedule, msToNextMinute)
    }

    schedule()
    return () => clearTimeout(timer)
  }, [])

  return (
    <time className={styles.clockTime} dateTime={now.toISOString()} data-testid="call-clock">
      {format(now)}
    </time>
  )
}
