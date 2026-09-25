require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  # NOT 'PetIsland': the widget extension in ../../../targets/pet-island is
  # already a target by that name, and two Swift modules with one name is a
  # collision the compiler only reports at the import site — the generated
  # ExpoModulesProvider resolves `import PetIsland` to the widget, which has no
  # module class in it, and the app fails to build with "cannot find
  # 'PetIslandModule' in scope". This matches the JS-facing name, `Name("VittoPetIsland")`.
  s.name           = 'VittoPetIsland'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'UNLICENSED'
  s.author         = 'Vitto'
  s.homepage       = 'https://github.com/vitto'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
