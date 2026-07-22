class Api::SymbolsController < ApplicationController

  def index
    cross_origin
    return api_error(400, {error: 'invalid token'}) unless @valid_token
    protected_repos = (@admin && params['q'].match(/repo/)) ? ['*'] : []
    allow_protected = !!@admin
    if params['search_token']
      return unless valid_search_token?
      allow_protected = true
      protected_repos = @allowed_repos
    end
    results = PictureSymbol.search(
      params['q'],
      params['locale'] || 'en',
      params['safe'] != '0',
      allow_protected,
      protected_repos,
      params['page'].to_i
    )
    render json: results.to_json
  end

  def show
    repo_key, symbol_key = params['id'].split(/\//)
    repo = SymbolRepository.find_by(repo_key: repo_key)
    repo = nil if repo && repo.settings['protected'] && !@admin
    return unless exists?(repo, repo_key)
    symbol = PictureSymbol.find_by(repo_key: repo_key, symbol_key: symbol_key)
    symbol = nil if symbol && symbol.settings['enabled'] == false
    symbol = nil if symbol && symbol.settings['protected_symbol'] && !@admin
    return unless exists?(symbol, params['id'])
    render json: JsonApi::Symbol.as_json(symbol, wrapper: true, authenticated: @admin)
  end

end
