import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";

import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-foundry";
import "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-verify";

import "./tasks/deploy";
import "./tasks/deployRewardFeeManager";
import "./tasks/setOperator";
import "./tasks/setSSVFactory";
import "./tasks/verify";

const config: HardhatUserConfig = {
  sourcify: {
    enabled: false,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "kurtosis",
        chainId: 3151908,
        urls: {
          apiURL: "http://15.235.214.56:8500/api",
          browserURL: "http://15.235.214.56:8500/",
        },
      },
      {
        network: "hoodi",
        chainId: 560048,
        urls: {
          apiURL: "https://hoodi.etherscan.io/api",
          browserURL: "https://hoodi.etherscan.io/",
        },
      },
    ],
  },
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "cancun",
        },
      },
    ],
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      ...(process.env.FORK_HOODI === "true"
        ? {
            forking: {
              url: process.env.HOODI_RPC_URL || "https://0xrpc.io/hoodi",
              blockNumber: process.env.HOODI_FORK_BLOCK
                ? parseInt(process.env.HOODI_FORK_BLOCK)
                : undefined,
            },
          }
        : {}),
    },
    holesky: {
      url: "https://holesky.drpc.org",
      chainId: 17000,
      accounts: [
        process.env.HOLESKY_DEPLOYER,
        process.env.HOLESKY_OWNER,
        process.env.HOLESKY_FEE,
      ],
    },
    kurtosis: {
      url: "http://15.235.214.56:8545/",
      chainId: 3151908,
      accounts: [
        process.env.HOLESKY_DEPLOYER,
        process.env.HOLESKY_OWNER,
        process.env.HOLESKY_FEE,
      ],
    },
    hoodi: {
      url: "https://0xrpc.io/hoodi",
      chainId: 560048,
      accounts: [
        process.env.HOODI_DEPLOYER,
        process.env.HOODI_OWNER,
        process.env.HOODI_FEE,
      ],
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    owner: {
      default: 1,
    },
    fee: {
      default: 2,
    },
  },
};

export default config;
