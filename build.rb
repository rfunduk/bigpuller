#!/usr/bin/env ruby

puts "Building server-side scripts..."
Dir.glob('src/server/*.coffee').each do |file|
  puts "  #{File.basename(file)}"
  `coffee -o . -c #{file}`
end

puts "Building client-side scripts..."
Dir.glob('src/client/*.coffee').each do |file|
  puts "  #{File.basename(file)}"
  `coffee -o public/ -c #{file}`
end

puts "Building stylesheets..."
Dir.glob('src/client/*.less').reject do |file|
  file =~ /_.+?\.less$/
end.each do |file|
  puts "  #{File.basename(file)}"
  `lessc #{file} public/#{File.basename(file).sub(/less$/, 'css')}`
end
