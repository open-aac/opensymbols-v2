class Api::SymbolsController < ApplicationController

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
