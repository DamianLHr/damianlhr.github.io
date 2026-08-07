// Roads worn between the towns, at build time.
//
// Nobody draws a road onto this island. Each one is the cheapest way to walk
// between two settlements over the terrain the simulation left: gentle ground is
// cheap, steep ground is dear, standing water is impossible, and a river costs
// what it costs to get across — which is far less where it is small, so the
// roads find their own fords upstream exactly as real ones do.
//
// The network is a minimum spanning tree over the towns, so every settlement is
// reachable and no effort is spent on a second way round.

/** Cost of standing on a cell at all; Infinity means impassable. */
function passable(w, lake, seaLevel, i) {
  if (w.height[i] < seaLevel) return false
  if (lake && lake[i] > 0) return false
  return true
}

/**
 * Dijkstra over the grid from one cell, returning cost and predecessor arrays.
 * Eight-connected, with diagonal steps costing their true length.
 */
function walkFrom(w, lake, opts, start) {
  const s = w.size
  const n = s * s
  const { seaLevel, slopeCost, fordCost, fordScale } = opts
  const dist = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)

  // binary heap of (cost, cell)
  const hv = new Float64Array(n + 1)
  const hi = new Int32Array(n + 1)
  let len = 0
  const push = (v, i) => {
    let k = ++len
    hv[k] = v
    hi[k] = i
    while (k > 1) {
      const p = k >> 1
      if (hv[p] <= hv[k]) break
      ;[hv[p], hv[k]] = [hv[k], hv[p]]
      ;[hi[p], hi[k]] = [hi[k], hi[p]]
      k = p
    }
  }
  const pop = () => {
    const topI = hi[1]
    hv[1] = hv[len]
    hi[1] = hi[len]
    len--
    let k = 1
    for (;;) {
      const l = k << 1
      if (l > len) break
      const r = l + 1
      const m = r <= len && hv[r] < hv[l] ? r : l
      if (hv[k] <= hv[m]) break
      ;[hv[m], hv[k]] = [hv[k], hv[m]]
      ;[hi[m], hi[k]] = [hi[k], hi[m]]
      k = m
    }
    return topI
  }

  dist[start] = 0
  push(0, start)
  while (len > 0) {
    const i = pop()
    const x = i % s
    const y = (i / s) | 0
    const di = dist[i]
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 1 || ny < 1 || nx >= s - 1 || ny >= s - 1) continue
        const j = ny * s + nx
        if (!passable(w, lake, seaLevel, j)) continue
        const step = dx && dy ? Math.SQRT2 : 1
        // climbing is what a road actually pays for
        const rise = Math.abs(w.height[j] - w.height[i]) / step
        let c = step * (1 + slopeCost * rise * s)
        // and crossing water, which is cheap upstream and dear at the mouth
        if (w.discharge[j] > fordScale) c += fordCost * (w.discharge[j] / fordScale)
        const nd = di + c
        if (nd < dist[j]) {
          dist[j] = nd
          prev[j] = i
          push(nd, j)
        }
      }
    }
  }
  return { dist, prev }
}

/** Walk the predecessor chain back from `end`, nearest-first, as [x,y] pairs. */
function trace(prev, s, end) {
  const path = []
  let cur = end
  let guard = 0
  while (cur >= 0 && guard++ < s * s) {
    path.push([cur % s, (cur / s) | 0])
    cur = prev[cur]
  }
  return path.reverse()
}

/**
 * Douglas–Peucker: keep the points that carry the shape, within `tol` cells.
 *
 * The obvious cheap version — compare each point against the line to its
 * immediate neighbour — collapses a winding road to three points, because a
 * gentle curve never deviates much from its own next step. This measures
 * against the chord of the whole run, which is what preserves the bends.
 */
function simplify(points, tol = 0.75) {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    if (b - a < 2) continue
    const [ax, ay] = points[a]
    const [bx, by] = points[b]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    let far = -1
    let farD = tol
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((points[i][0] - ax) * dy - (points[i][1] - ay) * dx) / len
      if (d > farD) {
        farD = d
        far = i
      }
    }
    if (far > 0) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

/**
 * Build the road network between `sites` (grid coords), as a minimum spanning
 * tree of least-cost walks. Returns polylines in grid coordinates.
 */
export function roadNetwork(w, sites, { seaLevel, lake, slopeCost = 0.9, fordCost = 26, fordScale = 0.25 } = {}) {
  const s = w.size
  const opts = { seaLevel, slopeCost, fordCost, fordScale }
  const nodes = sites.map((p) => Math.round(p.y) * s + Math.round(p.x))
  if (nodes.length < 2) return { roads: [], unreachable: 0 }

  // one walk per town gives every pairwise cost and every path
  const walks = nodes.map((n0) => walkFrom(w, lake, opts, n0))

  // Prim's: grow the tree by the cheapest edge leaving it
  const inTree = new Set([0])
  const edges = []
  let unreachable = 0
  while (inTree.size < nodes.length) {
    let best = null
    for (const a of inTree) {
      for (let b = 0; b < nodes.length; b++) {
        if (inTree.has(b)) continue
        const cost = walks[a].dist[nodes[b]]
        if (!Number.isFinite(cost)) continue
        if (!best || cost < best.cost) best = { a, b, cost }
      }
    }
    if (!best) {
      // whatever is left cannot be walked to — an islet, or a town ringed by lake
      unreachable = nodes.length - inTree.size
      break
    }
    inTree.add(best.b)
    edges.push(best)
  }

  const roads = edges.map((e) => ({
    from: e.a,
    to: e.b,
    cost: +e.cost.toFixed(2),
    points: simplify(trace(walks[e.a].prev, s, nodes[e.b])).map(([x, y]) => [x, y]),
  }))
  return { roads, unreachable }
}
