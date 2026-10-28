// A file's or a folder's icon, as VS Code's Material Icon Theme draws it
// (lib/file-icons.ts): by the file's name, then its extension; by the folder's
// name, open or closed. A plain icon shows until the theme has loaded.
import { File, Folder, FolderOpen } from "lucide-react"
import { useEffect } from "react"
import { cn } from "@/lib/utils"
import { fileIconUrl, folderIconUrl, iconSet, loadIcons } from "@/lib/file-icons"

function useIconSet() {
  const set = iconSet.use()
  useEffect(() => void (set || loadIcons()), [set])
  return set
}

export function FileIcon({ path, className }: { path: string; className?: string }) {
  const set = useIconSet()
  const url = set && fileIconUrl(set, path)
  if (!url) return <File className={cn("size-4 shrink-0 text-muted-foreground", className)} />
  return <img src={url} alt="" draggable={false} className={cn("size-4 shrink-0 select-none", className)} />
}

export function FolderIcon({ path, isOpen = false, className }: { path: string; isOpen?: boolean; className?: string }) {
  const set = useIconSet()
  const url = set && folderIconUrl(set, path, isOpen)
  if (!url) {
    const Icon = isOpen ? FolderOpen : Folder
    return <Icon className={cn("size-4 shrink-0 fill-[#dcb67a]/25 text-[#dcb67a]", className)} />
  }
  return <img src={url} alt="" draggable={false} className={cn("size-4 shrink-0 select-none", className)} />
}
