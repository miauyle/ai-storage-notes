# Add a content fingerprint to the configured favicon URL.
# The source filename stays stable; the query changes only when the file contents change.
require "digest"

module FaviconContentHash
  class Generator < Jekyll::Generator
    safe true
    priority :highest

    def generate(site)
      docsteer = site.config["docsteer"]
      return unless docsteer.is_a?(Hash)

      configured = docsteer["favicon"].to_s
      return if configured.empty?

      path = configured.split("?", 2).first
      source_path = File.join(site.source, path.sub(%r{\A/}, ""))
      return unless File.file?(source_path)

      digest = Digest::SHA256.file(source_path).hexdigest[0, 12]
      docsteer["favicon"] = "#{path}?v=#{digest}"
    end
  end
end
