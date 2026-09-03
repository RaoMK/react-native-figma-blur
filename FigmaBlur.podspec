require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "FigmaBlur"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/RaoMK/react-native-figma-blur"
  s.license      = package["license"]
  s.authors      = { "RaoMK" => "mowglijuddi@gmail.com" }

  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/RaoMK/react-native-figma-blur.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,cpp}"

  # New Architecture only. This wires up codegen output, Folly, and the
  # renderer headers; there is no legacy-bridge path in this library.
  install_modules_dependencies(s)
end
