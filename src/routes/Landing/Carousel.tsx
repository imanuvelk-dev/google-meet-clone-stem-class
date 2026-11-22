import { useEffect, useRef, useState } from 'react'
import { CAROUSEL_SLIDES } from './carouselSlides.tsx'
import styles from './Carousel.module.css'

const ADVANCE_MS = 6000

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function Carousel() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = useRef(prefersReducedMotion())
  const count = CAROUSEL_SLIDES.length

  const go = (next: number) => setIndex(((next % count) + count) % count)

  useEffect(() => {
    if (reduced.current || paused) return
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count)
    }, ADVANCE_MS)
    return () => window.clearInterval(timer)
  }, [paused, count])

  const slide = CAROUSEL_SLIDES[index]
  if (!slide) return null

  return (
    <div
      className={styles.carousel}
      data-testid="landing-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className={styles.stage}>
        <img
          className={styles.illustration}
          src={slide.illustration}
          alt=""
          width={240}
          height={240}
        />
      </div>

      <h2 className={styles.title}>{slide.title}</h2>
      <p className={styles.body}>{slide.body}</p>

      <div className={styles.dots} role="tablist" aria-label="Slides">
        {CAROUSEL_SLIDES.map((item, dotIndex) => (
          <button
            key={item.title}
            type="button"
            role="tab"
            aria-selected={dotIndex === index}
            aria-label={item.title}
            className={dotIndex === index ? `${styles.dot} ${styles.dotActive}` : styles.dot}
            onClick={() => go(dotIndex)}
            data-testid={`carousel-dot-${dotIndex}`}
          />
        ))}
      </div>
    </div>
  )
}
