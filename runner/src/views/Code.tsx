import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { cn } from '../lib/utils'

/** A command or a log (T41): `field` ground, a hairline, `foreground` text, and a copy button. */
export function Code({ text, label, className, children }: { text: string; label: string; className?: string; children?: React.ReactNode }) {
  const copy = () => navigator.clipboard.writeText(text).then(() => toast(label + ' copied'), () => toast.error('could not copy: the browser refused; select the text and copy it'))
  return (
    <div className="relative">
      <pre aria-label={label} tabIndex={0} className={cn('m-0 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-field p-3 pr-11 text-control leading-[1.6] text-foreground', className)}>{children ?? text}</pre>
      <Button variant="ghost" size="icon-sm" className="absolute right-1.5 top-1.5" aria-label={'copy ' + label} onClick={copy}><Copy /></Button>
    </div>
  )
}
