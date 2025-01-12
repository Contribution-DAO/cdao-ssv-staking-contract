import { parseEther, Address } from "viem"

interface NetworkConfig {
  ssvNetwork: Address
  ssvViews: Address
  ssvToken: Address
  nativeDeposit: Address
  maxSSVOperator: number
  maxSSVTokenPerValidator: bigint
  exchangeRate: bigint
  operatorsOwner: string[]
  operators: { id: number; owner: string }[]
}

export const defaultClientBasisPoints = 9000

export const networkConfigs: { [key: string]: NetworkConfig } = {
  kurtosis: {
    ssvNetwork: "0x9f5eaC3d8e082f47631F1551F1343F23cd427162",
    ssvViews: "0x72bCbB3f339aF622c28a26488Eed9097a2977404",
    ssvToken: "0x9f9F5Fd89ad648f2C000C954d8d9C87743243eC5",
    nativeDeposit: "0x4242424242424242424242424242424242424242",
    maxSSVOperator: 24,
    maxSSVTokenPerValidator: parseEther("30"),
    exchangeRate: 7539000000000000n,
    operatorsOwner: ["0x8943545177806ED17B9F23F0a21ee5948eCaa776"],
    operators: [
      {
        id: 1,
        owner: "0x8943545177806ED17B9F23F0a21ee5948eCaa776",
      },
      {
        id: 2,
        owner: "0x8943545177806ED17B9F23F0a21ee5948eCaa776",
      },
      {
        id: 3,
        owner: "0x8943545177806ED17B9F23F0a21ee5948eCaa776",
      },
      {
        id: 4,
        owner: "0x8943545177806ED17B9F23F0a21ee5948eCaa776",
      },
    ],
  },
  holesky: {
    ssvNetwork: "0x38A4794cCEd47d3baf7370CcC43B560D3a1beEFA", // Replace with actual Holesky addresses
    ssvViews: "0x352A18AEe90cdcd825d1E37d9939dCA86C00e281",
    ssvToken: "0xad45A78180961079BFaeEe349704F411dfF947C6",
    nativeDeposit: "0x4242424242424242424242424242424242424242",
    maxSSVOperator: 24,
    maxSSVTokenPerValidator: parseEther("30"),
    exchangeRate: 7539000000000000n,
    operatorsOwner: ["0x6f289fEBe36C1d34F30bBc65998E47B74b0E9e6d"],
    operators: [
      {
        id: 1217,
        owner: "0x6f289fEBe36C1d34F30bBc65998E47B74b0E9e6d",
      },
      {
        id: 1376,
        owner: "0x6f289fEBe36C1d34F30bBc65998E47B74b0E9e6d",
      },
      {
        id: 1377,
        owner: "0x6f289fEBe36C1d34F30bBc65998E47B74b0E9e6d",
      },
      {
        id: 1378,
        owner: "0x6f289fEBe36C1d34F30bBc65998E47B74b0E9e6d",
      },
    ],
  },
  mainnet: {
    ssvNetwork: "0x0", // Replace with actual mainnet addresses
    ssvViews: "0x0",
    ssvToken: "0x0",
    nativeDeposit: "0x0",
    maxSSVOperator: 24,
    maxSSVTokenPerValidator: parseEther("30"),
    exchangeRate: 7539000000000000n,
    operatorsOwner: [],
    operators: [],
  },
  hardhat: {
    ssvNetwork: "0x38A4794cCEd47d3baf7370CcC43B560D3a1beEFA",
    ssvViews: "0x352A18AEe90cdcd825d1E37d9939dCA86C00e281",
    ssvToken: "0xad45A78180961079BFaeEe349704F411dfF947C6",
    nativeDeposit: "0x4242424242424242424242424242424242424242",
    maxSSVOperator: 24,
    maxSSVTokenPerValidator: parseEther("30"),
    exchangeRate: 7539000000000000n,
    operatorsOwner: ["0x99fC13a5b46491D84494165FFaa540fFE7AB78D1"],
    operators: [
      {
        id: 848,
        owner: "0x99fC13a5b46491D84494165FFaa540fFE7AB78D1",
      },
      {
        id: 1376,
        owner: "0x99fC13a5b46491D84494165FFaa540fFE7AB78D1",
      },
      {
        id: 1377,
        owner: "0x99fC13a5b46491D84494165FFaa540fFE7AB78D1",
      },
      {
        id: 1378,
        owner: "0x99fC13a5b46491D84494165FFaa540fFE7AB78D1",
      },
    ],
  },
}
