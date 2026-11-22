import type { ReactNode } from 'react'
import getALink from './illustrations/get-a-link.svg'
import seeEveryoneTogether from './illustrations/see-everyone-together.svg'
import yourMeetingIsSafe from './illustrations/your-meeting-is-safe.svg'

export interface CarouselSlide {
  illustration: string
  title: string
  body: ReactNode
}

export const CAROUSEL_SLIDES: CarouselSlide[] = [
  {
    illustration: getALink,
    title: 'Get a link you can share',
    body: (
      <>
        Click <strong>New meeting</strong> to get a link you can send to people you want to meet
        with
      </>
    ),
  },
  {
    illustration: seeEveryoneTogether,
    title: 'See everyone together',
    body: 'To see more people at the same time, go to Layout in the More options menu',
  },
  {
    illustration: yourMeetingIsSafe,
    title: 'Your meeting is safe',
    body: 'No one can join a meeting unless invited or admitted by the host',
  },
]
