import { task } from "hardhat/config"
import { readDeployment } from "./utils/saveDeployment"

task("setOperator", "Set the operator for the SSV Proxy Factory")
  .addParam("operator", "The address of the operator")
  .setAction(async ({ operator }, hre) => {
    // Triggering compilation
    await hre.run("compile")
    const { ethers } = hre

    const [deployer] = await hre.ethers.getSigners()
    console.log(`Deploying contracts with the account:${deployer.address}`)

    const contracts = await readDeployment(
      Number((await ethers.provider.getNetwork()).chainId)
    )

    const ssvProxyFactory = await ethers.getContractAt(
      "SSVProxyFactory",
      contracts.SSVProxyFactory
    )

    // Set new operator
    console.log("========= Setting new operator ===========")
    await ssvProxyFactory.changeOperator(operator)
  })
