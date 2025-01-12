import { task, subtask, types } from "hardhat/config"
import { defaultClientBasisPoints, networkConfigs } from "./config"
import { saveDeployment } from "./utils/saveDeployment"

task("deploy:all", "Deploy CDAO Staking Smart Contracts").setAction(
  async ({}, hre) => {
    // Triggering compilation
    await hre.run("compile")

    const network = await hre.ethers.provider.getNetwork()
    const networkName = network.name === "unknown" ? "kurtosis" : network.name
    const config = networkConfigs[networkName]

    if (!config) {
      throw new Error(`No configuration found for network: ${networkName}`)
    }

    const [deployer, _, fee] = await hre.ethers.getSigners()
    console.log(`Deploying contracts with the account:${deployer.address}`)
    console.log(`Network: ${networkName}`)

    const feeManagerFactoryAddr = await hre.run("deploy:feeManagerFactory", {
      defaultClientBasisPoints,
    })
    const gatewayEth2DepositAddr = await hre.run("deploy:gatewayEth2Deposit", {
      feeManagerFactoryAddr,
      nativeDeposit: config.nativeDeposit,
    })
    const refFeeAddr = await hre.run("deploy:refFee", {
      feeManagerFactoryAddr,
      fee: fee.address,
    })
    const ssvProxyFactoryAddr = await hre.run("deploy:ssvProxyFactory", {
      gatewayEth2DepositAddr,
      feeManagerFactoryAddr,
      refFee: refFeeAddr,
      nativeDeposit: config.nativeDeposit,
      ssvNetwork: config.ssvNetwork,
      ssvViews: config.ssvViews,
      ssvToken: config.ssvToken,
    })
    const ssvProxyAddr = await hre.run("deploy:ssvProxy", {
      ssvProxyFactoryAddr,
      ssvNetwork: config.ssvNetwork,
      ssvToken: config.ssvToken,
    })
    await hre.run("task:setup", {
      ssvProxyFactoryAddr,
      ssvProxyAddr,
      feeManagerFactoryAddr,
      gatewayEth2DepositAddr,
      maxSSVOperator: config.maxSSVOperator,
      operators: config.operators,
      exchangeRate: config.exchangeRate,
      maxSSVTokenPerValidator: config.maxSSVTokenPerValidator,
      operatorsOwner: config.operatorsOwner,
    })

    await saveDeployment(Number(network.chainId), networkName, {
      FeeManagerFactory: feeManagerFactoryAddr,
      GatewayEth2Deposit: gatewayEth2DepositAddr,
      ReferenceFeeManager: refFeeAddr,
      SSVProxyFactory: ssvProxyFactoryAddr,
      SSVProxy: ssvProxyAddr,
    })

    console.log("Finished Deployment process")
    console.log("SSVProxyFactory: ", ssvProxyFactoryAddr)
  }
)

subtask("deploy:feeManagerFactory", "Deploys FeeManagerFactory")
  .addParam(
    "defaultClientBasisPoints",
    "Basis Points of Client Fee",
    null,
    types.int
  )
  .setAction(async ({ defaultClientBasisPoints }, hre) => {
    console.log("========= Deploying FeeManagerFacotry ===========")
    const FeeManagerFactory = await hre.ethers.getContractFactory(
      "FeeManagerFactory"
    )
    const feeManagerFactory = await FeeManagerFactory.deploy(
      defaultClientBasisPoints
    )

    await feeManagerFactory.waitForDeployment()

    const feeManagerFactoryAddr = await feeManagerFactory.getAddress()

    console.log(
      "FeeManagerFactory deployed successfully: ",
      feeManagerFactoryAddr
    )

    return feeManagerFactoryAddr
  })

