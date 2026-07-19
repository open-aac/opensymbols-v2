require 'test_helper'

class PublicReadContractTest < ActionDispatch::IntegrationTest
  CONTRACT_DIRECTORY = Rails.root.join('test', 'contracts', 'public-read')

  setup do
    PictureSymbol.delete_all
    SymbolRepository.delete_all
    ExternalSource.delete_all

    @original_s3_bucket = ENV['S3_BUCKET']
    @original_s3_cdn = ENV['S3_CDN']
    ENV['S3_BUCKET'] = 'contract-bucket'
    ENV['S3_CDN'] = 'https://cdn.example.test'

    create_repositories
    create_symbols
    SymbolRepository.find_each(&:save!)
  end

  teardown do
    ENV['S3_BUCKET'] = @original_s3_bucket
    ENV['S3_CDN'] = @original_s3_cdn
  end

  Dir[CONTRACT_DIRECTORY.join('*.json')].sort.each do |fixture_path|
    JSON.parse(File.read(fixture_path)).each do |contract|
      test "public read contract #{contract['name']}" do
        request = contract.fetch('request')
        headers = headers_for(request['credentials'])

        get request.fetch('path'), headers: headers

        expected = contract.fetch('response')
        assert_equal expected.fetch('status'), response.status
        assert_equal expected.fetch('body'), JSON.parse(response.body)
      end
    end
  end

  private

  def headers_for(credentials)
    case credentials
    when 'admin'
      {'Authorization' => ExternalSource.user_token('contract-admin')}
    when 'invalid'
      {'Authorization' => 'not-a-valid-token'}
    else
      {}
    end
  end

  def create_repositories
    SymbolRepository.create!(
      id: 1101,
      repo_key: 'demo',
      settings: {
        'name' => 'Demo Symbols',
        'description' => 'Friendly symbols for contract testing.',
        'url' => 'https://example.test/demo',
        'active' => true,
        'protected' => false,
        'default_attribution' => {
          'license' => 'CC BY 4.0',
          'license_url' => 'https://creativecommons.org/licenses/by/4.0/',
          'author_name' => 'Contract Artist',
          'author_url' => 'https://example.test/artist'
        }
      }
    )
    SymbolRepository.create!(
      id: 1102,
      repo_key: 'alpha',
      settings: {'name' => 'alpha symbols', 'active' => true, 'protected' => false}
    )
    SymbolRepository.create!(
      id: 1103,
      repo_key: 'inactive',
      settings: {'name' => 'Inactive Symbols', 'active' => false, 'protected' => false}
    )
    SymbolRepository.create!(
      id: 1104,
      repo_key: 'protected',
      settings: {
        'name' => 'Protected Symbols',
        'description' => 'Only visible to administrators.',
        'active' => true,
        'protected' => true
      }
    )
  end

  def create_symbols
    create_symbol(
      id: 2101,
      repo_key: 'demo',
      symbol_key: 'hello',
      settings: {
        'name' => 'Base hello',
        'description' => 'A friendly hc greeting.',
        'enabled' => true,
        'image_url' => 'https://assets.example.test/hello.svg',
        'file_extension' => 'svg',
        'license' => 'CC BY 4.0',
        'license_url' => 'https://creativecommons.org/licenses/by/4.0/',
        'author' => 'Contract Artist',
        'author_url' => 'https://example.test/artist',
        'source_url' => 'https://example.test/source/hello',
        'unsafe_result' => true,
        'has_skin' => true,
        'has_variants' => true,
        'locales' => {'en' => {'name' => 'Hello'}}
      }
    )
    create_symbol(
      id: 2102,
      repo_key: 'demo',
      symbol_key: 'cdn-image',
      settings: {
        'name' => 'CDN image',
        'enabled' => true,
        'image_url' => '/libraries/demo/cdn-image.png',
        'file_extension' => 'png',
        'locales' => {'en' => {}}
      }
    )
    create_symbol(
      id: 2103,
      repo_key: 'demo',
      symbol_key: 'disabled',
      settings: {'name' => 'Disabled', 'enabled' => false, 'locales' => {'en' => {}}}
    )
    create_symbol(
      id: 2104,
      repo_key: 'demo',
      symbol_key: 'private-symbol',
      settings: {
        'name' => 'Private symbol',
        'enabled' => true,
        'protected_symbol' => true,
        'locales' => {'en' => {}}
      }
    )
    create_symbol(
      id: 2105,
      repo_key: 'inactive',
      symbol_key: 'still-visible',
      settings: {
        'name' => 'Still visible',
        'enabled' => true,
        'image_url' => 'https://assets.example.test/still-visible.svg',
        'file_extension' => 'svg',
        'locales' => {'en' => {}}
      }
    )
    create_symbol(
      id: 2106,
      repo_key: 'protected',
      symbol_key: 'secret',
      settings: {'name' => 'Secret', 'enabled' => true, 'locales' => {'en' => {}}}
    )
  end

  def create_symbol(id:, repo_key:, symbol_key:, settings:)
    PictureSymbol.create!(id: id, repo_key: repo_key, symbol_key: symbol_key, settings: settings)
  end
end
