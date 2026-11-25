// What a person asks the agent about (pipeline.ts askPipeline), kept by what it is about.
// A question belongs to the run that asked it: every run numbers its questions from Q1, so
// its key carries the run (another run's Q1 is another question, with its own talk).
// Apart, with no imports, for the web to read it too.
export const questionAbout = (run: number, id: string) => `question:${run}.${id}`