subtask("deploy:gatewayEth2Deposit", "Deploys GatewayEth2Deposit")
  .addParam(
    "feeManagerFactoryAddr",
    "Address of FeeManagerFactory Contract",
    null,
    types.string
  )
  .addParam(
    "nativeDeposit",
    "Ethereum Native Deposit Contract",
    null,
    types.string
  )
  .setAction(async ({ feeManagerFactoryAddr, nativeDeposit }, hre) => {
    console.log("========= Deploying GatewayEth2Deposit ===========")
    const GatewayEth2Deposit = await hre.ethers.getContractFactory(
      "GatewayEth2Deposit"
    )
    const gatewayEth2Deposit = await GatewayEth2Deposit.deploy(
      feeManagerFactoryAddr,
      nativeDeposit
    )

    await gatewayEth2Deposit.waitForDeployment()

    const gatewayEth2DepositAddr = await gatewayEth2Deposit.getAddress()

    console.log(
      "gatewayEth2DepositAddr deployed successfully: ",
      gatewayEth2DepositAddr
    )

    return gatewayEth2DepositAddr
  })

subtask("deploy:refFee", "Deploys Reference EL FeeManager")
  .addParam(
    "feeManagerFactoryAddr",
    "Address of FeeManagerFactory Contract",
    null,
    types.string
  )
  .addParam("fee", "Address of Fee Recipient", null, types.string)
  .setAction(async ({ feeManagerFactoryAddr, fee }, hre) => {
    console.log("========= Deploying referenceFeeManager ===========")
    const RewardFeeManager = await hre.ethers.getContractFactory(
      "RewardFeeManager"
    )
    const referenceFeeManager = await RewardFeeManager.deploy(
      feeManagerFactoryAddr,
      fee
    )

    await referenceFeeManager.waitForDeployment()

    const refFeeAddr = await referenceFeeManager.getAddress()

    console.log("referenceFeeManager deployed successfully: ", refFeeAddr)
    console.log("Parameters to verify referenceFeeManager:")
    console.log("refFee: ", refFeeAddr)
    console.log("fee: ", fee)

    return refFeeAddr
  })

subtask("deploy:ssvProxyFactory", "Deploys SSV Proxy Factory")
  .addParam(
    "gatewayEth2DepositAddr",
    "Address of GatewayEth2Deposit Contract",
    null,
    types.string
  )
  .addParam("refFee", "Address of EL Fee Instance Contract", null, types.string)
  .addParam("fee", "Address of Fee Recipient", null, types.string)
  .addParam(
    "nativeDeposit",
    "Ethereum Native Deposit Contract",
    null,
    types.string
  )
  .addParam("ssvNetwork", "Address of SSV Network Contract", null, types.string)
  .addParam("ssvViews", "Address of SSV Views Contract", null, types.string)
  .addParam("ssvToken", "Address of SSV Token Contract", null, types.string)
  .setAction(
    async (
      {
        gatewayEth2DepositAddr,
        feeManagerFactoryAddr,
        refFee,
        nativeDeposit,
        ssvNetwork,
        ssvViews,
        ssvToken,
      },
      hre
    ) => {
      console.log("========= Deploying SSVProxyFactory ===========")
      const SSVProxyFactory = await hre.ethers.getContractFactory(
        "SSVProxyFactory"
      )
      const ssvProxyFactory = await SSVProxyFactory.deploy(
        gatewayEth2DepositAddr,
        feeManagerFactoryAddr,
        refFee,
        nativeDeposit,
        ssvNetwork,
        ssvViews,
        ssvToken
      )

      console.log("Parameters to verify SSVProxyFactory:")
      console.log(
        gatewayEth2DepositAddr,
        feeManagerFactoryAddr,
        refFee,
        nativeDeposit,
        ssvNetwork,
        ssvViews,
        ssvToken
      )

      await ssvProxyFactory.waitForDeployment()

      const ssvProxyFactoryAddr = await ssvProxyFactory.getAddress()

      console.log(
        "ssvProxyFactory deployed successfully: ",
        ssvProxyFactoryAddr
      )

      return ssvProxyFactoryAddr
    }
  )

