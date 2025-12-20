package middleware

import (
	"net"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// IPWhitelist creates a middleware that only allows requests from whitelisted IPs
// Used to secure webhook endpoints from SRS server
func IPWhitelist(allowedIPs ...string) gin.HandlerFunc {
	// Parse and normalize allowed IPs/CIDRs
	allowedNets := make([]*net.IPNet, 0)
	allowedAddrs := make([]net.IP, 0)

	for _, ip := range allowedIPs {
		ip = strings.TrimSpace(ip)
		if ip == "" {
			continue
		}

		// Check if it's a CIDR notation
		if strings.Contains(ip, "/") {
			_, ipNet, err := net.ParseCIDR(ip)
			if err == nil {
				allowedNets = append(allowedNets, ipNet)
			}
		} else {
			// Single IP address
			parsed := net.ParseIP(ip)
			if parsed != nil {
				allowedAddrs = append(allowedAddrs, parsed)
			}
		}
	}

	return func(c *gin.Context) {
		clientIP := getClientIP(c)
		if clientIP == nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":    1,
				"message": "Unable to determine client IP",
			})
			return
		}

		// Check if client IP is allowed
		if !isIPAllowed(clientIP, allowedAddrs, allowedNets) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":    1,
				"message": "IP not authorized",
			})
			return
		}

		c.Next()
	}
}

// getClientIP extracts the real client IP from the request
func getClientIP(c *gin.Context) net.IP {
	// Try X-Real-IP header first (set by reverse proxy)
	if realIP := c.GetHeader("X-Real-IP"); realIP != "" {
		if ip := net.ParseIP(realIP); ip != nil {
			return ip
		}
	}

	// Try X-Forwarded-For header
	if forwarded := c.GetHeader("X-Forwarded-For"); forwarded != "" {
		// Take the first IP in the chain
		ips := strings.Split(forwarded, ",")
		if len(ips) > 0 {
			if ip := net.ParseIP(strings.TrimSpace(ips[0])); ip != nil {
				return ip
			}
		}
	}

	// Fall back to RemoteAddr
	remoteAddr := c.Request.RemoteAddr
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		// RemoteAddr might not have port
		return net.ParseIP(remoteAddr)
	}
	return net.ParseIP(host)
}

// isIPAllowed checks if the IP is in the allowed list
func isIPAllowed(clientIP net.IP, allowedAddrs []net.IP, allowedNets []*net.IPNet) bool {
	// Check exact IP matches
	for _, allowed := range allowedAddrs {
		if clientIP.Equal(allowed) {
			return true
		}
	}

	// Check CIDR ranges
	for _, ipNet := range allowedNets {
		if ipNet.Contains(clientIP) {
			return true
		}
	}

	return false
}

// SRSWebhookWhitelist creates a middleware specifically for SRS webhook endpoints
// Allows localhost, Docker network IPs, and configured SRS server IP
func SRSWebhookWhitelist(srsServerIP string) gin.HandlerFunc {
	// Default allowed IPs for SRS webhooks
	allowedIPs := []string{
		"127.0.0.1",       // localhost IPv4
		"::1",             // localhost IPv6
		"172.16.0.0/12",   // Docker default network range
		"10.0.0.0/8",      // Private network range
		"192.168.0.0/16",  // Private network range
	}

	// Add configured SRS server IP
	if srsServerIP != "" && srsServerIP != "localhost" {
		allowedIPs = append(allowedIPs, srsServerIP)
	}

	return IPWhitelist(allowedIPs...)
}
