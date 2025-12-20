# Hướng Dẫn Thay Đổi Âm Thanh Thông Báo

## Hiện Tại
Ứng dụng đang sử dụng âm thanh được tạo bằng Web Audio API (2 nốt nhạc nhanh giống Facebook).

## Cách Thay Đổi Sang File MP3

### Bước 1: Tải File Âm Thanh
Tải file âm thanh notification từ các nguồn miễn phí:
- [Notification Sounds](https://notificationsounds.com/)
- [Freesound](https://freesound.org/)
- [Mixkit](https://mixkit.co/free-sound-effects/notification/)

### Bước 2: Đặt File Vào Thư Mục
Đặt file `notification.mp3` vào thư mục `frontend/public/`

### Bước 3: Cập Nhật Code
Trong file `frontend/src/contexts/NotificationsContext.jsx`, thay đổi:

```javascript
// Thay đổi từ Web Audio API
const audioContextRef = useRef(null);
useEffect(() => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) {
    audioContextRef.current = new AudioContext();
  }
}, []);

// Sang sử dụng file MP3
const audioRef = useRef(null);
useEffect(() => {
  audioRef.current = new Audio('/notification.mp3');
  audioRef.current.volume = 0.5;
}, []);
```

Và thay function `playNotificationSound`:

```javascript
const playNotificationSound = useCallback(() => {
  if (audioRef.current) {
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(err => {
      console.warn('Không thể phát âm thanh:', err);
    });
  }
}, []);
```

### Bước 4: Test
Reload trang và test notification để nghe âm thanh mới!
