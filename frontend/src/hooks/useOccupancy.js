import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { freshness, normalizeObservation, observationAgeMs } from '../observation'
export default function useOccupancy() {
  const [observation, setObservation] = useState(null)
  const [connection, setConnection] = useState('checking')
  const [polling, setPolling] = useState(true)
  const [now, setNow] = useState(Date.now)
  const [lastChecked, setLastChecked] = useState(null)
  const generation = useRef(0)
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(clock)
  }, [])
  useEffect(() => {
    if (!polling) return
    const current = ++generation.current
    const controller = new AbortController()
    let timer
    async function poll() {
      try {
        const { data } = await api.get('/status', {
          signal: controller.signal,
          timeout: 5000,
        })
        if (generation.current !== current || controller.signal.aborted) return
        // Receipt time updates the browser clock, not the detector timestamp.
        const checkedAt = Date.now()
        setNow(checkedAt)
        setObservation(normalizeObservation(data))
        setConnection('connected')
        setLastChecked(new Date(checkedAt).toISOString())
      } catch {
        if (generation.current !== current || controller.signal.aborted) return
        setConnection('offline')
        setLastChecked(new Date().toISOString())
      }
      if (generation.current === current) timer = setTimeout(poll, 3000)
    }
    poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [polling])
  const start = useCallback(() => setPolling(true), [])
  const stop = useCallback(() => {
    ++generation.current
    setPolling(false)
  }, [])
  return {
    observation,
    connection,
    polling,
    lastChecked,
    state: freshness(observation, connection, now),
    observationAgeMs: observationAgeMs(observation, now),
    start,
    stop,
  }
}
