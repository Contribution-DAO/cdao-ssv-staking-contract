import { ethers } from "hardhat"
import {
  RewardFeeManager,
  FeeManagerFactory,
  SSVProxyFactory,
  GatewayEth2Deposit,
  SSVProxy,
  MockSSVToken,
} from "../../typechain-types"
import {
  ssvNetwork,
  ssvViews,
  ssvToken as ssvTokenAddress,
  defaultClientBasisPoints,
  nativeDeposit,
  maxSSVTokenPerValidator,
} from "../constants"

interface DeployFixtureResult {
  rewardFeeManager: RewardFeeManager
  feeManagerFactory: FeeManagerFactory
  ssvProxyFactory: SSVProxyFactory
  gatewayEth2Deposit: GatewayEth2Deposit
  ssvProxy: SSVProxy
  ssvToken: MockSSVToken
  owner: any
  service: any
  client: any
  referrer: any
  operator: any
  otherAccount: any
}

export async function deployContractsFixture(): Promise<DeployFixtureResult> {
  const [owner, service, client, referrer, operator, otherAccount] =
    await ethers.getSigners()

  // 0. Deploy SSVToken
  const ssvToken = await ethers.getContractAt("MockSSVToken", ssvTokenAddress)

  // 1. Deploy FeeManagerFactory
  const FeeManagerFactory = await ethers.getContractFactory("FeeManagerFactory")
  const feeManagerFactory = await FeeManagerFactory.deploy(
    BigInt(defaultClientBasisPoints)
  )

  // 2. Deploy GatewayEth2Deposit
  const GatewayEth2Deposit = await ethers.getContractFactory(
    "GatewayEth2Deposit"
  )
  const gatewayEth2Deposit = await GatewayEth2Deposit.deploy(
    await feeManagerFactory.getAddress(),
    nativeDeposit
  )

  // 3. Deploy Reference RewardFeeManager
  const RewardFeeManager = await ethers.getContractFactory("RewardFeeManager")
  const rewardFeeManager = await RewardFeeManager.deploy(
    await feeManagerFactory.getAddress(),
    service.address
  )

  // 4. Deploy SSVProxyFactory
  const SSVProxyFactory = await ethers.getContractFactory("SSVProxyFactory")
  const ssvProxyFactory = await SSVProxyFactory.deploy(
    await gatewayEth2Deposit.getAddress(),
    await feeManagerFactory.getAddress(),
    await rewardFeeManager.getAddress(),
    nativeDeposit,
    ssvNetwork,
    ssvViews,
    ssvToken
  )

  // 5. Deploy SSVProxy
  const SSVProxy = await ethers.getContractFactory("SSVProxy")
  const ssvProxy = await SSVProxy.deploy(
    await ssvProxyFactory.getAddress(),
    ssvNetwork,
    ssvToken
  )

  // 6. Setup contracts
  await ssvProxyFactory.setReferenceSSVProxy(await ssvProxy.getAddress())
  await feeManagerFactory.changeOperator(await ssvProxyFactory.getAddress())
  await feeManagerFactory.setGatewayEth2Deposit(
    await gatewayEth2Deposit.getAddress()
  )
  await feeManagerFactory.setSSVProxyFactory(await ssvProxyFactory.getAddress())
  await ssvProxyFactory.setMaxSsvTokenAmountPerValidator(
    BigInt(maxSSVTokenPerValidator)
  )
  await ssvProxyFactory.connect(owner).changeOperator(operator.address)
  await gatewayEth2Deposit.setSSVProxyFactory(
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
    otherAccount,
    ssvToken,
  }
}
