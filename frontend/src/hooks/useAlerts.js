import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
export default function useAlerts(params = {}) {
  const query = JSON.stringify(params)
  const [revision, setRevision] = useState(0)
  const key = JSON.stringify([query, revision])
  const [result, setResult] = useState({
    key: null,
    data: null,
    error: null,
    offline: null,
  })
  useEffect(() => {
    const controller = new AbortController()
    let timer, outageTime
    const check = async () => {
      try {
        const { data } = await api.get('/alerts', {
          params: JSON.parse(query),
          signal: controller.signal,
          timeout: 5000,
        })
        if (!Array.isArray(data?.items) || !data?.summary)
          throw new Error('Invalid alert response')
        if (controller.signal.aborted) return
        outageTime = null
        setResult({ key, data, error: null, offline: null })
      } catch {
        if (controller.signal.aborted) return
        let unavailable = false
        try {
          await api.get('/health', { signal: controller.signal, timeout: 5000 })
        } catch (healthError) {
          unavailable =
            !healthError.response || healthError.response.status >= 500
        }
        if (controller.signal.aborted) return
        if (unavailable) outageTime ??= new Date().toISOString()
        else outageTime = null
        setResult((previous) => ({
          ...previous,
          key,
          error:
            'Could not load alerts. Retry or check that the updated backend is running.',
          offline: unavailable
            ? {
                id: 'browser-backend-offline',
                type: 'backend_offline',
                severity: 'Critical',
                active: true,
                source: 'browser health check',
                event_time: outageTime,
                message:
                  'Backend unavailable from this browser. Detector state cannot be verified.',
              }
            : null,
        }))
      }
      if (!controller.signal.aborted) timer = setTimeout(check, 5000)
    }
    check()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, key])
  const refresh = useCallback(() => setRevision((value) => value + 1), [setRevision])
  return { ...result, loading: result.key !== key, refresh }
}
