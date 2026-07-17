ENV['RAILS_ENV'] ||= 'test'
ENV['SECURE_ENCRYPTION_KEY'] ||= 'test-secure-encryption-key'
require File.expand_path('../../config/environment', __FILE__)
require 'rails/test_help'

class ActiveSupport::TestCase
end
