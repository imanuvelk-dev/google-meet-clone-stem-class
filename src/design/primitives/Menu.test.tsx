import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { Menu } from './Menu.tsx'

const ITEMS = [
  { id: 'mic-1', label: 'MacBook Pro Microphone' },
  { id: 'mic-2', label: 'Yeti Stereo Microphone' },
]

const setup = (onSelect = vi.fn()) => ({
  onSelect,
  user: userEvent.setup(),
  ...render(<Menu label="Microphone" items={ITEMS} selectedId="mic-1" onSelect={onSelect} />),
})

describe('Menu', () => {
  test('shows the selected item without opening', () => {
    setup()
    expect(screen.getByRole('button')).toHaveTextContent('MacBook Pro Microphone')
  })

  test('is closed until asked', () => {
    setup()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('opens on click and lists the devices', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('button'))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(2)
  })

  test('marks the current device as checked, so the picker shows state', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button'))

    expect(screen.getByRole('menuitemradio', { name: 'MacBook Pro Microphone' })).toBeChecked()
    expect(screen.getByRole('menuitemradio', { name: 'Yeti Stereo Microphone' })).not.toBeChecked()
  })

  test('selecting an item reports it and closes', async () => {
    const { user, onSelect } = setup()
    await user.click(screen.getByRole('button'))

    await user.click(screen.getByRole('menuitemradio', { name: 'Yeti Stereo Microphone' }))

    expect(onSelect).toHaveBeenCalledWith('mic-2')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('Escape closes without selecting', async () => {
    const { user, onSelect } = setup()
    await user.click(screen.getByRole('button'))

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  test('clicking outside closes it', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button'))

    await user.click(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('reports expanded state to assistive tech', async () => {
    const { user } = setup()
    const trigger = screen.getByRole('button')

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  test('an empty device list still opens, rather than looking broken', async () => {
    // "No devices" is a real precall state. A trigger that silently does
    // nothing would read as a bug.
    const user = userEvent.setup()
    render(<Menu label="Microphone" items={[]} selectedId={null} onSelect={vi.fn()} />)

    await user.click(screen.getByRole('button'))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('No devices found')).toBeInTheDocument()
  })
})
