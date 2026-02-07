// Package main demonstrates server-side event tracking with Go.
//
// Usage:
//
//	go run track.go
//
// Set INSAYT_URL environment variable to point to your Insayt server.
// Default: http://localhost:3002
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

var insaytURL = getEnv("INSAYT_URL", "http://localhost:3002")

type Event map[string]interface{}

type CollectPayload struct {
	Events []Event `json:"events"`
}

// TrackPageview sends a pageview event to the Insayt server.
func TrackPageview(siteID, url string, visitorID string) error {
	return sendEvent(Event{
		"type":      "pageview",
		"siteId":    siteID,
		"timestamp": time.Now().UnixMilli(),
		"sessionId": "server",
		"visitorId": visitorID,
		"url":       url,
	})
}

// TrackEvent sends a custom event to the Insayt server.
func TrackEvent(siteID, name string, properties map[string]interface{}, visitorID string) error {
	return sendEvent(Event{
		"type":       "event",
		"siteId":     siteID,
		"timestamp":  time.Now().UnixMilli(),
		"sessionId":  "server",
		"visitorId":  visitorID,
		"name":       name,
		"properties": properties,
	})
}

// Identify sends an identify event to the Insayt server.
func Identify(siteID, userID string, traits map[string]interface{}, visitorID string) error {
	return sendEvent(Event{
		"type":      "identify",
		"siteId":    siteID,
		"timestamp": time.Now().UnixMilli(),
		"sessionId": "server",
		"visitorId": visitorID,
		"userId":    userID,
		"traits":    traits,
	})
}

func sendEvent(event Event) error {
	payload := CollectPayload{Events: []Event{event}}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal error: %w", err)
	}

	resp, err := http.Post(
		insaytURL+"/api/collect",
		"application/json",
		bytes.NewBuffer(body),
	)
	if err != nil {
		return fmt.Errorf("request error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	return nil
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func main() {
	siteID := "your-site-id"

	// Track a pageview
	if err := TrackPageview(siteID, "/pricing", "server"); err != nil {
		fmt.Printf("Pageview error: %v\n", err)
	} else {
		fmt.Println("Pageview tracked")
	}

	// Track a custom event
	if err := TrackEvent(siteID, "purchase", map[string]interface{}{"amount": 99}, "server"); err != nil {
		fmt.Printf("Event error: %v\n", err)
	} else {
		fmt.Println("Event tracked")
	}

	// Identify a user
	if err := Identify(siteID, "user_123", map[string]interface{}{"name": "Jane", "plan": "pro"}, "server"); err != nil {
		fmt.Printf("Identify error: %v\n", err)
	} else {
		fmt.Println("User identified")
	}
}
