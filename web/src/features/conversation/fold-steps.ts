// Whether a finished turn folds its steps into one line (Settings, Look). On by default.
import { persistedStore } from "@/lib/store"

export const foldSteps = persistedStore<"on" | "off">("foldSteps", "on")
