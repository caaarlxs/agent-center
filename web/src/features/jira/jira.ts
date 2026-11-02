// Whether Jira is set up (lib/jira.ts): read once, again after a change.
import { get } from "@/lib/api"
import type { JiraSetup } from "@/lib/api-types"
import { createStore } from "@/lib/store"

export const jiraSetup = createStore<JiraSetup | null | undefined>(undefined)
export const loadJira = () => get<{ setup: JiraSetup | null }>("/api/jira").then(r => jiraSetup.set(r.setup), () => jiraSetup.set(null))

// A new session about a ticket: its key, summary and address, to start from.
export const promptFor = (t: { key: string; summary: string; url: string }) => `${t.key}: ${t.summary}\n${t.url}\n\nRead the ticket first.`
