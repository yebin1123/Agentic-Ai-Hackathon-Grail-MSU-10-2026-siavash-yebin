import type { HistoryPoint } from '../types/crypto'

export function prepareHistory(points: HistoryPoint[]) {
  const valid = points.flatMap((point) => {
    if (!point || typeof point.timestamp !== 'string' || typeof point.price !== 'number' || !Number.isFinite(point.price) || point.price < 0) return []
    const time = Date.parse(point.timestamp)
    return Number.isFinite(time) ? [{ ...point, time }] : []
  }).sort((a, b) => a.time - b.time)
  const unique = Array.from(new Map(valid.map((point) => [point.time, point])).values())
  return { points: unique, discarded: points.length - unique.length }
}

export function chartGeometry(points: ReturnType<typeof prepareHistory>['points']) {
  if (!points.length) return null
  const min = points.reduce((value, point) => Math.min(value, point.price), Infinity)
  const max = points.reduce((value, point) => Math.max(value, point.price), -Infinity)
  const firstTime = points[0].time
  const lastTime = points[points.length - 1].time
  const left = 132, right = 864, top = 32, bottom = 246
  const coordinates = points.map((point) => ({
    ...point,
    x: firstTime === lastTime ? (left + right) / 2 : left + ((point.time - firstTime) / (lastTime - firstTime)) * (right - left),
    y: min === max ? (top + bottom) / 2 : bottom - ((point.price - min) / (max - min)) * (bottom - top),
  }))
  return { min, max, firstTime, lastTime, left, right, top, bottom, coordinates }
}
