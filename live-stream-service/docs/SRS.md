Dưới đây là tài liệu **Software Requirements Specification (SRS)** chi tiết cho `live-service`.

Tài liệu này được thiết kế để bạn có thể đưa thẳng cho Dev (hoặc chính bạn) code luôn mà không cần tranh luận thêm về công nghệ.

-----

# SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

**Project:** Social Network - Live Streaming Module
**Service Name:** `live-service`
**Version:** 1.0
**Date:** 05/12/2025

-----

## 1\. TỔNG QUAN (OVERVIEW)

### 1.1. Mục đích

Xây dựng một Microservice độc lập (`live-service`) chịu trách nhiệm quản lý toàn bộ vòng đời của các phiên livestream. Service này đóng vai trò là **Control Plane**, điều khiển **Media Server (SRS)** thông qua cơ chế Webhook.

### 1.2. Phạm vi (Scope)

  * **Ingest (Đầu vào):** Hỗ trợ RTMP (cho OBS Studio) và WebRTC (cho trình duyệt).
  * **Playback (Đầu ra):** Hỗ trợ chuẩn HLS (HTTP Live Streaming) để phát qua CDN.
  * **Lưu trữ:** Không lưu video (No DVR), chỉ giữ file HLS tạm thời trong quá trình live.
  * **Quản lý:** Xác thực người live, quản lý trạng thái Online/Offline.

-----

## 2\. CÔNG NGHỆ & HẠ TẦNG (TECHNOLOGY STACK)

Đã chốt cứng các công nghệ sau:

| Thành phần | Công nghệ được chọn | Ghi chú |
| :--- | :--- | :--- |
| **Backend Language** | **Go (Golang)** | Sử dụng Gin hoặc Fiber framework. |
| **Media Server** | **SRS (Simple Realtime Server)** | Chạy Docker container (`ossrs/srs:5`). |
| **Ingest Protocol** | **RTMP & WebRTC** | Cổng 1935 (RTMP) và 1985/8000 (WebRTC). |
| **Delivery Protocol** | **HLS** (`.m3u8` + `.ts`) | Độ trễ chấp nhận được (10-15s), tương thích cao. |
| **Storage** | **Google Cloud Storage (GCS)** | Mount qua `gcsfuse` để lưu file tạm. |
| **CDN** | **Google Cloud CDN** | Phân phối nội dung toàn cầu. |
| **Database** | **PostgreSQL** | Lưu metadata phiên live. |

-----

## 3\. THIẾT KẾ CƠ SỞ DỮ LIỆU (DATABASE SCHEMA)

**Table:** `live_sessions`

| Column Name | Data Type | Constraint | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PK | ID duy nhất của phiên live. |
| `user_id` | UUID | Index | ID người tạo live (Link với User Service). |
| `stream_key` | VARCHAR(64) | Unique, Index | Chuỗi bí mật dùng để stream (ví dụ: `u123_sec_xf9`). |
| `title` | VARCHAR(255) | Not Null | Tiêu đề buổi live. |
| `status` | VARCHAR(20) | Default 'CREATED' | Enum: `CREATED`, `LIVE`, `ENDED`. |
| `ingress_url` | TEXT | | URL để OBS đẩy luồng vào. |
| `playback_url` | TEXT | | Link CDN `.m3u8` cho người xem. |
| `started_at` | TIMESTAMP | Nullable | Thời điểm bắt đầu nhận luồng video. |
| `ended_at` | TIMESTAMP | Nullable | Thời điểm kết thúc. |

-----

## 4\. LUỒNG NGHIỆP VỤ & API SPECIFICATION

### 4.1. Nhóm API cho Client (Frontend/Mobile)

#### 4.1.1. Tạo phiên Live (Create Stream)

  * **Endpoint:** `POST /api/v1/live/create`
  * **Auth:** Required (User Token)
  * **Request Body:**
    ```json
    { "title": "Chém gió buổi tối" }
    ```
  * **Logic:**
    1.  Tạo `stream_key` random (ví dụ dùng thư viện `crypto/rand` hoặc UUID).
    2.  Insert vào DB `live_sessions` với status `CREATED`.
    3.  Construct URL:
          * `rtmp_url`: `rtmp://<SRS_IP>/live`
          * `playback_url`: `https://<CDN_DOMAIN>/live/<stream_key>.m3u8`
  * **Response:**
    ```json
    {
      "stream_id": "uuid...",
      "stream_key": "user_1_secret123",
      "rtmp_server": "rtmp://1.2.3.4/live",
      "playback_url": "https://cdn.myapp.com/live/user_1_secret123.m3u8"
    }
    ```

#### 4.1.2. Lấy danh sách đang Live (List Streams)

  * **Endpoint:** `GET /api/v1/live/feed`
  * **Logic:** Query DB `WHERE status = 'LIVE' ORDER BY started_at DESC`.
  * **Response:** Array các object stream (bao gồm `playback_url`, `title`, `user_info`).

-----

### 4.2. Nhóm API Webhook (Dành cho SRS Server gọi)

