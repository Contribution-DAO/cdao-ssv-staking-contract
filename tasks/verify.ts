import { task } from "hardhat/config"
import { readDeployment } from "./utils/saveDeployment"
import { defaultClientBasisPoints, networkConfigs } from "./config"

task("verify:all", "Verify all deployed contracts").setAction(
  async ({}, hre) => {
    const network = await hre.ethers.provider.getNetwork()
    const networkName = hre.network.name
    const networkConfig = networkConfigs[networkName]

    if (!networkConfig) {
      throw new Error(`No config found for network ${networkName}`)
    }

    const deployment = await readDeployment(Number(network.chainId))
    const [deployer, _, fee] = await hre.ethers.getSigners()

    console.log("Verifying FeeManagerFactory...")
    await hre.run("verify:verify", {
      address: deployment.FeeManagerFactory,
      constructorArguments: [defaultClientBasisPoints],
    })

    console.log("Verifying GatewayEth2Deposit...")
    await hre.run("verify:verify", {
      address: deployment.GatewayEth2Deposit,
      constructorArguments: [
        deployment.FeeManagerFactory,
        networkConfig.nativeDeposit,
      ],
    })

    console.log("Verifying ReferenceFeeManager...")
    await hre.run("verify:verify", {
      address: deployment.ReferenceFeeManager,
      constructorArguments: [deployment.FeeManagerFactory, fee.address],
    })

    console.log("Verifying SSVProxyFactory...")
    await hre.run("verify:verify", {
      address: deployment.SSVProxyFactory,
      constructorArguments: [
        deployment.GatewayEth2Deposit,
        deployment.FeeManagerFactory,
        deployment.ReferenceFeeManager,
        networkConfig.nativeDeposit,
        networkConfig.ssvNetwork,
        networkConfig.ssvViews,
        networkConfig.ssvToken,
      ],
    })

    console.log("Verifying SSVProxy...")
    await hre.run("verify:verify", {
      address: deployment.SSVProxy,
      constructorArguments: [
        deployment.SSVProxyFactory,
        networkConfig.ssvNetwork,
        networkConfig.ssvToken,
      ],
    })

    console.log("All contracts verified!")
  }
)
