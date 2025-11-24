import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 8004;

app.listen(PORT, () => {
  console.log(`Community service đang chạy trên cổng ${PORT}`);
});