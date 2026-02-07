# Rails controller for proxying Litemetrics analytics events.
#
# Add to config/routes.rb:
#   post '/api/collect', to: 'litemetrics#collect'
#   get  '/api/stats',   to: 'litemetrics#stats'
#
# Set LITEMETRICS_URL in your environment:
#   LITEMETRICS_URL=http://localhost:3002

require "net/http"
require "json"
require "uri"

class LitemetricsController < ApplicationController
  skip_before_action :verify_authenticity_token, only: [:collect]

  LITEMETRICS_URL = ENV.fetch("LITEMETRICS_URL", "http://localhost:3002")

  # POST /api/collect
  # Proxy tracker events to Litemetrics server.
  def collect
    uri = URI("#{LITEMETRICS_URL}/api/collect")
    response = Net::HTTP.post(
      uri,
      request.raw_post,
      "Content-Type" => "application/json"
    )

    render json: JSON.parse(response.body), status: response.code.to_i
  end

  # GET /api/stats
  # Proxy stats queries to Litemetrics server.
  def stats
    uri = URI("#{LITEMETRICS_URL}/api/stats")
    uri.query = request.query_string

    req = Net::HTTP::Get.new(uri)
    req["Content-Type"] = "application/json"

    secret = request.headers["X-Litemetrics-Secret"]
    req["X-Litemetrics-Secret"] = secret if secret

    response = Net::HTTP.start(uri.hostname, uri.port) { |http| http.request(req) }

    render json: JSON.parse(response.body), status: response.code.to_i
  end
end

# ─── Standalone server-side tracking ─────────────────────────
#
# For tracking events from Ruby without Rails:
#
#   require_relative 'rails_proxy'
#   LitemetricsTracker.track_pageview('your-site-id', '/about')
#   LitemetricsTracker.track_event('your-site-id', 'purchase', { amount: 99 })

module LitemetricsTracker
  LITEMETRICS_URL = ENV.fetch("LITEMETRICS_URL", "http://localhost:3002")

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
    uri = URI("#{LITEMETRICS_URL}/api/collect")
    response = Net::HTTP.post(
      uri,
      { events: [event] }.to_json,
      "Content-Type" => "application/json"
    )
    JSON.parse(response.body)
  end
end
