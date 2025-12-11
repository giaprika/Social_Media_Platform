package service

import (
	"strings"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// **Feature: auto-add-receivers, Property 5: Invalid UUID rejection**
// *For any* `receiver_ids` array containing at least one invalid UUID string,
// the System SHALL return an error and SHALL NOT modify any data.
// **Validates: Requirements 2.3**
func TestProperty_InvalidUUIDRejection(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100

	properties := gopter.NewProperties(parameters)

	// Generator for invalid UUID strings
	invalidUUIDGen := gen.OneGenOf(
		// Empty string
		gen.Const(""),
		// Random non-UUID strings
		gen.AlphaString().Map(func(s string) string {
			if s == "" {
				return "invalid"
			}
			return s
		}),
		// Partial UUIDs (too short)
		gen.Const("550e8400-e29b"),
		gen.Const("550e8400-e29b-41d4"),
		// UUIDs with invalid characters
		gen.Const("550e8400-e29b-41d4-a716-44665544000g"),
		gen.Const("550e8400-e29b-41d4-a716-44665544000!"),
		// UUIDs with wrong format
		gen.Const("550e8400e29b41d4a71644665544000"),  // Missing one char
		gen.Const("550e8400-e29b-41d4-a716-4466554400000"), // Extra char
		// Strings with spaces
		gen.Const(" 550e8400-e29b-41d4-a716-446655440000"),
		gen.Const("550e8400-e29b-41d4-a716-446655440000 "),
		// Strings with special characters
		gen.Const("550e8400-e29b-41d4-a716-446655440000\n"),
		gen.Const("550e8400-e29b-41d4-a716-446655440000\t"),
	)

	// Property: Any array containing at least one invalid UUID returns an error
	properties.Property("array with invalid UUID returns error", prop.ForAll(
		func(invalidUUID string) bool {
			// Test with single invalid UUID
			result, err := parseReceiverIDs([]string{invalidUUID})
			if err == nil {
				return false // Should have returned an error
			}
			if result != nil {
				return false // Should not return any result on error
			}
			// Error message should contain "invalid receiver_id"
			return strings.Contains(err.Error(), "invalid receiver_id")
		},
		invalidUUIDGen,
	))

	// Property: Array with mix of valid and invalid UUIDs returns error
	properties.Property("mixed array with invalid UUID returns error", prop.ForAll(
		func(invalidUUID string) bool {
			validUUID := "550e8400-e29b-41d4-a716-446655440000"
			
			// Test with invalid UUID first
			result, err := parseReceiverIDs([]string{invalidUUID, validUUID})
			if err == nil {
				return false
			}
			if result != nil {
				return false
			}
			
			// Test with invalid UUID last
			result, err = parseReceiverIDs([]string{validUUID, invalidUUID})
			if err == nil {
				return false
			}
			if result != nil {
				return false
			}
			
			return true
		},
		invalidUUIDGen,
	))

	// Property: Empty array returns nil without error (edge case - valid input)
	properties.Property("empty array returns nil without error", prop.ForAll(
		func(_ int) bool {
			result, err := parseReceiverIDs([]string{})
			return err == nil && result == nil
		},
		gen.Int(), // Dummy generator to run the test
	))

	// Property: Nil array returns nil without error (edge case - valid input)
	properties.Property("nil array returns nil without error", prop.ForAll(
		func(_ int) bool {
			result, err := parseReceiverIDs(nil)
			return err == nil && result == nil
		},
		gen.Int(), // Dummy generator to run the test
	))

	properties.TestingRun(t)
}
