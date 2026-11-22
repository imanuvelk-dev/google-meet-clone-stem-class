import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Avatar,
  Button,
  Icon,
  IconButtonLink,
  MeetLogo,
  Spinner,
} from '@design/primitives/index.ts'
import { loadSession, saveHostGrant } from '@lib/session.ts'
import { Carousel } from './Carousel.tsx'
import styles from './Landing.module.css'

const HELP_URL = 'https://docs.videosdk.live/'
const FEEDBACK_URL = 'https://github.com/videosdk-community/google-meet-clone/issues'

function HeaderClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <span className={styles.clock} data-testid="header-clock">
      {time} <span className={styles.clockDot}>&bull;</span> {date}
    </span>
  )
}

export function Landing() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session] = useState(() => loadSession())

  const displayName = session?.displayName || 'You'
  const avatarColour = session?.avatarColour ?? '#0b57d0'

  const createMeeting = async () => {
    setCreating(true)
    setError(null)
    try {
      const response = await fetch('/api/rooms', { method: 'POST' })
      if (!response.ok) throw new Error('Room creation failed')

      const { roomId, hostGrant } = (await response.json()) as {
        roomId: string
        hostGrant: string
      }
      saveHostGrant(roomId, hostGrant)
      void navigate(`/${roomId}`)
    } catch {
      setError('Could not start a new meeting. Check your connection and try again.')
      setCreating(false)
    }
  }

  const joinByCode = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return

    const parsed = /([a-z0-9]+-[a-z0-9]+-[a-z0-9]+)/i.exec(trimmed)
    if (!parsed?.[1]) {
      setError('Enter a valid meeting code or link.')
      return
    }
    void navigate(`/${parsed[1]}`)
  }

  return (
    <div className={styles.page} data-testid="landing">
      <header className={styles.header}>
        <div className={styles.brand}>
          <MeetLogo />
          <span className={styles.brandName}>Google Meet</span>
        </div>

        <div className={styles.cluster}>
          <HeaderClock />
          <IconButtonLink
            icon="help"
            label="Help"
            href={HELP_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="header-help"
          />
          <IconButtonLink
            icon="feedback"
            label="Send feedback"
            href={FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="header-feedback"
          />
          <span className={styles.avatar}>
            <Avatar name={displayName} color={avatarColour} size={32} />
          </span>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <h1 className={styles.title}>Secure video conferencing for everyone</h1>
          <p className={styles.subtitle}>
            Connect, collaborate, and celebrate from anywhere with Google Meet
          </p>

          <div className={styles.actions}>
            <Button
              variant="filled"
              size="large"
              onClick={() => void createMeeting()}
              disabled={creating}
              data-testid="new-meeting"
            >
              {creating ? (
                <Spinner size={18} label="Starting meeting" />
              ) : (
                <Icon name="videocam" size={20} />
              )}
              New meeting
            </Button>

            <form className={styles.joinForm} onSubmit={joinByCode}>
              <span className={styles.joinIcon}>
                <Icon name="keyboard" size={20} />
              </span>
              <input
                className={styles.joinInput}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value)
                  setError(null)
                }}
                placeholder="Enter a code or nickname"
                aria-label="Enter a code or nickname"
                data-testid="meeting-code-input"
              />
              <Button
                variant="text"
                type="submit"
                disabled={!code.trim()}
                data-testid="join-by-code"
              >
                Join
              </Button>
            </form>
          </div>

          {error ? (
            <p className={styles.error} role="alert" data-testid="landing-error">
              {error}
            </p>
          ) : null}
        </section>

        <hr className={styles.divider} />

        <Carousel />
      </main>
    </div>
  )
}
