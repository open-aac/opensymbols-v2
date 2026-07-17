FROM node:16-buster-slim AS node-runtime

FROM ruby:2.6.6

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

RUN gem install bundler -v 1.17.3 --no-document

COPY Gemfile Gemfile.lock ./
RUN bundle _1.17.3_ install --jobs 4 --retry 3

COPY . .

EXPOSE 3000

ENTRYPOINT ["bash", "./docker-entrypoint.sh"]
