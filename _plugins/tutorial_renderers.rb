# Adapt Kramdown output to the existing KaTeX/Mermaid client renderers.
require "cgi"

Jekyll::Hooks.register [:documents, :pages], :post_convert do |page|
  next unless page.output_ext == ".html"

  math = lambda do |value, display|
    page.data["has_math"] = true
    tex = CGI.escapeHTML(CGI.unescapeHTML(value.strip))
    tag = display ? "div" : "span"
    kind = display ? "math-display" : "math-inline"
    "<#{tag} class=\"#{kind}\" data-tex=\"#{tex}\"></#{tag}>"
  end
  # Exclude code examples before adapting MathJax markup emitted by Kramdown.
  page.content = page.content.split(/(<pre\b.*?<\/pre>|<code\b.*?<\/code>)/m).map do |part|
    next part if part.start_with?("<pre", "<code")
    part = part.gsub(/<script type="math\/tex(; mode=display)?">(.*?)<\/script>/m) do
      math.call(Regexp.last_match(2), Regexp.last_match(1))
    end
    part = part.gsub(/^\\\[(.*?)\\\][ \t]*$/m) { math.call(Regexp.last_match(1), true) }
    part.gsub(/\\\((.*?)\\\)/m) { math.call(Regexp.last_match(1), false) }
  end.join
  page.content = page.content.gsub(/<pre><code class="language-mermaid">(.*?)<\/code><\/pre>/m) do
    "<div class=\"mermaid\">#{Regexp.last_match(1)}</div>"
  end
end
