import config from "../../config/index.js";

export default {
  ...config,
  timeout: config.services.users.timeout,
  retries: 3,
  excludeList: config.services.users.excludeList,
};
