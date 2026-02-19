import { parseEther, Address } from "viem"

interface NetworkConfig {
  ssvNetwork: Address
  ssvViews: Address
  nativeDeposit: Address
  maxSSVOperator: number
  maxEthPerValidator: bigint
  exchangeRate: bigint
  operatorsOwner: string[]
  operators: { id: number; owner: string }[]
}

export const defaultClientBasisPoints = 9000

export const networkConfigs: { [key: string]: NetworkConfig } = {
  kurtosis: {
    ssvNetwork: "0x9f5eaC3d8e082f47631F1551F1343F23cd427162",
    ssvViews: "0x72bCbB3f339aF622c28a26488Eed9097a2977404",
    nativeDeposit: "0x4242424242424242424242424242424242424242",
    maxSSVOperator: 24,
    maxEthPerValidator: parseEther("1"),
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
    nativeDeposit: "0x4242424242424242424242424242424242424242",
    maxSSVOperator: 24,
    maxEthPerValidator: parseEther("1"),
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
  hoodi: {
    ssvNetwork: "0x58410Bef803ECd7E63B23664C586A6DB72DAf59c",
    ssvViews: "0x5AdDb3f1529C5ec70D77400499eE4bbF328368fe",
    nativeDeposit: "0x00000000219ab540356cBB839Cbe05303d7705Fa",
    maxSSVOperator: 24,
    maxEthPerValidator: parseEther("1"),
    exchangeRate: 7539000000000000n,
    operatorsOwner: ["0x5baCB7D77898b0F726103952616c4B56892a6D66"],
    operators: [
      {
        id: 182,
        owner: "0x5baCB7D77898b0F726103952616c4B56892a6D66",
      },
      {
        id: 183,
        owner: "0x5baCB7D77898b0F726103952616c4B56892a6D66",
      },
      {
        id: 184,
        owner: "0x5baCB7D77898b0F726103952616c4B56892a6D66",
      },
      {
        id: 185,
        owner: "0x5baCB7D77898b0F726103952616c4B56892a6D66",
      },
    ],
  },
  mainnet: {
    ssvNetwork: "0x0", // Replace with actual mainnet addresses
    ssvViews: "0x0",
    nativeDeposit: "0x0",
    maxSSVOperator: 24,
    maxEthPerValidator: parseEther("1"),
    exchangeRate: 7539000000000000n,
    operatorsOwner: [],
    operators: [],
  },
  hardhat: {
    ssvNetwork: "0x38A4794cCEd47d3baf7370CcC43B560D3a1beEFA",
    ssvViews: "0x352A18AEe90cdcd825d1E37d9939dCA86C00e281",
    nativeDeposit: "0x4242424242424242424242424242424242424242",
    maxSSVOperator: 24,
    maxEthPerValidator: parseEther("1"),
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
