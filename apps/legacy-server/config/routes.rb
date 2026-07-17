Rails.application.routes.draw do
  # For details on the DSL available within this file, see http://guides.rubyonrails.org/routing.html
  get '/login' => 'admin#login'
  get '/admin' => 'admin#index'
  get '/admin/repositories/:repo_key' => 'index#repo'
  get '/admin/symbols/:repo_key/:symbol_key' => 'index#symbol'
  get '/stats' => 'index#stats'
  get '/auth/coughdrop/:id' => 'session#coughdrop_auth'
  get '/api/v1/token_check' => 'admin#token_check'
  post '/api/v2/token' => 'session#token'
  post '/api/v2/generate_secret' => 'session#generate_secret'

  scope 'api/v1', :module => 'api' do
    get "symbols/remote_search" => 'legacy#remote_search'
    get "repositories/:repo_key/symbols" => 'legacy#repo_symbols'
    get "symbols/search" => 'legacy#search'
    post "symbols/:id/use" => 'legacy#track_use'
    get "symbols/random" => 'legacy#random_symbols'
    get "symbols/data_proxy" => 'legacy#data_proxy'
#    options "symbols/proxy" => 'legacy#proxy'
    get "symbols/proxy" => 'legacy#proxy'
    get "symbols/requests" => 'legacy#requests'
    post "symbols/requests" => 'legacy#add_request'
  end

  scope 'api/v2', :module => 'api' do
    resources :repositories do
      post 'images'
      post 'defaults'
    end
    resources :symbols, :constraints => {:id => /[a-zA-Z0-9_-]+\/[a-zA-Z0-9_:%-]+/} do
      post 'safe'
      post 'skin'
      post 'boost'
      post 'default'
    end
    resources :requests
  end
end
