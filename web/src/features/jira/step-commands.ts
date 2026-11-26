// The commands of a person's step that a script does (<ticket>/steps/<id>.sh, lib/release.ts):
// to paste in a terminal, from the ticket's folder. The first only reads and says what it would do.
export const stepCommands = (dir: string, id: string, env: string) =>
  [`cd "${dir}"`, `STAGE=${env} bash steps/${id}.sh            # ver qué haría (solo lee)`, `STAGE=${env} DRY_RUN=0 bash steps/${id}.sh  # hacerlo`].join("\n")
