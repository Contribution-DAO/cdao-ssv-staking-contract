import { task } from "hardhat/config"
import { readDeployment } from "./utils/saveDeployment"
import { formatEther } from "ethers"

task(
  "setSSVFactory",
  "Set the SSV Factory for the Deposit Proxy and Reference Fee Manager"
).setAction(async (_, hre) => {
  // Triggering compilation
  await hre.run("compile")
  const { ethers } = hre

  const [deployer] = await hre.ethers.getSigners()
  const balanceBefore = await hre.ethers.provider.getBalance(deployer.address)
  console.log(`Deploying contracts with the account:${deployer.address}`)

  const contracts = await readDeployment(
    Number((await ethers.provider.getNetwork()).chainId)
  )

  console.log("Gateway contract: ", contracts.GatewayEth2Deposit)
  console.log("SSV Proxy Factory", contracts.SSVProxyFactory)

  const gatewayEth2Deposit = await ethers.getContractAt(
    "GatewayEth2Deposit",
    contracts.GatewayEth2Deposit
  )

  // Set new operator
  console.log("========= Setting SSV Factory on Deposit Proxy ===========")
  await gatewayEth2Deposit.setSSVProxyFactory(contracts.SSVProxyFactory)

  const balanceAfter = await hre.ethers.provider.getBalance(deployer.address)
  const ethUsed = balanceBefore - balanceAfter
  console.log("Total ETH used for deployment:", formatEther(ethUsed), "ETH")
})
