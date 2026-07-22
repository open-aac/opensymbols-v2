class Api::RepositoriesController < ApplicationController

  def index
    repos = SymbolRepository.all.select do |repo|
      repo.settings['active'] != false && (@admin || !repo.settings['protected'])
    end
    repos = repos.sort_by { |repo| repo.settings['name'].to_s.downcase }
    render json: {
      repositories: repos.map { |repo| JsonApi::Repository.as_json(repo, authenticated: @admin) }
    }
  end

  def show
    repo = SymbolRepository.find_by(repo_key: params['id'])
    repo = nil if repo && repo.settings['active'] == false
    repo = nil if repo && repo.settings['protected'] && !@admin
    return unless exists?(repo, params['id'])
    render json: JsonApi::Repository.as_json(repo, wrapper: true, authenticated: @admin)
  end

end
