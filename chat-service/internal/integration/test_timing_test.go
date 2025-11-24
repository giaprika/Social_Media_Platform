package integration

import (
	"log"
	"testing"
	"time"
)

// TestTiming is a helper to track and log test execution times
type TestTiming struct {
	testName  string
	startTime time.Time
}

// StartTestTiming creates a new test timing tracker
func StartTestTiming(t *testing.T) *TestTiming {
	timing := &TestTiming{
		testName:  t.Name(),
		startTime: time.Now(),
	}
	log.Printf("[TEST START] %s", timing.testName)
	return timing
}

// End logs the test execution time
func (tt *TestTiming) End() {
	duration := time.Since(tt.startTime)
	log.Printf("[TEST END] %s completed in %v", tt.testName, duration)
	
	// Warn if test takes longer than 5 seconds
	if duration > 5*time.Second {
		log.Printf("[WARNING] Test %s took longer than 5 seconds (%v)", tt.testName, duration)
	}
}

// TrackTestTime is a convenience function that can be deferred to automatically track test time
// Usage: defer TrackTestTime(t)()
func TrackTestTime(t *testing.T) func() {
	testName := t.Name()
	startTime := time.Now()
	log.Printf("[TEST START] %s", testName)
	
	return func() {
		duration := time.Since(startTime)
		log.Printf("[TEST END] %s completed in %v", testName, duration)
		
		// Warn if test takes longer than 5 seconds
		if duration > 5*time.Second {
			log.Printf("[WARNING] Test %s took longer than 5 seconds (%v)", testName, duration)
		}
	}
}
