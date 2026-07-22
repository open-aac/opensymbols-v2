Rails.application.routes.draw do
  # For details on the DSL available within this file, see http://guides.rubyonrails.org/routing.html
  post '/api/v2/token' => 'session#token'
  post '/api/v2/generate_secret' => 'session#generate_secret'

  scope 'api/v2', :module => 'api' do
    get 'repositories' => 'repositories#index'
    get 'repositories/:id' => 'repositories#show'
    get 'symbols' => 'symbols#index'
    get 'symbols/:id' => 'symbols#show', :constraints => {:id => /[a-zA-Z0-9_-]+\/[a-zA-Z0-9_:%-]+/}
  end
end
