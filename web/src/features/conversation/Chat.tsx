// The Conversation view of a session: what was said and what waits for it,
// and the reply box. Both read the same bridge. A session opened from the
// search (not on the board) still gets the reply box.
import type { Card } from "@/lib/api-types"
import { Composer } from "./Composer"
import { ConversationView } from "./ConversationView"
import { useBridge } from "./useBridge"

export function Chat({ id, card }: { id: string; card: Card | undefined }) {
  const bridge = useBridge(id)
  return (
    <>
      <ConversationView sessionId={id} card={card} bridge={bridge} />
      <Composer id={id} card={card} bridge={bridge} />
    </>
  )
}
