// +build ignore

// This script publishes test messages to Redis for broadcast latency testing.
// Run with: go run scripts/redis-broadcast-publisher.go
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

type ChatEvent struct {
	Type       string                 `json:"type"`
	Recipients []string               `json:"recipients"`
	Payload    map[string]interface{} `json:"payload"`
}

func main() {
	redisAddr := flag.String("redis", "localhost:6379", "Redis address")
	numMessages := flag.Int("n", 100, "Number of messages to publish")
	interval := flag.Duration("interval", 100*time.Millisecond, "Interval between messages")
	numRecipients := flag.Int("recipients", 100, "Number of recipients per message")
	flag.Parse()

	ctx := context.Background()
	client := redis.NewClient(&redis.Options{
		Addr: *redisAddr,
	})

	if err := client.Ping(ctx).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer client.Close()

	log.Printf("Publishing %d messages to Redis at %s", *numMessages, *redisAddr)
	log.Printf("Interval: %v, Recipients per message: %d", *interval, *numRecipients)

	for i := 0; i < *numMessages; i++ {
		// Build recipient list
		recipients := make([]string, *numRecipients)
		for j := 0; j < *numRecipients; j++ {
			recipients[j] = fmt.Sprintf("receiver-%d", j+1)
		}

		event := ChatEvent{
			Type:       "new_message",
			Recipients: recipients,
			Payload: map[string]interface{}{
				"message_id":   fmt.Sprintf("msg-%d", i),
				"content":      fmt.Sprintf("Test broadcast message %d", i),
				"sent_at":      time.Now().UnixMilli(),
				"server_time":  time.Now().UnixMilli(),
			},
		}

		data, err := json.Marshal(event)
		if err != nil {
			log.Printf("Failed to marshal event: %v", err)
			continue
		}

		if err := client.Publish(ctx, "chat:events", data).Err(); err != nil {
			log.Printf("Failed to publish: %v", err)
		} else {
			log.Printf("Published message %d to %d recipients", i+1, *numRecipients)
		}

		time.Sleep(*interval)
	}

	log.Println("Done publishing messages")
}
