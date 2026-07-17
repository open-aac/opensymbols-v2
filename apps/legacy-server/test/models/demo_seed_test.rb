require 'test_helper'
require Rails.root.join('lib', 'demo_seed')

class DemoSeedTest < ActiveSupport::TestCase
  setup do
    RepositoryModifier.delete_all
    PictureSymbol.delete_all
    SymbolRepository.delete_all
    SymbolRequest.delete_all
    ExternalSource.delete_all
  end

  test 'seeds representative local demo data' do
    DemoSeed.run!(environment: 'test')

    assert_equal ['demo', 'demo-private'], SymbolRepository.order(:repo_key).pluck(:repo_key)
    assert_equal 12, PictureSymbol.count
    assert_equal 11, SymbolRepository.find_by!(repo_key: 'demo').settings['n_symbols']
    protected_repository = SymbolRepository.find_by!(repo_key: 'demo-private')
    assert_equal 0, protected_repository.settings['n_symbols']
    assert_equal 1, protected_repository.settings['n_protected_symbols']

    hello = PictureSymbol.find_by!(repo_key: 'demo', symbol_key: 'hello')
    assert_equal 'Hola', hello.settings.dig('locales', 'es', 'name')
    assert hello.has_skin
    assert hello.settings['has_variants']
    assert PictureSymbol.find_by!(symbol_key: 'medicine').unsafe_result
    assert PictureSymbol.find_by!(symbol_key: 'private-note').settings['protected_symbol']
    refute PictureSymbol.find_by!(symbol_key: 'retired').settings['enabled']

    repository = SymbolRepository.find_by!(repo_key: 'demo')
    defaults = RepositoryModifier.find_by!(symbol_repository_id: repository.id, locale: 'en')
    assert_equal 'help', defaults.settings.dig('defaults', 'help')
    assert_equal 2, SymbolRequest.count

    source = ExternalSource.find_by!(token: DemoSeed::SOURCE_TOKEN)
    assert source.settings['approved']
    assert source.settings['full_access']
    assert source.settings['global_token']
  end

  test 'is idempotent and preserves unrelated records' do
    unrelated = SymbolRepository.create!(repo_key: 'personal', settings: {'name' => 'Personal symbols'})

    2.times { DemoSeed.run!(environment: 'test') }

    assert_equal 3, SymbolRepository.count
    assert_equal 12, PictureSymbol.count
    assert_equal 2, RepositoryModifier.count
    assert_equal 2, SymbolRequest.count
    assert_equal 1, ExternalSource.count
    assert_equal 'Personal symbols', unrelated.reload.settings['name']
  end

  test 'stores settings through secure serialization' do
    DemoSeed.run!(environment: 'test')

    repository = SymbolRepository.find_by!(repo_key: 'demo')
    stored_settings = SymbolRepository.connection.select_value(
      "SELECT settings FROM symbol_repositories WHERE id = #{repository.id.to_i}"
    )
    assert stored_settings.start_with?('**'), 'settings should use the GoSecure serialization marker'
    assert_equal 'OpenSymbols Demo', repository.reload.settings['name']
  end

  test 'refuses production and invalid asset URLs' do
    error = assert_raises(RuntimeError) { DemoSeed.run!(environment: 'production') }
    assert_match(/only available in development and test/, error.message)
    assert_raises(RuntimeError) do
      DemoSeed.run!(environment: 'test', asset_base_url: '/demo-symbols')
    end
    assert_equal 0, SymbolRepository.count
  end

  test 'references existing local SVG assets without cloud configuration' do
    cloud_keys = %w[S3_BUCKET S3_CDN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY ELASTICSEARCH_URL]
    original = cloud_keys.each_with_object({}) { |key, values| values[key] = ENV.delete(key) }

    DemoSeed.run!(environment: 'test')

    asset_directory = Pathname.new(ENV.fetch('DEMO_ASSET_DIRECTORY'))
    PictureSymbol.find_each do |symbol|
      filename = URI.parse(symbol.settings['image_url']).path.split('/').last
      assert asset_directory.join(filename).file?, "missing local fixture #{filename}"
    end
  ensure
    original.each { |key, value| ENV[key] = value if value }
  end
end
