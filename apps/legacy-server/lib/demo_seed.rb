class DemoSeed
  SOURCE_TOKEN = 'local-development-shared-secret'.freeze
  DEFAULT_ASSET_BASE_URL = 'http://localhost:5173/demo-symbols'.freeze
  ALLOWED_ENVIRONMENTS = %w[development test].freeze

  REPOSITORIES = [
    {
      'repo_key' => 'demo',
      'name' => 'OpenSymbols Demo',
      'description' => 'Local, cloud-free symbols for OpenSymbols development.',
      'protected' => false
    },
    {
      'repo_key' => 'demo-private',
      'name' => 'OpenSymbols Protected Demo',
      'description' => 'Local protected symbols for authorization testing.',
      'protected' => true
    }
  ].freeze

  SYMBOLS = [
    ['demo', 'hello', 'Hello', 'A hand waving hello.', 'hello.svg', {'has_skin' => true, 'has_variants' => true, 'locales' => {'es' => {'name' => 'Hola', 'description' => 'Una mano saludando.'}}}],
    ['demo', 'yes', 'Yes', 'A clear yes response.', 'yes.svg', {}],
    ['demo', 'no', 'No', 'A clear no response.', 'no.svg', {}],
    ['demo', 'help', 'Help', 'Ask another person for help.', 'help.svg', {}],
    ['demo', 'drink', 'Drink', 'A cup used to request a drink.', 'drink.svg', {}],
    ['demo', 'toilet', 'Toilet', 'A toilet for a bathroom request.', 'toilet.svg', {}],
    ['demo', 'happy', 'Happy', 'A smiling face.', 'happy.svg', {'locales' => {'es' => {'name' => 'Feliz', 'description' => 'Una cara sonriente.'}}}],
    ['demo', 'pain', 'Pain', 'A body signal for pain.', 'pain.svg', {}],
    ['demo', 'medicine', 'Medicine', 'A medicine bottle marked unsafe for filtering tests.', 'medicine.svg', {'unsafe_result' => true}],
    ['demo', 'private-note', 'Private note', 'A protected symbol in a public repository.', 'private-note.svg', {'protected_symbol' => true}],
    ['demo', 'retired', 'Retired symbol', 'A disabled symbol for visibility tests.', 'retired.svg', {'enabled' => false}],
    ['demo-private', 'staff-only', 'Staff only', 'A symbol inside a protected repository.', 'staff-only.svg', {'protected_symbol' => true}]
  ].freeze

  DEFAULTS = {
    'en' => {'hello' => 'hello', 'yes' => 'yes', 'no' => 'no', 'help' => 'help', 'drink' => 'drink', 'toilet' => 'toilet'},
    'es' => {'hola' => 'hello', 'feliz' => 'happy'}
  }.freeze

  REQUESTS = [
    ['grandparent', 'A clear symbol representing a grandparent.'],
    ['quiet place', 'A symbol for requesting a quiet place.']
  ].freeze

  def self.run!(environment: Rails.env, asset_base_url: ENV.fetch('DEMO_ASSET_BASE_URL', DEFAULT_ASSET_BASE_URL), asset_directory: default_asset_directory)
    environment = environment.to_s
    unless ALLOWED_ENVIRONMENTS.include?(environment)
      raise "Demo seed is only available in development and test (received #{environment})."
    end

    asset_base_url = asset_base_url.to_s.sub(%r{/+$}, '')
    raise 'DEMO_ASSET_BASE_URL must be an absolute HTTP(S) URL.' unless asset_base_url.match?(%r{\Ahttps?://})
    validate_assets!(asset_directory)

    ActiveRecord::Base.transaction do
      seed_repositories
      seed_symbols(asset_base_url)
      seed_defaults
      seed_requests
      seed_external_source
      refresh_repository_counts
    end

    puts "Seeded #{REPOSITORIES.length} demo repositories and #{SYMBOLS.length} demo symbols."
  end

  def self.seed_repositories
    REPOSITORIES.each do |attributes|
      repository = SymbolRepository.find_or_initialize_by(repo_key: attributes.fetch('repo_key'))
      repository.settings = {
        'name' => attributes.fetch('name'),
        'description' => attributes.fetch('description'),
        'url' => 'https://www.opensymbols.org/',
        'active' => true,
        'protected' => attributes.fetch('protected'),
        'repository_type' => 'local-demo',
        'default_attribution' => attribution
      }
      repository.save!
    end
  end

  def self.seed_symbols(asset_base_url)
    SYMBOLS.each_with_index do |(repo_key, symbol_key, name, description, filename, options), index|
      symbol = PictureSymbol.find_or_initialize_by(repo_key: repo_key, symbol_key: symbol_key)
      enabled = options.fetch('enabled', true)
      symbol.enabled = enabled
      symbol.random ||= 10_000 + index
      symbol.settings = {
        'name' => name,
        'description' => description,
        'enabled' => enabled,
        'image_url' => "#{asset_base_url}/#{filename}",
        'file_extension' => 'svg',
        'license' => 'CC0 1.0',
        'license_url' => 'https://creativecommons.org/publicdomain/zero/1.0/',
        'author' => 'OpenSymbols demo seed',
        'author_url' => 'https://www.opensymbols.org/',
        'source_url' => "#{asset_base_url}/#{filename}",
        'protected_symbol' => !!options['protected_symbol'],
        'unsafe_result' => !!options['unsafe_result'],
        'has_skin' => !!options['has_skin'],
        'has_variants' => !!options['has_variants'],
        'locales' => {'en' => {'name' => name, 'description' => description}}.merge(options.fetch('locales', {}))
      }
      symbol.save_without_indexing
    end
  end

  def self.seed_defaults
    repository = SymbolRepository.find_by!(repo_key: 'demo')
    DEFAULTS.each do |locale, defaults|
      modifier = RepositoryModifier.find_or_initialize_by(symbol_repository_id: repository.id, locale: locale)
      modifier.settings = {'defaults' => defaults}
      modifier.save!
    end
  end

  def self.seed_requests
    REQUESTS.each do |phrase, comment|
      request = SymbolRequest.find_or_initialize_by(phrase: phrase, locale: 'en')
      request.settings = {
        'history' => {
          'comments' => [{
            'user_id' => 'demo-seed',
            'text' => comment,
            'timestamp' => '2024-01-01T00:00:00Z'
          }]
        }
      }
      request.save!
    end
  end

  def self.seed_external_source
    source = ExternalSource.find_or_initialize_by(token: SOURCE_TOKEN)
    source.settings = {
      'name' => 'Local OpenSymbols development',
      'purpose' => 'Testing the local Rails and Hono stack',
      'approved' => true,
      'full_access' => true,
      'global_token' => true
    }
    source.save!
  end

  def self.refresh_repository_counts
    REPOSITORIES.each do |attributes|
      SymbolRepository.find_by!(repo_key: attributes.fetch('repo_key')).save!
    end
  end

  def self.default_asset_directory
    ENV.fetch('DEMO_ASSET_DIRECTORY', Rails.root.join('..', 'site', 'public', 'demo-symbols').expand_path)
  end

  def self.validate_assets!(asset_directory)
    asset_directory = Pathname.new(asset_directory.to_s)
    missing = SYMBOLS.map { |symbol| symbol[4] }.uniq.reject do |filename|
      asset_directory.join(filename).file?
    end
    raise "Missing demo symbol assets: #{missing.join(', ')}" if missing.any?
  end

  def self.attribution
    {
      'license' => 'CC0 1.0',
      'license_url' => 'https://creativecommons.org/publicdomain/zero/1.0/',
      'author_name' => 'OpenSymbols demo seed',
      'author_url' => 'https://www.opensymbols.org/'
    }
  end

  private_class_method :seed_repositories, :seed_symbols, :seed_defaults,
    :seed_requests, :seed_external_source, :refresh_repository_counts,
    :default_asset_directory, :validate_assets!, :attribution
end