*Lưu ý: Các API này chỉ nhận request từ IP của SRS Server (Whitelist IP).*

#### 4.2.1. Xác thực luồng (On Publish)

  * **Endpoint:** `POST /api/v1/callbacks/on_publish`
  * **Request Body (SRS gửi):**
    ```json
    {
      "action": "on_publish",
      "stream": "user_1_secret123",  // Đây chính là stream_key
      "ip": "1.2.3.4"
    }
    ```
  * **Logic:**
    1.  Lấy `stream` từ body (đây là `stream_key`).
    2.  Query DB: `SELECT * FROM live_sessions WHERE stream_key = ? AND status != 'ENDED'`.
    3.  Nếu không tìm thấy -\> Return HTTP 403 (Cắt luồng).
    4.  Nếu tìm thấy -\> Update DB: `status = 'LIVE'`, `started_at = NOW()`.
    5.  Return HTTP 200 (0).

#### 4.2.2. Kết thúc luồng (On Unpublish)

  * **Endpoint:** `POST /api/v1/callbacks/on_unpublish`
  * **Logic:**
    1.  Tìm session theo `stream_key`.
    2.  Update DB: `status = 'ENDED'`, `ended_at = NOW()`.
    3.  Return HTTP 200.

-----

## 5\. CẤU HÌNH MEDIA SERVER (SRS CONFIG)

Đây là file cấu hình `srs.conf` bắt buộc phải có để hệ thống hoạt động với các API trên.

```nginx
# File: srs.conf
listen              1935;
max_connections     1000;
daemon              off;
srs_log_tank        console;

# Cấu hình WebRTC (Để live trên web)
rtc_server {
    enabled on;
    listen 8000; # UDP port
    candidate $CANDIDATE; # Biến môi trường IP Public của VM
}

# Cấu hình Web Server cho HTTP-API
http_server {
    enabled         on;
    listen          8080;
    dir             ./objs/nginx/html;
}

# Cấu hình HTTP Callback (Webhook)
vhost __defaultVhost__ {
    # 1. Cấu hình WebRTC Ingest
    rtc {
        enabled     on;
        bframe      discard;
    }

    # 2. Cấu hình HLS Output (Ra thư mục đã mount GCS)
    hls {
        enabled         on;
        hls_fragment    5;
        hls_window      60;
        # Lưu file vào thư mục đã mount gcsfuse
        hls_path        /mnt/live_data; 
        hls_m3u8_file   [stream].m3u8;
        hls_ts_file     [stream]-[seq].ts;
        # Tự động xóa file cũ khi hết window (SRS tự dọn dẹp cục bộ)
        hls_cleanup     on; 
    }

    # 3. Cấu hình Webhook gọi về Code Go
    http_hooks {
        enabled         on;
        # Gọi API này khi bắt đầu có luồng video
        on_publish      http://<INTERNAL_IP_GO_SERVICE>:8080/api/v1/callbacks/on_publish;
        # Gọi API này khi tắt luồng
        on_unpublish    http://<INTERNAL_IP_GO_SERVICE>:8080/api/v1/callbacks/on_unpublish;
    }
}
```

-----

## 6\. KẾ HOẠCH TRIỂN KHAI (DEPLOYMENT PLAN)

### 6.1. Google Cloud Storage & CDN

1.  **Bucket:** `live-hls-bucket` (Region: Asia-Southeast1 - Singapore).
2.  **Lifecycle Rule:** Delete objects older than 1 day.
3.  **Permissions:** `Storage Object Viewer` cho `allUsers` (Public read).
4.  **CDN:** Tạo Load Balancer trỏ vào Bucket này.

### 6.2. Server VM (Compute Engine)

1.  **OS:** Ubuntu 22.04 LTS.
2.  **Firewall Rules:**
      * Allow TCP: 1935 (RTMP), 8080 (API), 1985 (SRS API).
      * Allow UDP: 8000 (WebRTC Media).
3.  **Setup Script:**
    ```bash
    # 1. Cài gcsfuse
    export GCSFUSE_REPO=gcsfuse-`lsb_release -c -s`
    echo "deb https://packages.cloud.google.com/apt $GCSFUSE_REPO main" | sudo tee /etc/apt/sources.list.d/gcsfuse.list
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -
    sudo apt-get update
    sudo apt-get install gcsfuse

    # 2. Tạo thư mục mount
    sudo mkdir -p /mnt/live_data
    sudo chown -R $USER /mnt/live_data

    # 3. Mount Bucket (Chạy nền)
    gcsfuse --implicit-dirs live-hls-bucket /mnt/live_data

    # 4. Chạy SRS Docker (Map thư mục mount vào container)
    docker run -d -p 1935:1935 -p 1985:1985 -p 8080:8080 -p 8000:8000/udp \
      -v /mnt/live_data:/mnt/live_data \
      -v $(pwd)/srs.conf:/usr/local/srs/conf/srs.conf \
      --env CANDIDATE="<IP_PUBLIC_CUA_VM>" \
      ossrs/srs:5 ./objs/srs -c conf/srs.conf
    ```
