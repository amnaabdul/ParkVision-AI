import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
export default function useManagementData(
  path,
  params = {},
  refreshKey = null
) {
  const [result, setResult] = useState({ key: null, data: null, error: null })
  const [revision, setRevision] = useState(0)
  const query = JSON.stringify(params)
  const requestKey = JSON.stringify([path, query, revision, refreshKey])
  useEffect(() => {
    const controller = new AbortController()
    api
      .get(path, { params: JSON.parse(query), signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return
        if (
          path.endsWith('/history')
            ? !Array.isArray(data?.items)
            : !data?.summary ||
              !Array.isArray(data?.trend) ||
              !Array.isArray(data?.spots)
        )
          throw new Error('Invalid response')
        setResult({ key: requestKey, data, error: null })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        const detail = error?.response?.data?.detail
        setResult((previous) => ({
          ...previous,
          key: requestKey,
          error:
            typeof detail === 'string'
              ? detail
              : error?.response?.status === 404
                ? 'Management API unavailable. Restart the updated FastAPI backend.'
                : 'Could not load observations. Check the backend connection and retry.',
        }))
      })
    return () => controller.abort()
  }, [path, query, requestKey])
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  const loading = result.key !== requestKey
  return {
    data: result.data,
    loading,
    error: loading ? null : result.error,
    refresh,
  }
}
