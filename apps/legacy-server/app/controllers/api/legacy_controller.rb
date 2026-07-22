class Api::LegacyController < ApplicationController
  def add_request
    name = params['name'].to_s.strip
    first_letter = params['first_letter'].to_s.strip.downcase
    comments = params['comments'].to_s.strip
    if name.blank? || comments.blank? || first_letter != name[0].to_s.downcase
      return api_error(422, {error: 'invalid symbol request'})
    end

    SymbolRequest.add(name, comments)
    render json: {submitted: true}
  end

  def repo_symbols
    cross_origin
    repo = SymbolRepository.find_by(:repo_key => params['repo_key'])
    repo = nil if repo && repo.settings['protected'] && !@admin
    return api_error(400, {error: 'not found'}) unless repo
    page = params['page'].to_i
    per_page = 60
    lookup = PictureSymbol.where(repo_key: repo.repo_key)
    if params['unsafe'] == '1'
      lookup = lookup.where(unsafe_result: true)
    elsif params['has_skin'] == '1'
      lookup = lookup.where(has_skin: true)
    end

    symbols = lookup[page * per_page, per_page]
    more = lookup[page * (per_page + 1)]
    res = {symbols: symbols.map{|s| s.obj_json }}
    if more
      res[:meta] = {
        next_url: "#{request.protocol}#{request.host_with_port}/api/v1/repositories/#{params['repo_key']}/symbols?page=#{page + 1}"
      }
      if params['unsafe'] == '1'
        res[:meta][:next_url] += "&unsafe=1"
      elsif params['has_skin'] == '1'
        res[:meta][:next_url] += "&has_skin=1"
      end
    end
    render json: res.to_json
  end

  def search
    cross_origin
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

  def random_symbols
    cross_origin
    list = PictureSymbol.all.offset(rand([2, PictureSymbol.max_count - 20].max)).order('random').limit(30).select{|s| s.settings['enabled'] != false && !s.settings['protected_symbol'] && s.safe_result? }
    render json: list[0, 9].map(&:obj_json)
  end

end
