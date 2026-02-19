import { ethers } from "hardhat"
import {
  impersonateAccount,
  setBalance,
} from "@nomicfoundation/hardhat-network-helpers"
import {
  RewardFeeManager,
  FeeManagerFactory,
  SSVProxyFactory,
  GatewayEth2Deposit,
  SSVProxy,
} from "../../../typechain-types"
import {
  HOODI_SSV_NETWORK,
  HOODI_SSV_VIEWS,
  HOODI_DEPOSIT_CONTRACT,
  OPERATOR_IDS,
  OPERATOR_OWNER,
  DEFAULT_CLIENT_BASIS_POINTS,
  MAX_ETH_PER_VALIDATOR,
} from "../constants/hoodi"

interface E2EFixtureResult {
  rewardFeeManager: RewardFeeManager
  feeManagerFactory: FeeManagerFactory
  ssvProxyFactory: SSVProxyFactory
  gatewayEth2Deposit: GatewayEth2Deposit
  ssvProxy: SSVProxy
  owner: any
  service: any
  client: any
  referrer: any
  operator: any
}

export async function deployOnForkFixture(): Promise<E2EFixtureResult> {
  const [owner, service, client, referrer, operator] =
    await ethers.getSigners()

  // 1. Deploy FeeManagerFactory
  const FeeManagerFactory =
    await ethers.getContractFactory("FeeManagerFactory")
  const feeManagerFactory = await FeeManagerFactory.deploy(
    BigInt(DEFAULT_CLIENT_BASIS_POINTS)
  )

  // 2. Deploy GatewayEth2Deposit
  const GatewayEth2Deposit =
    await ethers.getContractFactory("GatewayEth2Deposit")
  const gatewayEth2Deposit = await GatewayEth2Deposit.deploy(
    await feeManagerFactory.getAddress(),
    HOODI_DEPOSIT_CONTRACT
  )

  // 3. Deploy Reference RewardFeeManager
  const RewardFeeManager =
    await ethers.getContractFactory("RewardFeeManager")
  const rewardFeeManager = await RewardFeeManager.deploy(
    await feeManagerFactory.getAddress(),
    service.address
  )

  // 4. Deploy SSVProxyFactory (using real Hoodi SSV addresses)
  const SSVProxyFactory =
    await ethers.getContractFactory("SSVProxyFactory")
  const ssvProxyFactory = await SSVProxyFactory.deploy(
    await gatewayEth2Deposit.getAddress(),
    await feeManagerFactory.getAddress(),
    await rewardFeeManager.getAddress(),
    HOODI_DEPOSIT_CONTRACT,
    HOODI_SSV_NETWORK,
    HOODI_SSV_VIEWS
  )

  // 5. Deploy SSVProxy (reference implementation using real SSV Network)
  const SSVProxy = await ethers.getContractFactory("SSVProxy")
  const ssvProxy = await SSVProxy.deploy(
    await ssvProxyFactory.getAddress(),
    HOODI_SSV_NETWORK
  )

  // 6. Setup contracts
  await ssvProxyFactory.setReferenceSSVProxy(await ssvProxy.getAddress())
  await feeManagerFactory.changeOperator(await ssvProxyFactory.getAddress())
  await feeManagerFactory.setGatewayEth2Deposit(
    await gatewayEth2Deposit.getAddress()
  )
  await feeManagerFactory.setSSVProxyFactory(
    await ssvProxyFactory.getAddress()
  )
  await ssvProxyFactory.setMaxEthAmountPerValidator(MAX_ETH_PER_VALIDATOR)
  await ssvProxyFactory.connect(owner).changeOperator(operator.address)
  await gatewayEth2Deposit.setSSVProxyFactory(
    await ssvProxyFactory.getAddress()
  )

  // 7. Impersonate operator owner to set whitelisting contract
  await impersonateAccount(OPERATOR_OWNER)
  await setBalance(OPERATOR_OWNER, ethers.parseEther("10"))
  const operatorOwnerSigner = await ethers.getSigner(OPERATOR_OWNER)

  const ssvNetwork = new ethers.Contract(
    HOODI_SSV_NETWORK,
    [
      "function setOperatorsWhitelistingContract(uint64[] calldata operatorIds, address whitelistingContract) external",
    ],
    operatorOwnerSigner
  )

  const operatorIdsU64 = OPERATOR_IDS.map((id) => BigInt(id))
  await ssvNetwork.setOperatorsWhitelistingContract(
    operatorIdsU64,
    await ssvProxyFactory.getAddress()
  )

  return {
    rewardFeeManager,
    feeManagerFactory,
    ssvProxyFactory,
    gatewayEth2Deposit,
    ssvProxy,
    owner,
    service,
    client,
    referrer,
    operator,
  }
}
