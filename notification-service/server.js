import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  console.log(`Notification service đang chạy trên cổng ${PORT}`);
});
