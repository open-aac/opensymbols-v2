require 'test_helper'

class PublicApiControllerTest < ActionDispatch::IntegrationTest
  setup do
    SymbolRepository.delete_all
    PictureSymbol.delete_all
    @repo = SymbolRepository.create!(
      repo_key: 'demo',
      settings: {
        'name' => 'Demo Symbols',
        'description' => 'Friendly symbols',
        'url' => 'https://example.com',
        'active' => true,
        'protected' => false,
        'default_attribution' => {
          'license' => 'CC BY 4.0',
          'author_name' => 'Example Designer'
        }
      }
    )
    @symbol = PictureSymbol.create!(
      repo_key: 'demo',
      symbol_key: 'hello-a1',
      settings: {
        'name' => 'Hello',
        'description' => 'A person waving hello.',
        'enabled' => true,
        'image_url' => 'https://example.com/hello.svg',
        'file_extension' => 'svg',
        'license' => 'CC BY 4.0',
        'author' => 'Example Designer',
        'locales' => { 'en' => { 'name' => 'Hello' } }
      }
    )
  end

  test 'lists and shows public repositories' do
    get '/api/v2/repositories'
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal ['demo'], body['repositories'].map { |repo| repo['repo_key'] }

    get '/api/v2/repositories/demo'
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal 'Demo Symbols', body['repository']['name']
    assert_equal 'CC BY 4.0', body['repository']['attribution']['license']
  end

  test 'shows a public symbol with attribution' do
    get '/api/v2/symbols/demo/hello-a1'
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal 'Hello', body['symbol']['name']
    assert_equal 'A person waving hello.', body['symbol']['description']
    assert_equal 'Example Designer', body['symbol']['author']
  end

  test 'hides protected repositories and symbols' do
    @repo.settings['protected'] = true
    @repo.save!

    get '/api/v2/repositories'
    assert_response :success
    assert_empty JSON.parse(response.body)['repositories']

    get '/api/v2/repositories/demo'
    assert_response :not_found

    @repo.settings['protected'] = false
    @repo.save!
    @symbol.settings['protected_symbol'] = true
    @symbol.save!

    get '/api/v2/symbols/demo/hello-a1'
    assert_response :not_found
  end

  test 'accepts a valid public symbol request' do
    assert_difference('SymbolRequest.count', 1) do
      post '/api/v1/symbols/requests', params: {
        name: 'Bacon',
        first_letter: 'b',
        comments: 'A clear picture of bacon'
      }
    end
    assert_response :success
    assert JSON.parse(response.body)['submitted']
  end

  test 'rejects symbol request honeypot mismatches' do
    assert_no_difference('SymbolRequest.count') do
      post '/api/v1/symbols/requests', params: {
        name: 'Bacon',
        first_letter: 'x',
        comments: 'A clear picture of bacon'
      }
    end
    assert_response :unprocessable_entity
  end

  test 'generates a shared secret for a valid application' do
    assert_difference('ExternalSource.count', 1) do
      post '/api/v2/generate_secret', params: {
        org_name: 'AAC Example',
        org_email: 'hello@example.com',
        org_purpose: 'Testing symbol search'
      }
    end
    assert_response :success
    body = JSON.parse(response.body)
    assert body['shared_secret'].present?
    assert_equal 'hello@example.com', ExternalSource.last.settings['email']
  end

  test 'requires complete shared secret application details' do
    assert_no_difference('ExternalSource.count') do
      post '/api/v2/generate_secret', params: {
        org_name: 'AAC Example',
        org_email: 'not-an-email',
        org_purpose: ''
      }
    end
    assert_response :unprocessable_entity
  end
end
