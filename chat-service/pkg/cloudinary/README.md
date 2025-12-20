# Cloudinary Package

This package provides utilities for integrating with Cloudinary for image uploads in the Chat Service.

## Overview

The package implements **Signed Upload** pattern where:
1. Client requests upload credentials from Backend
2. Backend generates a signature using Cloudinary API secret
3. Client uploads directly to Cloudinary using the signature
4. Client sends the resulting URL to Backend to save in database

## Usage

### Initialize Service

```go
import "chat-service/pkg/cloudinary"

service := cloudinary.NewService(
    "your-cloud-name",
    "your-api-key",
    "your-api-secret",
    "chat-images", // upload folder
)
```

### Generate Upload Credentials

```go
creds := service.GetUploadCredentials()

// Returns:
// - Signature: SHA1 hash for authentication
// - Timestamp: Unix timestamp (credentials expire after ~1 hour)
// - APIKey: Your Cloudinary API key
// - CloudName: Your Cloudinary cloud name
// - Folder: Target folder for uploads
```

### Check Configuration

```go
if service.IsConfigured() {
    // Cloudinary is ready to use
}
```

## API Endpoint

The Chat Service exposes an endpoint to get upload credentials:

```
GET /v1/upload-credentials
Authorization: Bearer <JWT_TOKEN>

Response:
{
  "signature": "abc123...",
  "timestamp": 1234567890,
  "api_key": "881854133592121",
  "cloud_name": "dj82qexva",
  "folder": "chat-images"
}
```

## Client-Side Upload

After getting credentials, the client uploads directly to Cloudinary:

```javascript
const formData = new FormData();
formData.append('file', file);
formData.append('api_key', credentials.api_key);
formData.append('timestamp', credentials.timestamp);
formData.append('signature', credentials.signature);
formData.append('folder', credentials.folder);

const response = await fetch(
  `https://api.cloudinary.com/v1_1/${credentials.cloud_name}/image/upload`,
  { method: 'POST', body: formData }
);

const result = await response.json();
const imageUrl = result.secure_url;
```

## Security

- Signatures are generated using SHA1 with the API secret
- Credentials include a timestamp and expire after ~1 hour (Cloudinary default)
- The API secret is never exposed to the client
- Only authenticated users can request upload credentials

## Configuration

Set these environment variables:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_UPLOAD_FOLDER=chat-images
```

## Testing

```bash
go test ./pkg/cloudinary/... -v
```
