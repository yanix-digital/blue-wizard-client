import { config as config_env } from "dotenv-safe";
config_env();

const config = {
  testMode: false,
  cursorInterval: 3,
  groups: [
    {
      id: 1143446,
      rolesets: {
        pending: 7475347,
        idc: 7476578,
        citizen: 7476582,
      },
    },
  ],
};

export default config;