subtask("deploy:ssvProxy", "Deploys SsvProxy Contract")
  .addParam(
    "ssvProxyFactoryAddr",
    "Address SsvProxyFactory Contract",
    null,
    types.string
  )
  .addParam("ssvNetwork", "Address of SSVNetwork Contract", null, types.string)
  .addParam("ssvToken", "Address of SSVToken Contract", null, types.string)
  .setAction(async ({ ssvProxyFactoryAddr, ssvNetwork, ssvToken }, hre) => {
    console.log("========= Deploying SSVProxy ===========")
    const SSVProxy = await hre.ethers.getContractFactory("SSVProxy")
    const referenceSsvProxy = await SSVProxy.deploy(
      ssvProxyFactoryAddr,
      ssvNetwork,
      ssvToken
    )

    await referenceSsvProxy.waitForDeployment()

    const referenceSsvProxyAddr = await referenceSsvProxy.getAddress()

    console.log(
      "referenceSsvProxy deployed successfully: ",
      referenceSsvProxyAddr
    )

    return referenceSsvProxyAddr
  })

subtask("task:setup", "Setup SSVProxyFactory Contract")
  .addParam(
    "ssvProxyFactoryAddr",
    "Address of SsvProxyFactory Contract",
    null,
    types.string
  )
  .addParam("ssvProxyAddr", "Address of SSVProxy Contract", null, types.string)
  .addParam(
    "feeManagerFactoryAddr",
    "Address of FeeManagerFactory Contract",
    null,
    types.string
  )
  .addParam(
    "gatewayEth2DepositAddr",
    "Address of GatewayEth2Deposit Contract",
    null,
    types.string
  )
  .addParam("maxSSVOperator", "Maximum Operators for SSV", null, types.int)
  .addParam("operators", "Operators of SSV", null, types.any)
  .addParam("operatorsOwner", "Operators Owner of SSV", null, types.any)
  .addParam(
    "exchangeRate",
    "ExchangeRate of SSV/ETH in wei",
    null,
    types.bigint
  )
  .addParam(
    "maxSSVTokenPerValidator",
    "MaxSSVTokenPerValidator of SSV",
    null,
    types.bigint
  )
  .setAction(
    async (
      {
        ssvProxyFactoryAddr,
        ssvProxyAddr,
        feeManagerFactoryAddr,
        gatewayEth2DepositAddr,
        maxSSVOperator,
        operators,
        exchangeRate,
        maxSSVTokenPerValidator,
        operatorsOwner,
      },
      hre
    ) => {
      console.log("========= Seting up CDAO Staking =============")
      const ssvProxyFactory = await hre.ethers.getContractAt(
        "SSVProxyFactory",
        ssvProxyFactoryAddr
      )
      const feeManagerFactory = await hre.ethers.getContractAt(
        "FeeManagerFactory",
        feeManagerFactoryAddr
      )

      // Set SSV Proxy Reference to Factory
      console.log("========= Seting SSV Proxy Reference to Factory ===========")
      await ssvProxyFactory.setReferenceSSVProxy(ssvProxyAddr)

      // Set Operator to Fee Manager Factory
      console.log(
        "========= Seting Operator to Fee Manager Factory ==========="
      )
      await feeManagerFactory.changeOperator(ssvProxyFactoryAddr)

      // Set Eth2 Depositor to Fee Manager Factory
      console.log(
        "========= Setting Eth2 Depositor to Fee Manager Factory ==========="
      )
      await feeManagerFactory.setGatewayEth2Deposit(gatewayEth2DepositAddr)

      // Set SSVProxyFactory to Fee Manager Factory
      console.log(
        "========= Setting SSVProxyFactory to Fee Manager Factory ==========="
      )
      await feeManagerFactory.setSSVProxyFactory(ssvProxyFactoryAddr)

      // Set Maximum SSV Token per Validator
      console.log(
        "========= Setting Maximum SSV Token per Validator ==========="
      )
      await ssvProxyFactory.setMaxSsvTokenAmountPerValidator(
        maxSSVTokenPerValidator
      )

      console.log("Parameters to verify:")
      console.log("SSVProxyFactory: ", ssvProxyFactoryAddr)
      console.log("SSVProxy: ", ssvProxyAddr)
      console.log("FeeManagerFactory: ", feeManagerFactoryAddr)
      console.log("GatewayEth2Deposit: ", gatewayEth2DepositAddr)
    }
  )
