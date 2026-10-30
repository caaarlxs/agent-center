// The lanes of a commit graph, as GitLens and `git log --graph` draw it: the
// commits come newest first (topological order); each sits in a lane, and
// the lanes say which commit each line is waiting for. Per row: its lane,
// the lines that come in from above (and which of them end at it: the merged
// branches), and where its parents go below. Lanes keep their place while
// they run, so a line goes straight down until its commit.
export type Row = {
  lane: number
  above: (string | null)[] // the lanes coming in, by what each waits for
  below: (string | null)[] // the lanes going out
  joins: number[] // lanes above that end at this commit (other than its own)
  parents: number[] // the lane below of each of its parents
}

export function lanesOf(commits: { hash: string; parents: string[] }[]): Row[] {
  let lanes: (string | null)[] = []
  return commits.map(({ hash, parents }) => {
    const above = lanes
    let lane = above.indexOf(hash)
    const next = [...above]
    if (lane === -1) {
      lane = next.indexOf(null)
      if (lane === -1) lane = next.push(null) - 1
    }
    const joins = above.flatMap((h, i) => (h === hash && i !== lane ? [i] : []))
    for (const i of joins) next[i] = null
    next[lane] = parents[0] ?? null
    const parentLanes = parents.map((p, k) => {
      if (k === 0) return lane
      const at = next.indexOf(p)
      if (at !== -1) return at
      const free = next.indexOf(null)
      if (free !== -1 && free !== lane) return (next[free] = p), free
      return next.push(p) - 1
    })
    while (next.length && next[next.length - 1] === null) next.pop()
    lanes = next
    return { lane, above, below: next, joins, parents: parentLanes }
  })
}

// The widest a run of rows gets, in lanes.
export const widthOf = (rows: Row[]) => Math.max(1, ...rows.map(r => Math.max(r.above.length, r.below.length, r.lane + 1)))
