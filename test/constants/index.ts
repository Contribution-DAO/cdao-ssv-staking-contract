import { parseEther, Address } from "viem"

export const ssvNetwork = "0x38A4794cCEd47d3baf7370CcC43B560D3a1beEFA"
export const ssvViews = "0x352A18AEe90cdcd825d1E37d9939dCA86C00e281"
export const defaultClientBasisPoints = 9000
export const nativeDeposit: Address =
  "0x4242424242424242424242424242424242424242"
export const maxSSVOperator = 24
export const maxEthPerValidator = parseEther("1")
export const exchangeRate = 7539000000000000n
export const operatorsOwner = ["0x6f289fEBe36C1d34F30bBc65998E47B74b0E9e6d"]
export const operators = [
  {
    id: 848,
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
]
