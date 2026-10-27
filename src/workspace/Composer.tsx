import { useRef, useState } from 'react'
import { Button, Popover, TextArea, Tooltip } from '@heroui/react'
import { At, Bold, Code, FaceSmile, Italic, PaperPlane } from '@gravity-ui/icons'

const EMOJI = ['👍', '🎉', '✅', '👀', '🙏', '🔥', '😂', '❤️', '🚀', '💡', '👏', '🤔', '😅', '☕', '📌', '✨']

/** Message box: Enter sends, Shift+Enter is a new line; the toolbar wraps the selection in markdown. */
export function Composer({ placeholder, onSend, typing, testId = 'composer', autoFocus }: {
  placeholder: string; onSend: (text: string) => void; typing?: string; testId?: string; autoFocus?: boolean
}) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const wrap = (mark: string) => {
    const el = ref.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b } = el
    const next = text.slice(0, a) + mark + text.slice(a, b) + mark + text.slice(b)
    setText(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + mark.length, b + mark.length) })
  }
  const insert = (s: string) => {
    const el = ref.current
    const a = el?.selectionStart ?? text.length
    setText(text.slice(0, a) + s + text.slice(a))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + s.length, a + s.length) })
  }
  const send = () => {
    if (!text.trim()) return
    onSend(text)
    setText('')
  }
  const tool = (label: string, icon: React.ReactNode, onPress: () => void) => (
    <Tooltip delay={400}>
      <Button isIconOnly size="sm" variant="ghost" aria-label={label} className="size-8 min-w-8 rounded-lg text-muted" onPress={onPress}>{icon}</Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  )
  return (
    <div className="px-5 pb-4">
      <div className="rounded-2xl border border-separator bg-surface shadow-sm focus-within:border-accent">
        <TextArea
          ref={ref}
          data-testid={testId}
          aria-label={placeholder}
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={text}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
          }}
          className="max-h-48 min-h-14 w-full resize-none border-0 bg-transparent px-3 pt-3 text-sm shadow-none outline-none focus:ring-0"
        />
        <div className="flex items-center gap-0.5 px-2 pb-2">
          {tool('Bold', <Bold className="size-4" />, () => wrap('*'))}
          {tool('Italic', <Italic className="size-4" />, () => wrap('_'))}
          {tool('Code', <Code className="size-4" />, () => wrap('`'))}
          {tool('Mention someone', <At className="size-4" />, () => insert('@'))}
          <Popover>
            <Button isIconOnly size="sm" variant="ghost" aria-label="Emoji" className="size-8 min-w-8 rounded-lg text-muted"><FaceSmile className="size-4" /></Button>
            <Popover.Content placement="top start">
              <Popover.Dialog className="grid grid-cols-8 gap-1 p-2" aria-label="Emoji">
                {EMOJI.map((e) => (
                  <Button key={e} isIconOnly size="sm" variant="ghost" aria-label={e} className="size-8 min-w-8 text-lg" onPress={() => insert(e)}>{e}</Button>
                ))}
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
          <Button data-testid={`${testId}-send`} isIconOnly size="sm" aria-label="Send" isDisabled={!text.trim()} className="ml-auto size-8 min-w-8 rounded-lg" onPress={send}>
            <PaperPlane className="size-4" />
          </Button>
        </div>
      </div>
      <p className="h-5 px-1 pt-1 text-xs text-muted" aria-live="polite">{typing ? `${typing} is typing…` : ''}</p>
    </div>
  )
}
