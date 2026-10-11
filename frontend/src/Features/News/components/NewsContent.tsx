import { useMemo } from 'react'
import DOMPurify from 'dompurify'

// Same whitelist as the server (NewsHtmlSanitizer): defence in depth in case anything slips through.
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'code', 'pre',
  'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'hr', 'a', 'span',
]

export function NewsContent({ html }: { html: string }) {
  const clean = useMemo(
    () => DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: ['href', 'target', 'rel'] }),
    [html],
  )
  return <div className="news-content" dangerouslySetInnerHTML={{ __html: clean }} />
}
