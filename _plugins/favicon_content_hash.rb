# Keep the configured SVG as the source of every browser icon.
require "digest"
require "open3"

module FaviconContentHash
  class Generator < Jekyll::Generator
    safe true
    priority :highest

    def fingerprint(site, path)
      source = File.join(site.source, path.sub(%r{\A/}, ""))
      raise Jekyll::Errors::FatalException, "Missing brand asset: #{path}" unless File.file?(source)
      "#{path}?v=#{Digest::SHA256.file(source).hexdigest[0, 12]}"
    end

    def generate(site)
      cfg = site.config["docsteer"]
      return unless cfg.is_a?(Hash)
      svg = cfg["favicon"].to_s.split("?", 2).first
      return if svg.to_s.empty?

      site.data["favicon_script"] = fingerprint(site, "/assets/js/favicon-accent.js")
      cfg["favicon"] = fingerprint(site, svg)
      logo = cfg["logo"].to_s.split("?", 2).first
      cfg["logo"] = fingerprint(site, logo) unless logo.to_s.empty?
      dir = "/assets/images/generated-icons"
      script = File.join(site.source, "maintenance/render_brand_icons.py")
      output, status = Open3.capture2e("python3", script,
        File.join(site.source, svg.sub(%r{\A/}, "")), File.join(site.source, dir))
      raise Jekyll::Errors::FatalException, output unless status.success?

      site.data["brand_icons"] = [
        { "rel" => "icon", "type" => "image/svg+xml", "sizes" => "any", "url" => cfg["favicon"] },
        *[32, 192].map { |size| { "rel" => "icon", "type" => "image/png", "sizes" => "#{size}x#{size}", "url" => fingerprint(site, "#{dir}/icon-#{size}.png") } },
        { "rel" => "apple-touch-icon", "type" => "image/png", "sizes" => "180x180", "url" => fingerprint(site, "#{dir}/icon-180.png") }
      ]
      [32, 180, 192].each do |size|
        name = "icon-#{size}.png"
        site.static_files.reject! { |file| file.relative_path == "#{dir}/#{name}" }
        site.static_files << Jekyll::StaticFile.new(site, site.source, dir, name)
      end
    end
  end
end
