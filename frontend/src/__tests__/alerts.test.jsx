// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Alerts from '../pages/Alerts'
import DashboardAlerts from '../components/DashboardAlerts'
import { api } from '../api/client'
vi.mock('../api/client', () => ({ api: { get: vi.fn(), put: vi.fn() } }))
const settings = {
  high_occupancy_percent: 80,
  low_confidence_percent: 70,
  detector_stale_seconds: 15,
}
const item = {
  id: 'low:1',
  type: 'low_confidence',
  severity: 'Warning',
  active: true,
  message: 'P5 low model confidence: 52.8%.',
  spot_label: 'P5',
  spot_id: 'spot_5',
  layout_id: 1,
  observation_timestamp: '2026-10-05T19:03:56Z',
  recorded_at: '2026-10-05T19:03:57Z',
  event_time: '2026-10-05T19:03:56Z',
}
const data = {
  items: [item],
  total: 1,
  summary: { active: 1, critical: 0, warnings: 1, latest_alert: item },
  detector_state: 'Live',
  quality: { observations: 1 },
}
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  api.get.mockReset()
  api.put.mockReset()
  api.get.mockImplementation((path, config) =>
    Promise.resolve({
      data:
        path === '/alerts/settings'
          ? settings
          : {
              ...data,
              items:
                config?.params?.severity === 'Critical' ||
                config?.params?.type === 'high_occupancy'
                  ? []
                  : [item],
            },
    })
  )
  api.put.mockResolvedValue({ data: settings })
})
it('renders real alert, timestamps, layout and settings', async () => {
  render(<Alerts />)
  await screen.findByText(item.message)
  expect(screen.getByText('Layout #1')).toBeTruthy()
  expect(screen.getByText('P5 / spot_5')).toBeTruthy()
  expect(screen.getByText('Active / current')).toBeTruthy()
  expect(screen.getByText(/Received:/)).toBeTruthy()
  expect(screen.getByLabelText('Low model confidence (%)').value).toBe('70')
})
it('passes severity, type and active filters to backend', async () => {
  render(<Alerts />)
  await screen.findByText(item.message)
  fireEvent.change(screen.getByLabelText('Severity'), {
    target: { value: 'Critical' },
  })
  await screen.findByText('No alerts match these filters.')
  fireEvent.change(screen.getByLabelText('Activity'), {
    target: { value: 'all' },
  })
  fireEvent.change(screen.getByLabelText('Alert type'), {
    target: { value: 'high_occupancy' },
  })
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      '/alerts',
      expect.objectContaining({
        params: expect.objectContaining({
          severity: 'Critical',
          type: 'high_occupancy',
          active_only: false,
        }),
      })
    )
  )
})
it('shows a real empty history state', async () => {
  api.get.mockImplementation((path) =>
    Promise.resolve({
      data:
        path === '/alerts/settings'
          ? settings
          : {
              ...data,
              items: [],
              summary: { active: 0, critical: 0, warnings: 0 },
              quality: { observations: 0 },
            },
    })
  )
  render(<Alerts />)
  await screen.findByText('No active parking alerts.')
  expect(
    screen.getByText('No detector observations have been stored yet.')
  ).toBeTruthy()
})
it('distinguishes API failure from backend outage', async () => {
  api.get.mockImplementation((path) =>
    path === '/alerts'
      ? Promise.reject({ response: { status: 404 } })
      : Promise.resolve({
          data: path === '/alerts/settings' ? settings : { ok: true },
        })
  )
  render(<Alerts />)
  await screen.findByText('Alerts unavailable')
  expect(screen.queryByText(/Backend unavailable from this browser/)).toBeNull()
})
it('shows critical browser outage after failed health check', async () => {
  api.get.mockRejectedValue(new Error('Network unavailable'))
  render(<Alerts />)
  await screen.findByText(
    'Backend unavailable from this browser. Detector state cannot be verified.'
  )
  expect(screen.getByText('Critical', { selector: '.badge' })).toBeTruthy()
  expect(screen.getByText(/Browser health check:/)).toBeTruthy()
})
it('validates settings and persists entered numeric thresholds', async () => {
  render(<Alerts />)
  const field = await screen.findByLabelText(
    'Detector stale threshold (seconds)'
  )
  fireEvent.change(field, { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save alert settings' }))
  expect(screen.getByText(/Occupancy must be/)).toBeTruthy()
  expect(api.put).not.toHaveBeenCalled()
  fireEvent.change(field, { target: { value: '30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save alert settings' }))
  await screen.findByText('Settings saved.')
  expect(api.put).toHaveBeenCalledWith('/alerts/settings', {
    ...settings,
    detector_stale_seconds: 30,
  })
})
it('shows useful owner authorization errors', async () => {
  api.put.mockRejectedValue({ response: { status: 401 } })
  render(<Alerts />)
  await screen.findByLabelText('High occupancy (%)')
  fireEvent.click(screen.getByRole('button', { name: 'Save alert settings' }))
  await screen.findByText(
    'Sign in with an owner token in Owner Setup before saving.'
  )
})
it('integrates compact dashboard alerts and navigation', async () => {
  const navigate = vi.fn()
  render(<DashboardAlerts navigate={navigate} />)
  await screen.findByText(item.message)
  fireEvent.click(screen.getByRole('button', { name: /Open Alerts/ }))
  expect(navigate).toHaveBeenCalledWith('alerts')
  expect(api.get).toHaveBeenCalledWith(
    '/alerts',
    expect.objectContaining({ params: { active_only: true, limit: 3 } })
  )
})
it('rechecks unchanged detector data periodically and recovers from outage', async () => {
  vi.useFakeTimers()
  render(<Alerts />)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByText(item.message)).toBeTruthy()
  api.get.mockImplementation(path => path === '/alerts/settings' ? Promise.resolve({ data: settings }) : Promise.reject(new Error('Network')))
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(screen.getByText(/Backend unavailable from this browser./)).toBeTruthy()
  api.get.mockImplementation(() => Promise.resolve({ data }))
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(screen.queryByText(/Backend unavailable from this browser./)).toBeNull()
})

it('shows the five frame_04/frame_05 events separately while Active only keeps two conditions', async () => {
  const transitions = [['P8','occupied','free'],['P2','free','occupied'],['P5','free','occupied'],['P6','free','occupied'],['P10','free','occupied']].map(([label, previous, current]) => ({ ...item, id: label, type: 'state_change', severity: 'Info', active: false, spot_label: label, previous_status: previous, current_status: current, message: `${label} state change: ${previous} to ${current}.` }))
  const conditions = [{ ...item, id: 'stale', type: 'detector_stale', message: 'Detector stale warning' }, { ...item, spot_label: 'P10', message: 'P10 low model confidence: 53.4%.' }]
  api.get.mockImplementation((path, config) => Promise.resolve({ data: path === '/alerts/settings' ? settings : { ...data, items: config.params.type === 'state_change' ? transitions : conditions, total: config.params.type === 'state_change' ? 5 : 2, summary: { active: 2, critical: 0, warnings: 2 } } }))
  render(<Alerts />)
  await screen.findByText('Detector stale warning')
  expect(screen.getByLabelText('Activity').value).toBe('active')
  const section = screen.getByRole('region', { name: 'Recent state changes' })
  await waitFor(() => expect(within(section).getAllByText('Recorded state-change event')).toHaveLength(5))
  for (const event of transitions) expect(within(section).getByText(event.message)).toBeTruthy()
  expect(within(section).queryByText('Active / current')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /View all state changes/ }))
  await waitFor(() => expect(screen.getByLabelText('Activity').value).toBe('all'))
  expect(screen.getByLabelText('Severity').value).toBe('Info')
  expect(screen.getByLabelText('Alert type').value).toBe('state_change')
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/alerts', expect.objectContaining({ params: expect.objectContaining({ type:'state_change',severity:'Info',active_only:false,limit:50 }) })))
})
