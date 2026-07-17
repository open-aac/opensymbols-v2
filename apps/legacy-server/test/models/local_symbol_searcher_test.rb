require 'test_helper'
require 'minitest/mock'
require Rails.root.join('lib', 'demo_seed')

class LocalSymbolSearcherTest < ActiveSupport::TestCase
  setup do
    RepositoryModifier.delete_all
    PictureSymbol.delete_all
    SymbolRepository.delete_all
    SymbolRequest.delete_all
    ExternalSource.delete_all
    DemoSeed.run!(environment: 'test')
  end

  test 'finds localized public symbols and preserves the response contract' do
    english = PictureSymbol.search('hello')
    assert_equal ['hello'], english.map { |symbol| symbol['symbol_key'] }
    assert_equal 'Hello', english.first['name']
    assert_equal 'en', english.first['locale']
    assert english.first.key?('relevance')
    assert english.first.key?('repo_index')

    spanish = PictureSymbol.search('hola', 'es')
    assert_equal ['hello'], spanish.map { |symbol| symbol['symbol_key'] }
    assert_equal 'Hola', spanish.first['name']
    assert_equal 'es', spanish.first['locale']
  end

  test 'applies safety, enabled, symbol protection, and repository protection filters' do
    assert_empty PictureSymbol.search('medicine')
    assert_equal ['medicine'], PictureSymbol.search('medicine', 'en', false).map { |symbol| symbol['symbol_key'] }
    assert_empty PictureSymbol.search('retired')
    assert_empty PictureSymbol.search('private note')
    assert_empty PictureSymbol.search('staff only')

    protected_symbol = PictureSymbol.search('private note', 'en', true, true, ['demo'])
    assert_equal ['private-note'], protected_symbol.map { |symbol| symbol['symbol_key'] }

    protected_repository = PictureSymbol.search(
      'staff repo:demo-private',
      'en',
      true,
      true,
      ['demo-private']
    )
    assert_equal ['staff-only'], protected_repository.map { |symbol| symbol['symbol_key'] }
  end

  test 'supports deterministic array pagination' do
    %w[alpha beta gamma].each_with_index do |symbol_key, index|
      PictureSymbol.create!(
        repo_key: 'demo',
        symbol_key: "searchable-#{symbol_key}",
        enabled: true,
        random: 20_000 + index,
        settings: {
          'name' => "Searchable #{symbol_key}",
          'enabled' => true,
          'image_url' => "http://localhost:5173/demo-symbols/#{symbol_key}.svg",
          'locales' => {'en' => {'name' => "Searchable #{symbol_key}"}}
        }
      )
    end

    first_page = PictureSymbol.search('searchable', 'en', true, false, [], 0, 2)
    second_page = PictureSymbol.search('searchable', 'en', true, false, [], 1, 2)

    assert_equal 2, first_page.length
    assert_equal 1, second_page.length
    assert_empty first_page.map { |symbol| symbol['id'] } & second_page.map { |symbol| symbol['id'] }
  end

  test 'requires elasticsearch when the local fallback is disabled' do
    LocalSymbolSearcher.stub(:enabled?, false) do
      ElasticSearcher.stub(:enabled?, false) do
        error = assert_raises(RuntimeError) { PictureSymbol.search('hello') }
        assert_equal 'elastic search required', error.message
      end
    end
  end
end
