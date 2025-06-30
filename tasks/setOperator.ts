import { task } from "hardhat/config"
import { readDeployment } from "./utils/saveDeployment"
import { formatEther } from "ethers"

task("setOperator", "Set the operator for the SSV Proxy Factory")
  .addParam("operator", "The address of the operator")
  .setAction(async ({ operator }, hre) => {
    // Triggering compilation
    await hre.run("compile")
    const { ethers } = hre

    const [deployer] = await hre.ethers.getSigners()
    const balanceBefore = await hre.ethers.provider.getBalance(deployer.address)
    console.log(`Deploying contracts with the account:${deployer.address}`)

    const contracts = await readDeployment(
      Number((await ethers.provider.getNetwork()).chainId)
    )

    console.log("SSV Proxy Factory: ", contracts.SSVProxyFactory)
    console.log("Operator address: ", operator)

    const ssvProxyFactory = await ethers.getContractAt(
      "SSVProxyFactory",
      contracts.SSVProxyFactory
    )

    // Set new operator
    console.log("========= Setting new operator ===========")
    await ssvProxyFactory.changeOperator(operator)

    const balanceAfter = await hre.ethers.provider.getBalance(deployer.address)
    const ethUsed = balanceBefore - balanceAfter
    console.log("Total ETH used for deployment:", formatEther(ethUsed), "ETH")
  })
