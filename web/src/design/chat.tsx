// The conversation panel, from AI Elements (free, Apache-2.0): messages, the
// steps Claude took, its reasoning, a question with options, an approval,
// and the composer with mode, model, attachments and dictation.
import { ArrowUpRight, FileText, Mic, Paperclip, ShieldCheck, Star, X } from "lucide-react"
import { useState } from "react"
import { Confirmation, ConfirmationAction, ConfirmationActions, ConfirmationRequest, ConfirmationTitle } from "@/components/ai-elements/confirmation"
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import {
  ModelSelector, ModelSelectorContent, ModelSelectorGroup, ModelSelectorInput, ModelSelectorItem, ModelSelectorList,
  ModelSelectorName, ModelSelectorShortcut, ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector"
import {
  PromptInput, PromptInputBody, PromptInputButton, PromptInputFooter, PromptInputSelect, PromptInputSelectContent,
  PromptInputSelectItem, PromptInputSelectTrigger, PromptInputSelectValue, PromptInputSubmit, PromptInputTextarea, PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { Question, QuestionOption, QuestionOptions, QuestionPrompt } from "@/components/ai-elements/question"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger } from "@/components/ai-elements/task"
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SESSIONS } from "./data"
import { StateIcon } from "./session"

const MODELS = [
  { id: "fable", name: "Fable 5.1", key: "⌘1" },
  { id: "opus", name: "Opus 5.5", key: "⌘2" },
  { id: "sonnet", name: "Sonnet 5.5", key: "⌘3" },
  { id: "haiku", name: "Haiku 5.5", key: "⌘4" },
]

