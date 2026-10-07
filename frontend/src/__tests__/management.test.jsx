// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import LiveParking from '../pages/LiveParking'
import { api } from '../api/client'
vi.mock('../api/client', () => ({
  API_BASE: 'http://localhost:8000',
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))
vi.mock('../LeafletMap', () => ({
  default: ({ layout, status, onSpotClick }) => (
    <div data-testid="parking-map" data-status={JSON.stringify(status ?? {})}>
      <button onClick={() => onSpotClick?.(layout.spots[0].spot_id)}>
        Map polygon
      </button>
    </div>
  ),
}))
afterEach(cleanup)
beforeEach(() => {
  localStorage.clear()
  api.get.mockReset()
  api.post.mockReset()
  api.patch.mockReset()
  api.get.mockImplementation((url) =>
    url === '/status'
      ? Promise.resolve({ data: {} })
      : url === '/alerts'
        ? Promise.resolve({
            data: {
              items: [],
              summary: { active: 0, critical: 0, warnings: 0 },
            },
          })
        : url === '/alerts/settings'
          ? Promise.resolve({
              data: {
                high_occupancy_percent: 80,
                low_confidence_percent: 70,
                detector_stale_seconds: 15,
              },
            })
          : url === '/analytics/history'
            ? Promise.resolve({ data: { items: [] } })
            : Promise.reject({ response: { status: 404 } })
  )
})
describe('management pages', () => {
  it('navigates all pages and preserves explicit sample handoff and label editing', async () => {
    render(<App />)
    await screen.findByText(
      'No published layout. Open Owner Setup to get started.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Owner Setup' }))
    expect(screen.getByRole('button', { name: 'Get owner token' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Run SfM layout/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load sample handoff' }))
    expect(screen.getByLabelText('Label for spot_1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Live Parking' }))
    expect(screen.getByText(/These polygons are not published/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    await screen.findByText('No recorded observations yet')
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }))
    await screen.findByText('Analytics unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }))
    await screen.findByText('No active parking alerts.')
    fireEvent.click(screen.getByRole('button', { name: 'System Info' }))
    expect(screen.getByRole('list', { name: 'Architecture flow' })).toBeTruthy()
    expect(screen.getByText(/not a calibrated probability/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Integrated components' })).toBeTruthy()
    expect(screen.getByText(/not claimed as newly authored or trained/)).toBeTruthy()
    expect(api.post).not.toHaveBeenCalled()
  })
  it('shows selected spot confidence without changing polling controls', () => {
    const start = vi.fn(),
      stop = vi.fn()
    const feed = {
      state: 'Live',
      connection: 'connected',
      polling: true,
      start,
      stop,
      observation: {
        spots: { a: 'occupied' },
        confidence: { a: 0.84 },
        timestamp: '2026-10-05T12:00:00Z',
      },
    }
    render(
      <LiveParking
        layout={{ spots: [{ spot_id: 'a', label: 'A-01', corners: [] }] }}
        feed={feed}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Map polygon' }))
    expect(screen.getByRole('heading', { name: 'A-01' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Select parking space'), {
      target: { value: 'a' },
    })
    expect(screen.getByLabelText('Select parking space').value).toBe('a')
    expect(screen.getByText('Model confidence')).toBeTruthy()
    expect(screen.getByText('84.0%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(stop).toHaveBeenCalledTimes(1)
  })
  it('shows real history payload counts and timestamps', async () => {
    api.get.mockImplementation((url) =>
      Promise.resolve({
        data:
          url === '/analytics/history'
            ? {
                items: [
                  {
                    id: 1,
                    timestamp: '2026-10-05T12:00:00Z',
                    recorded_at: '2026-10-05T12:00:01Z',
                    total_observed: 2,
                    available: 1,
                    occupied: 1,
                    occupancy_rate: 50,
                    cohort: 'legacy:a',
                    spaces: [],
                  },
                ],
                total: 1,
                cohorts: [],
              }
            : {},
      })
    )
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())
    expect(screen.getByRole('table').textContent).toContain('Reported spaces')
    expect(screen.getByRole('table').textContent).toContain('50.0%')
  })
})

describe('publishing the sample handoff for real occupancy', () => {
  const detector = {
    spots: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        `spot_${i + 1}`,
        i % 2 === 0 ? 'occupied' : 'free',
      ])
    ),
    confidence: { spot_1: 0.84, spot_12: 0.91 },
    timestamp: '2020-01-01T00:00:00Z',
  }

  it('publishes labels and geometry, enables Start, and applies stale status and confidence', async () => {
    let saved = null
    api.get.mockImplementation((url) =>
      url === '/status'
        ? Promise.resolve({ data: detector })
        : saved
          ? Promise.resolve({ data: saved })
          : Promise.reject({ response: { status: 404 } })
    )
    api.post.mockImplementation((url, payload) => {
      saved = payload
      return Promise.resolve({ data: { status: 'ok', spots_saved: 12 } })
    })
    const view = render(<App />)
    await screen.findByText(
      'No published layout. Open Owner Setup to get started.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Owner Setup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load sample handoff' }))
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Live Parking' }))
    expect(screen.getByRole('button', { name: 'Start polling' }).disabled).toBe(
      true
    )
    expect(
      screen
        .getAllByTestId('parking-map')
        .every((map) => map.dataset.status === '{}')
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Owner Setup' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Publish layout / Use for Live Parking',
      })
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Start polling' }).disabled
      ).toBe(false)
    )
    expect(saved.spot_source).toBe('sample_handoff')
    expect(saved.isSample).toBeUndefined()
    expect(saved.background_image).toBeNull()
    expect(saved.spots.map((spot) => [spot.spot_id, spot.label])).toEqual(
      Array.from({ length: 12 }, (_, i) => [`spot_${i + 1}`, `P${i + 1}`])
    )
    expect(saved.spots[0].corners).toEqual([
      [40, 60],
      [110, 60],
      [110, 130],
      [40, 130],
    ])
    expect(
      screen
        .getAllByTestId('parking-map')
        .some((map) => JSON.parse(map.dataset.status).spot_12 === 'free')
    ).toBe(true)
    expect(screen.getAllByText('Stale').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Map polygon' }))
    expect(screen.getByRole('heading', { name: 'P1' })).toBeTruthy()
    expect(
      within(
        screen.getByRole('heading', { name: 'P1' }).closest('aside')
      ).getByText('spot_1')
    ).toBeTruthy()
    expect(screen.getByText('84.0%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start polling' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Stop' }).disabled).toBe(false)
    )
    expect(screen.getAllByText('Stale').length).toBeGreaterThan(0)
    view.unmount()
    render(<App />)
    await waitFor(() =>
      expect(
        screen
          .getAllByTestId('parking-map')
          .some((map) => JSON.parse(map.dataset.status).spot_1 === 'occupied')
      ).toBe(true)
    )
    expect(screen.queryByText(/These polygons are not published/)).toBeNull()
  })

  it('retains the preview when publishing is rejected', async () => {
    api.post.mockRejectedValue({ response: { status: 401 } })
    render(<App />)
    await screen.findByText(
      'No published layout. Open Owner Setup to get started.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Owner Setup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load sample handoff' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Publish layout / Use for Live Parking',
      })
    )
    await screen.findByText(
      'Publishing requires an owner token. Sign in above and retry.'
    )
    expect(
      screen.getByRole('button', {
        name: 'Publish layout / Use for Live Parking',
      }).disabled
    ).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Live Parking' }))
    expect(screen.getByText(/These polygons are not published/)).toBeTruthy()
    expect(
      screen
        .getAllByTestId('parking-map')
        .every((map) => map.dataset.status === '{}')
    ).toBe(true)
  })

  it('does not activate live geometry unless the saved layout is verified', async () => {
    api.post.mockResolvedValue({ data: { status: 'ok' } })
    render(<App />)
    await screen.findByText(
      'No published layout. Open Owner Setup to get started.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Owner Setup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load sample handoff' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Publish layout / Use for Live Parking',
      })
    )
    await screen.findByText(/its saved version could not be confirmed/)
    expect(
      screen.getByRole('button', {
        name: 'Publish layout / Use for Live Parking',
      }).disabled
    ).toBe(false)
    expect(
      screen.getByText(/Sample handoff preview - not published/)
    ).toBeTruthy()
  })
})
