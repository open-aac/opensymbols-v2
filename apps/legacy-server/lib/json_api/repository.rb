module JsonApi::Repository
  extend JsonApi::Json

  TYPE_KEY = 'repository'
  DEFAULT_PAGE = 25
  MAX_PAGE = 50

  def self.build_json(repo, args={})
    attribution = repo.settings['default_attribution'] || {}
    {
      repo_key: repo.repo_key,
      name: repo.settings['name'],
      description: repo.settings['description'],
      url: repo.settings['url'],
      symbol_count: repo.settings['n_protected_symbols'] || repo.settings['n_symbols'] || 0,
      logo_url: "/repositories/#{repo.repo_key}.png",
      attribution: {
        license: attribution['license'],
        license_url: attribution['license_url'],
        author_name: attribution['author_name'],
        author_url: attribution['author_url']
      }
    }
  end

  def self.extra_includes(repo, json, args={})
    if args['authenticated']
      json['repository']['default_core_words'] = repo.default_core_words
      json['repository']['missing_core_words'] = repo.missing_core_words
    end
    json
  end
end