export function ChatPanel() {
  const s = SESSIONS[0]
  const [model, setModel] = useState(MODELS[0])
  const [isPicking, setPicking] = useState(false)
  const [mode, setMode] = useState("auto")
  return (
    <section className="flex h-[860px] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-col gap-1.5 border-b px-4 pt-3 pb-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StateIcon session={s} size={18} /><span className="text-amber-400">Asking you</span>
          <span>·</span><span>{s.repo}</span><span className="font-mono">feat/request-logging</span>
          <span className="ml-auto flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm"><Star /></Button>
            <Button size="sm" className="ml-1 bg-orange-500 text-white hover:bg-orange-500/90">Open in Claude<ArrowUpRight /></Button>
            <Button variant="ghost" size="icon-sm"><X /></Button>
          </span>
        </div>
        <h2 className="text-base font-semibold leading-snug">{s.title}</h2>
        <Tabs defaultValue="chat" className="-mb-px">
          <TabsList variant="line" className="h-9">
            <TabsTrigger value="chat">Conversation</TabsTrigger>
            <TabsTrigger value="changes">Changes <span className="text-muted-foreground">4</span></TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="prs">PRs <span className="text-muted-foreground">1</span></TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="tasks">Tasks <span className="text-muted-foreground">5</span></TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <Conversation className="flex-1">
        <ConversationContent className="gap-5">
          <Message from="user">
            <MessageContent>Turn on request logging in the gateway, but keep personal data out of it.</MessageContent>
          </Message>
          <Message from="assistant">
            <MessageContent>
              <Reasoning duration={6}>
                <ReasoningTrigger />
                <ReasoningContent>The gateway stores full bodies when request logging is on. Those bodies hold emails and phone numbers, so I need a filter before I turn it on.</ReasoningContent>
              </Reasoning>
              <Task defaultOpen={false}>
                <TaskTrigger title="Looked at the gateway's production stage" />
                <TaskContent>
                  <TaskItem>Read <TaskItemFile><FileText className="size-3" />infra/gateway.tf</TaskItemFile></TaskItem>
                  <TaskItem>Ran <TaskItemFile>gateway get-stage prod</TaskItemFile></TaskItem>
                  <TaskItem>Edited <TaskItemFile><FileText className="size-3" />infra/gateway.tf</TaskItemFile> +12 −2</TaskItem>
                </TaskContent>
              </Task>
              <Tool defaultOpen={false}>
                <ToolHeader type="tool-bash" state="output-available" title="terraform plan" />
                <ToolContent>
                  <ToolInput input={{ command: "terraform plan -target=module.gateway" }} />
                  <ToolOutput output="Plan: 0 to add, 1 to change, 0 to destroy." errorText={undefined} />
                </ToolContent>
              </Tool>
              <MessageResponse>{"Access logs are on already. **Full request logging stores every body**, and those hold emails and phone numbers. I can filter them out, or keep less."}</MessageResponse>
            </MessageContent>
          </Message>
          <Question className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
            <QuestionPrompt>How should I store the requests?</QuestionPrompt>
            <QuestionOptions>
              <QuestionOption value="mask">Mask the personal fields</QuestionOption>
              <QuestionOption value="keep">Keep the whole payload for 7 days</QuestionOption>
              <QuestionOption value="headers">Only headers and timings</QuestionOption>
            </QuestionOptions>
          </Question>
          <Confirmation state="approval-requested" approval={{ id: "a1" }}>
            <ConfirmationTitle><ShieldCheck className="mr-1 inline size-4" />Run <code className="font-mono text-xs">terraform apply</code> on production?</ConfirmationTitle>
            <ConfirmationRequest>
              <ConfirmationActions>
                <ConfirmationAction variant="outline">Deny</ConfirmationAction>
                <ConfirmationAction>Allow</ConfirmationAction>
              </ConfirmationActions>
            </ConfirmationRequest>
          </Confirmation>
          <Shimmer className="text-sm">Checking the plan…</Shimmer>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="flex flex-col gap-2 px-3 pb-3">
        <Suggestions>
          <Suggestion suggestion="Mask the personal fields" />
          <Suggestion suggestion="Show me the plan" />
          <Suggestion suggestion="Open the PR" />
        </Suggestions>
        <PromptInput onSubmit={() => {}} className="rounded-xl">
          <PromptInputBody>
            <PromptInputTextarea placeholder="Reply…" />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputButton tooltip="Attach files"><Paperclip /></PromptInputButton>
              <PromptInputSelect value={mode} onValueChange={setMode}>
                <PromptInputSelectTrigger className="h-8 w-auto gap-1 border-0 px-2 text-xs shadow-none">
                  <PromptInputSelectValue />
                </PromptInputSelectTrigger>
                <PromptInputSelectContent>
                  <PromptInputSelectItem value="ask">Ask</PromptInputSelectItem>
                  <PromptInputSelectItem value="edits">Accept edits</PromptInputSelectItem>
                  <PromptInputSelectItem value="plan">Plan</PromptInputSelectItem>
                  <PromptInputSelectItem value="auto">Auto</PromptInputSelectItem>
                </PromptInputSelectContent>
              </PromptInputSelect>
              <ModelSelector open={isPicking} onOpenChange={setPicking}>
                <ModelSelectorTrigger asChild>
                  <PromptInputButton className="text-xs">{model.name} · high</PromptInputButton>
                </ModelSelectorTrigger>
                <ModelSelectorContent title="Model">
                  <ModelSelectorInput placeholder="Search models…" />
                  <ModelSelectorList>
                    <ModelSelectorGroup heading="Claude">
                      {MODELS.map(m => (
                        <ModelSelectorItem key={m.id} value={m.name} onSelect={() => (setModel(m), setPicking(false))}>
                          <ModelSelectorName>{m.name}</ModelSelectorName>
                          <ModelSelectorShortcut>{m.key}</ModelSelectorShortcut>
                        </ModelSelectorItem>
                      ))}
                    </ModelSelectorGroup>
                  </ModelSelectorList>
                </ModelSelectorContent>
              </ModelSelector>
              <PromptInputButton tooltip="Dictate"><Mic /></PromptInputButton>
            </PromptInputTools>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </section>
  )
}
