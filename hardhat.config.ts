import "dotenv/config"
import { HardhatUserConfig } from "hardhat/config"
import { parseEther } from "viem"

import "@nomicfoundation/hardhat-toolbox"
import "@nomicfoundation/hardhat-foundry"
import "@nomicfoundation/hardhat-network-helpers"
import "@nomicfoundation/hardhat-verify"

import "./tasks/deploy"
import "./tasks/setOperator"
import "./tasks/setSSVFactory"
import "./tasks/verify"

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
      forking: {
        url: "https://holesky.drpc.org",
        blockNumber: 2790017,
        accounts: [
          {
            privateKey: process.env.DEPLOYER_SK,
            balance: parseEther("1000"),
          },
          {
            privateKey: process.env.OWNER_SK,
            balance: parseEther("1000"),
          },
          {
            privateKey: process.env.FEE_SK,
            balance: parseEther("1000"),
          },
        ],
      },
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
}

export default config
