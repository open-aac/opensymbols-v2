class IndexController < ApplicationController
  before_action :check_cookie

  def root; end

  def search;
    render 'root'
  end

  def api
    @token = ExternalSource.user_token(Date.today.to_s).sub(/^user:/, 'temp:')
  end

  def editor
    cross_origin
  end

  def badge_maker
    cross_origin
  end

  def word_maker
    cross_origin
  end

  def word_art
    cross_origin
  end

  def core
    return api_error(400, 'Not authorized') unless @admin
    @core_lists = SymbolRepository.core_lists
  end

end
