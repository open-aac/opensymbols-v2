class SessionController < ApplicationController
  def token
    return api_error(400, {error: "secret required"}) if params['secret'].blank?

    if params['secret'].match(/^temp/)
      token = params['secret']
      check = ExternalSource.confirm_user_token(token.sub(/^temp:/, 'user:'))
      if check[:valid]
        user_id = params['user_id'] || Time.now.to_i.to_s
        access_token = ExternalSource.user_token(user_id).sub(/^user:/, 'temp:')
        render json: {access_token: access_token, expires: 24.hours.from_now.utc.iso8601}
      else
        return api_error 400, {error: "invalid token"}
      end
    else
      source = ExternalSource.find_by(token: params['secret'])
      if source
        user_id = params['user_id'] || Time.now.to_i.to_s
        render json: {access_token: source.access_token(Digest::MD5.hexdigest(user_id)[0, 10]), expires: 24.hours.from_now.utc.iso8601}
      else
        return api_error 400, {error: "invalid token"}
      end
    end
  end

  def generate_secret
    name = params['org_name'].to_s.strip
    email = params['org_email'].to_s.strip
    purpose = params['org_purpose'].to_s.strip
    unless name.present? && email.match?(/\A[^@\s]+@[^@\s]+\.[^@\s]+\z/) && purpose.present?
      return api_error(422, {error: 'organization, valid email, and purpose are required'})
    end

    source = ExternalSource.generate(name)
    source.settings['email'] = email
    source.settings['purpose'] = purpose
    source.settings['approved'] = false
    source.save!
    render json: {shared_secret: source.token}
  end

end
