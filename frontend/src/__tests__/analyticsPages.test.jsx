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
import History from '../pages/History'
import Analytics from '../pages/Analytics'
import TrendChart from '../components/TrendChart'
import { api } from '../api/client'
import { dateParams } from '../analytics'
vi.mock('../api/client', () => ({ api: { get: vi.fn() } }))
afterEach(cleanup)
beforeEach(() => {
  api.get.mockReset()
})
const row = {
  id: 1,
  timestamp: '2026-10-05T12:00:00Z',
  recorded_at: '2026-10-05T12:00:01Z',
  total_observed: 2,
  available: 1,
  occupied: 1,
  occupancy_rate: 50,
  cohort: 'layout:1',
  layout_id: 1,
  spaces: [
    { spot_id: 'spot_1', label: 'P1', status: 'occupied', confidence: 0.84 },
    { spot_id: 'spot_2', label: 'P2', status: 'free', confidence: null },
  ],
}
const cohorts = [{ id: 'layout:1', label: 'Layout #1', layout_id: 1 }]
function analytics(rows = [row]) {
  return {
    summary: {
      observations: rows.length,
      received_observations: rows.length,
      duplicate_observations: 0,
      usable_observations: rows.length,
      average_occupancy_rate: rows.length ? 50 : null,
      max_occupancy_rate: rows.length ? 50 : null,
      min_occupancy_rate: rows.length ? 50 : null,
      peak_timestamp: rows[0]?.timestamp,
    },
    current: rows.at(-1) ?? null,
    current_freshness: 'Stale',
    trend: rows,
    spots: rows.length
      ? [
          {
            cohort: 'layout:1',
            spot_id: 'spot_1',
            label: 'P1',
            observed: rows.length,
            occupied: rows.length,
            available: 0,
            utilization_rate: 100,
          },
        ]
      : [],
    cohorts,
    quality: {
      mixed_layouts: false,
      unrecorded_layout_observations: 0,
      missing_timestamp_observations: 0,
      partial_observations: 0,
      trend_truncated: false,
    },
  }
}
describe('real history', () => {
  it('renders snapshots, occupancy rates, expandable statuses and missing confidence', async () => {
    api.get.mockResolvedValue({ data: { items: [row], total: 1, cohorts } })
    render(<History />)
    expect(screen.getByRole('status')).toBeTruthy()
    await screen.findByRole('table')
    expect(screen.getByText('50.0%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Inspect spaces' }))
    expect(screen.getByText('spot_1')).toBeTruthy()
    expect(screen.getByText('84.0%')).toBeTruthy()
    expect(screen.getByText('Not available')).toBeTruthy()
    expect(screen.getByText('occupied')).toBeTruthy()
  })
  it('sends date and occupancy filters to the server and handles an empty selection', async () => {
    api.get.mockResolvedValue({ data: { items: [], total: 0, cohorts } })
    render(<History />)
    await screen.findByText('No recorded observations yet')
    fireEvent.change(screen.getByLabelText('From date'), {
      target: { value: '2026-10-05' },
    })
    fireEvent.change(screen.getByLabelText('Contains status'), {
      target: { value: 'occupied' },
    })
    await screen.findByText('No observations match these filters')
    expect(api.get.mock.calls.at(-1)[1].params).toMatchObject({
      state: 'occupied',
      offset: 0,
      start: new Date('2026-10-05T00:00:00').toISOString(),
    })
  })
  it('handles API failure and allows retry', async () => {
    api.get
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ data: { items: [], total: 0, cohorts: [] } })
    render(<History />)
    await screen.findByText('History unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByText('No recorded observations yet')
  })
  it('paginates without inventing missing observations', async () => {
    api.get.mockResolvedValue({ data: { items: [row], total: 60, cohorts } })
    render(<History />)
    await screen.findByRole('table')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(api.get.mock.calls.at(-1)[1].params.offset).toBe(50)
    )
  })
})
describe('real analytics', () => {
  it('shows empty metrics without fabricated chart data', async () => {
    api.get.mockResolvedValue({ data: analytics([]) })
    render(<Analytics />)
    await screen.findByText('No observations in this selection')
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('No space observations yet')).toBeTruthy()
  })
  it('shows a single observation and explains insufficient trend data', async () => {
    api.get.mockResolvedValue({ data: analytics() })
    render(<Analytics />)
    await screen.findByText('Per-space observation frequency')
    expect(
      screen.getAllByText('Only one distinct dated observation')
    ).toHaveLength(2)
    expect(screen.getAllByText('100.0%').length).toBeGreaterThan(0)
    expect(within(screen.getByRole('table')).getByText(/P1/)).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })
  it('renders real trend charts, tooltips and per-space statistics', async () => {
    const second = {
      ...row,
      id: 2,
      timestamp: '2026-10-05T12:00:10Z',
      occupancy_rate: 100,
      available: 0,
      occupied: 2,
    }
    api.get.mockResolvedValue({ data: analytics([row, second]) })
    render(<Analytics />)
    await screen.findByRole('img', { name: 'Occupancy rate over time' })
    expect(
      screen.getByRole('img', {
        name: 'Available and occupied spaces over time',
      })
    ).toBeTruthy()
    const chart = screen.getByRole('img', { name: 'Occupancy rate over time' })
    fireEvent.focus(chart.querySelector('circle'))
    expect(screen.getByRole('tooltip').textContent).toContain('50.0%')
    expect(within(screen.getByRole('table')).getByText('100.0%')).toBeTruthy()
  })
  it('handles errors without displaying stale or made-up metrics', async () => {
    api.get.mockRejectedValue(new Error('offline'))
    render(<Analytics />)
    await screen.findByText('Analytics unavailable')
    expect(screen.queryByText('Average Occupancy')).toBeNull()
  })
  it('does not claim a trend from multiple payloads at the same instant', () => {
    render(<TrendChart items={[row, { ...row, id: 2 }]} />)
    expect(screen.getByText('Only one distinct dated observation')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
it('date filters use local days and UTC query instants', () => {
  const params = dateParams({
    start: '2026-10-05',
    end: '2026-10-05',
    cohort: 'all',
  })
  expect(params.start).toBe(new Date('2026-10-05T00:00:00').toISOString())
  const next = new Date('2026-10-06T00:00:00')
  expect(params.end).toBe(new Date(next.getTime() - 1).toISOString())
})
