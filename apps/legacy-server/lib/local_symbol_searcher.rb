module LocalSymbolSearcher
  DEFAULT_PER_PAGE = 50
  MAX_PER_PAGE = 50

  def self.enabled?
    Rails.env.test? || (Rails.env.development? && !ElasticSearcher.configured?)
  end

  def self.search(q, locale:, repo_filter: nil, favored_repo_filter: nil, safe_search: true,
                  allow_protected: false, protected_repos: [], page: 0, per_page: DEFAULT_PER_PAGE)
    query = normalize(q)
    locale = normalize_locale(locale)
    page = [page.to_i, 0].max
    per_page = [[per_page.to_i, 1].max, MAX_PER_PAGE].min
    allowed_repositories = Array(protected_repos).map(&:to_s)
    allow_all_protected = allow_protected && allowed_repositories == ['*']
    repositories = SymbolRepository.all.each_with_object({}) do |repository, result|
      result[repository.repo_key] = repository
    end

    results = PictureSymbol.all.each_with_object([]) do |symbol, matches|
      next unless searchable?(symbol)
      next if repo_filter && symbol.repo_key != repo_filter
      next if safe_search && !symbol.safe_result?

      repository = repositories[symbol.repo_key]
      protected_result = symbol.settings['protected_symbol'] || (repository && repository.settings['protected'])
      if protected_result
        allowed = allow_all_protected || (
          allow_protected && allowed_repositories.include?(symbol.repo_key)
        )
        next unless allowed
      end

      score = relevance(symbol, query, locale)
      next unless query.empty? || score

      json = symbol.obj_json(true, locale).stringify_keys
      use_score = use_score(symbol, query, locale)
      json['use_score'] = use_score
      json['relevance'] = (score || 0) + use_score
      matches << json
    end

    results.sort_by! { |result| [result['relevance'], -result['id'].to_i] }
    results.reverse!
    balance_repositories(results)
    if favored_repo_filter
      favored = results.first(10).select { |result| result['repo_key'] == favored_repo_filter }
      results = (favored + results).uniq
    end
    results.slice(page * per_page, per_page) || []
  end

  def self.searchable?(symbol)
    symbol.enabled != false && symbol.settings['enabled'] != false
  end

  def self.relevance(symbol, query, locale)
    return 0 if query.empty?

    localized = symbol.settings.fetch('locales', {})[locale] || {}
    english = symbol.settings.fetch('locales', {})['en'] || {}
    name = normalize(localized['name'] || symbol.settings['name'])
    searchable = [
      name,
      localized['description'],
      localized['search_string'],
      english['name'],
      english['description'],
      english['search_string'],
      symbol.settings['name'],
      symbol.settings['description'],
      symbol.repo_key,
      symbol.settings['image_url']
    ].compact.map { |value| normalize(value) }.join(' ')
    terms = query.split(/\s+/)
    return nil unless terms.all? { |term| searchable.include?(term) }

    score = 10
    score += 100 if name == query
    score += 60 if name.start_with?(query)
    score += 30 if name.match?(/\b#{Regexp.escape(query)}\b/)
    score += 20 if searchable.include?(query)
    score
  end

  def self.use_score(symbol, query, locale)
    localized = symbol.settings.fetch('locales', {})[locale] || {}
    (localized.fetch('use_scores', {})[query] || 0).to_f
  end

  def self.balance_repositories(results)
    repository_counts = Hash.new(0)
    results.each do |result|
      repository_counts[result['repo_key']] += 1
      count = repository_counts[result['repo_key']]
      result['repo_index'] = count <= 5 ? 2 : (count <= 10 ? 1 : 0)
      result.delete('use_scores')
    end
    results.sort_by! { |result| [result['repo_index'], result['relevance']] }
    results.reverse!
  end

  def self.normalize(value)
    value.to_s.downcase.gsub(/[\.\(\)\/]/, ' ').gsub(/\s+/, ' ').strip
  end

  def self.normalize_locale(locale)
    locale.to_s.downcase.split(/[-_]/).first.presence || 'en'
  end

  private_class_method :searchable?, :relevance, :use_score, :balance_repositories,
    :normalize, :normalize_locale
end
