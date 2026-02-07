# Rails controller for proxying Insayt analytics events.
#
# Add to config/routes.rb:
#   post '/api/collect', to: 'insayt#collect'
#   get  '/api/stats',   to: 'insayt#stats'
#
# Set INSAYT_URL in your environment:
#   INSAYT_URL=http://localhost:3002

require "net/http"
require "json"
require "uri"

class InsaytController < ApplicationController
  skip_before_action :verify_authenticity_token, only: [:collect]

  INSAYT_URL = ENV.fetch("INSAYT_URL", "http://localhost:3002")

  # POST /api/collect
  # Proxy tracker events to Insayt server.
  def collect
    uri = URI("#{INSAYT_URL}/api/collect")
    response = Net::HTTP.post(
      uri,
      request.raw_post,
      "Content-Type" => "application/json"
    )

    render json: JSON.parse(response.body), status: response.code.to_i
  end

  # GET /api/stats
  # Proxy stats queries to Insayt server.
  def stats
    uri = URI("#{INSAYT_URL}/api/stats")
    uri.query = request.query_string

    req = Net::HTTP::Get.new(uri)
    req["Content-Type"] = "application/json"

    secret = request.headers["X-Insayt-Secret"]
    req["X-Insayt-Secret"] = secret if secret

    response = Net::HTTP.start(uri.hostname, uri.port) { |http| http.request(req) }

    render json: JSON.parse(response.body), status: response.code.to_i
  end
end

# ─── Standalone server-side tracking ─────────────────────────
#
# For tracking events from Ruby without Rails:
#
#   require_relative 'rails_proxy'
#   InsaytTracker.track_pageview('your-site-id', '/about')
#   InsaytTracker.track_event('your-site-id', 'purchase', { amount: 99 })

module InsaytTracker
  INSAYT_URL = ENV.fetch("INSAYT_URL", "http://localhost:3002")

  def self.track_pageview(site_id, url, visitor_id: "server", referrer: nil)
    send_event({
      type: "pageview",
      siteId: site_id,
      timestamp: (Time.now.to_f * 1000).to_i,
      sessionId: "server",
      visitorId: visitor_id,
      url: url,
      referrer: referrer,
    })
  end

  def self.track_event(site_id, name, properties = {}, visitor_id: "server")
    send_event({
      type: "event",
      siteId: site_id,
      timestamp: (Time.now.to_f * 1000).to_i,
      sessionId: "server",
      visitorId: visitor_id,
      name: name,
      properties: properties,
    })
  end

  def self.identify(site_id, user_id, traits = {}, visitor_id: "server")
    send_event({
      type: "identify",
      siteId: site_id,
      timestamp: (Time.now.to_f * 1000).to_i,
      sessionId: "server",
      visitorId: visitor_id,
      userId: user_id,
      traits: traits,
    })
  end

  def self.send_event(event)
    uri = URI("#{INSAYT_URL}/api/collect")
    response = Net::HTTP.post(
      uri,
      { events: [event] }.to_json,
      "Content-Type" => "application/json"
    )
    JSON.parse(response.body)
  end
end
