import { ethers } from "hardhat"
import {
  RewardFeeManager,
  FeeManagerFactory,
  SSVProxyFactory,
  GatewayEth2Deposit,
  SSVProxy,
  MockSSVNetwork,
} from "../../typechain-types"
import {
  defaultClientBasisPoints,
  nativeDeposit,
  maxEthPerValidator,
} from "../constants"

interface DeployFixtureResult {
  rewardFeeManager: RewardFeeManager
  feeManagerFactory: FeeManagerFactory
  ssvProxyFactory: SSVProxyFactory
  gatewayEth2Deposit: GatewayEth2Deposit
  ssvProxy: SSVProxy
  mockSSVNetwork: MockSSVNetwork
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

  // 1. Deploy MockSSVNetwork
  const MockSSVNetwork = await ethers.getContractFactory("MockSSVNetwork")
  const mockSSVNetwork = await MockSSVNetwork.deploy()
  const mockSSVNetworkAddr = await mockSSVNetwork.getAddress()

  // 2. Deploy FeeManagerFactory
  const FeeManagerFactory = await ethers.getContractFactory("FeeManagerFactory")
  const feeManagerFactory = await FeeManagerFactory.deploy(
    BigInt(defaultClientBasisPoints)
  )

  // 3. Deploy GatewayEth2Deposit
  const GatewayEth2Deposit = await ethers.getContractFactory(
    "GatewayEth2Deposit"
  )
  const gatewayEth2Deposit = await GatewayEth2Deposit.deploy(
    await feeManagerFactory.getAddress(),
    nativeDeposit
  )

  // 4. Deploy Reference RewardFeeManager
  const RewardFeeManager = await ethers.getContractFactory("RewardFeeManager")
  const rewardFeeManager = await RewardFeeManager.deploy(
    await feeManagerFactory.getAddress(),
    service.address
  )

  // 5. Deploy SSVProxyFactory (use mockSSVNetwork for both ssvNetwork and ssvViews)
  const SSVProxyFactory = await ethers.getContractFactory("SSVProxyFactory")
  const ssvProxyFactory = await SSVProxyFactory.deploy(
    await gatewayEth2Deposit.getAddress(),
    await feeManagerFactory.getAddress(),
    await rewardFeeManager.getAddress(),
    nativeDeposit,
    mockSSVNetworkAddr,
    mockSSVNetworkAddr
  )

  // 6. Deploy SSVProxy (use mockSSVNetwork)
  const SSVProxy = await ethers.getContractFactory("SSVProxy")
  const ssvProxy = await SSVProxy.deploy(
    await ssvProxyFactory.getAddress(),
    mockSSVNetworkAddr
  )

  // 7. Setup contracts
  await ssvProxyFactory.setReferenceSSVProxy(await ssvProxy.getAddress())
  await feeManagerFactory.changeOperator(await ssvProxyFactory.getAddress())
  await feeManagerFactory.setGatewayEth2Deposit(
    await gatewayEth2Deposit.getAddress()
  )
  await feeManagerFactory.setSSVProxyFactory(await ssvProxyFactory.getAddress())
  await ssvProxyFactory.setMaxEthAmountPerValidator(
    BigInt(maxEthPerValidator)
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
    mockSSVNetwork,
    owner,
    service,
    client,
    referrer,
    operator,
    otherAccount,
  }
}
