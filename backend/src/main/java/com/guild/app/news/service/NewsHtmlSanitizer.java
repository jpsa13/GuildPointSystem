package com.guild.app.news.service;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.safety.Safelist;

/**
 * Whitelist for the rich-text editor's output. Anything else (scripts, event handlers, iframes,
 * javascript: links, inline styles) is dropped before the HTML is stored.
 */
public final class NewsHtmlSanitizer {

    private static final Safelist SAFELIST = new Safelist()
            .addTags("p", "br", "strong", "b", "em", "i", "u", "s", "strike", "code", "pre",
                    "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "hr", "a", "span")
            .addAttributes("a", "href", "target", "rel")
            .addProtocols("a", "href", "http", "https", "mailto")
            .addEnforcedAttribute("a", "rel", "noopener noreferrer nofollow")
            .addEnforcedAttribute("a", "target", "_blank");

    private NewsHtmlSanitizer() {}

    public static String sanitize(String html) {
        var settings = new Document.OutputSettings().prettyPrint(false);
        return Jsoup.clean(html == null ? "" : html, "", SAFELIST, settings).trim();
    }

    /** True when the HTML has no visible text (e.g. only "<p></p>"). */
    public static boolean isBlank(String sanitizedHtml) {
        return Jsoup.parse(sanitizedHtml).text().isBlank();
    }
}
